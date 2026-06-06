import { db } from "../db/client.js";
import {
  pendingEntries,
  transactions,
  transactionSplits,
  groups,
  aiRecords,
} from "../db/schema.js";
import { eq, and, gt, lt, isNull, desc } from "drizzle-orm";
import { applyDelta, signedAmount } from "./accountDelta.js";
import { resolvePersonalGroupId } from "./ensureDefaults.js";
import { logger } from "./logger.js";

export type DraftKind = "expense" | "income" | "transfer" | "fund_in" | "fund_out";

export type DraftData = {
  amount: number | null;
  kind: DraftKind;
  category: string | null;
  accountId: string | null;
  accountHint: string | null;
  note: string | null;
  txDate: string | null;
  merchant?: string | null;
  participantUserIds: string[];
  confidence: number;
  /** Set once the user has explicitly confirmed the split roster (group_split). */
  participantsConfirmed?: boolean;
  /** Set once category is resolved/skipped so we never re-ask for it. */
  categoryResolved?: boolean;
  /** Per-counterparty debts from the unified split parse (creditor = payer). */
  debts?: { userId: string; amount: number }[];
  /**
   * Debts still keyed by alias (no user rows yet). Shadow accounts are only
   * created at confirm time so cancelling a draft leaves no residue (T-305).
   */
  debtsByName?: { name: string; amount: number }[];
  /** The payer's own share for an explicit (non-equal) split. */
  myShare?: number | null;
  /** Resolved payment_methods.id when the unified flow asked for one. */
  paymentMethodId?: string | null;
  /** Backend-derived missing fields driving the unified follow-up flow. */
  missingFields?: string[];
  /** Set when a fund_expense parse matched one of the user's fund groups. */
  fundResolved?: boolean;
};

export type Mode = "personal" | "group_split" | "fund";

export type Step =
  | "need_amount"
  | "need_account"
  | "need_participants"
  | "need_debts"
  | "need_fund"
  | "need_category"
  | "confirm";

const TTL_MS = 30 * 60 * 1000; // 30 minutes

export type PendingRow = typeof pendingEntries.$inferSelect;

type UpsertArgs = {
  userId: string;
  groupId?: string | null;
  lineGroupId?: string | null;
  mode: Mode;
  step: Step;
  draft: DraftData;
  aiRecordId?: string | null;
};

/**
 * Create a pending row, replacing any existing active (non-expired) pending for
 * the same (userId, lineGroupId-or-null) so a new parse supersedes an old draft.
 */
export async function upsertPending(args: UpsertArgs): Promise<PendingRow> {
  const lineGroupId = args.lineGroupId ?? null;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_MS);
  try {
    // Delete any active pending for the same scope so the new parse supersedes it.
    const scope =
      lineGroupId === null
        ? and(eq(pendingEntries.userId, args.userId), isNull(pendingEntries.lineGroupId))
        : and(
            eq(pendingEntries.userId, args.userId),
            eq(pendingEntries.lineGroupId, lineGroupId),
          );
    await db.delete(pendingEntries).where(scope);

    const [row] = await db
      .insert(pendingEntries)
      .values({
        userId: args.userId,
        groupId: args.groupId ?? null,
        lineGroupId,
        mode: args.mode,
        step: args.step,
        draft: args.draft,
        aiRecordId: args.aiRecordId ?? null,
        createdAt: now,
        updatedAt: now,
        expiresAt,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return row;
  } catch (err) {
    logger.error({ err }, "failed to upsert pending entry");
    throw err;
  }
}

/** Fetch by id; return null if missing or expired. */
export async function getPending(pendingId: string): Promise<PendingRow | null> {
  try {
    const [row] = await db
      .select()
      .from(pendingEntries)
      .where(and(eq(pendingEntries.id, pendingId), gt(pendingEntries.expiresAt, new Date())))
      .limit(1);
    return row ?? null;
  } catch (err) {
    logger.error({ err, pendingId }, "failed to get pending entry");
    return null;
  }
}

/**
 * Return the newest non-expired pending row for a given context:
 * personal DM → lineGroupId null; group → that lineGroupId.
 * Used so a plain typed number can answer an active need_amount prompt.
 */
export async function getActivePendingForContext(
  userId: string,
  lineGroupId: string | null,
): Promise<PendingRow | null> {
  try {
    const scope =
      lineGroupId === null
        ? and(eq(pendingEntries.userId, userId), isNull(pendingEntries.lineGroupId))
        : and(
            eq(pendingEntries.userId, userId),
            eq(pendingEntries.lineGroupId, lineGroupId),
          );
    const [row] = await db
      .select()
      .from(pendingEntries)
      .where(and(scope, gt(pendingEntries.expiresAt, new Date())))
      .orderBy(desc(pendingEntries.createdAt))
      .limit(1);
    return row ?? null;
  } catch (err) {
    logger.error({ err, userId, lineGroupId }, "failed to get active pending for context");
    return null;
  }
}

/** Merge a partial draft into the stored draft jsonb, bumping updatedAt. */
export async function patchDraft(
  pendingId: string,
  partial: Partial<DraftData>,
): Promise<PendingRow | null> {
  try {
    const current = await getPending(pendingId);
    if (!current) return null;
    const merged: DraftData = { ...(current.draft as DraftData), ...partial };
    const [row] = await db
      .update(pendingEntries)
      .set({ draft: merged, updatedAt: new Date() })
      .where(eq(pendingEntries.id, pendingId))
      .returning();
    return row ?? null;
  } catch (err) {
    logger.error({ err, pendingId }, "failed to patch pending draft");
    throw err;
  }
}

export async function setStep(pendingId: string, step: Step): Promise<PendingRow | null> {
  try {
    const [row] = await db
      .update(pendingEntries)
      .set({ step, updatedAt: new Date() })
      .where(eq(pendingEntries.id, pendingId))
      .returning();
    return row ?? null;
  } catch (err) {
    logger.error({ err, pendingId }, "failed to set pending step");
    throw err;
  }
}

/**
 * Delete all expired pending rows (expiresAt < now). Returns the number of rows
 * removed. Non-throwing: returns 0 on failure so the scheduler stays alive.
 */
export async function purgeExpiredPending(): Promise<number> {
  try {
    const deleted = await db
      .delete(pendingEntries)
      .where(lt(pendingEntries.expiresAt, new Date()))
      .returning({ id: pendingEntries.id });
    return deleted.length;
  } catch (err) {
    logger.error({ err }, "failed to purge expired pending entries");
    return 0;
  }
}

export async function deletePending(pendingId: string): Promise<void> {
  try {
    await db.delete(pendingEntries).where(eq(pendingEntries.id, pendingId));
  } catch (err) {
    logger.error({ err, pendingId }, "failed to delete pending entry");
    throw err;
  }
}

/**
 * Pure function deciding the first unsatisfied step in a fixed order:
 * amount → fund/account → debts/participants → category → confirm.
 * Fund mode skips need_account (the account is the group's fundAccountId,
 * resolved at commit time). `missingFields` (backend-derived from the
 * unified parse) only ever ADDS asks; legacy drafts without it behave
 * exactly as before.
 */
export function computeNextStep(mode: Mode, draft: DraftData): Step {
  const missing = new Set(draft.missingFields ?? []);
  if (draft.amount === null || draft.amount <= 0) return "need_amount";
  if (mode === "fund") {
    if (missing.has("fund_name") && !draft.fundResolved) return "need_fund";
    return "confirm";
  }
  if (draft.accountId === null) return "need_account";
  if (mode === "group_split") {
    const hasDebts = (draft.debtsByName?.length ?? 0) > 0 || (draft.debts?.length ?? 0) > 0;
    if (missing.has("debt_distribution") && !hasDebts) return "need_debts";
    if (!draft.participantsConfirmed) return "need_participants";
  }
  if (draft.category === null && !draft.categoryResolved) {
    return "need_category";
  }
  return "confirm";
}

type CommitResult = { txId: string } | { error: string };

/**
 * Perform the real write for a pending entry in one logical flow.
 * Validates, inserts the transaction (+ splits for group_split), applies the
 * account balance delta exactly once, then deletes the pending row.
 * Wrapped in db.transaction so a failure never leaves a half-written balance.
 */
export async function commitPending(pendingId: string): Promise<CommitResult> {
  try {
    const txId = await db.transaction(async (tx) => {
      // Atomic claim: deleting the pending row INSIDE the transaction is the
      // lock. A concurrent confirm gets an empty RETURNING and bails, so the
      // same pending can never commit (and apply its balance delta) twice.
      const [row] = await tx
        .delete(pendingEntries)
        .where(and(eq(pendingEntries.id, pendingId), gt(pendingEntries.expiresAt, new Date())))
        .returning();
      if (!row) throw new Error("not_found_or_expired");

      const mode = row.mode as Mode;
      const draft = row.draft as DraftData;
      const amount = draft.amount;
      if (amount === null || amount <= 0) throw new Error("missing_amount");
      const txDate = draft.txDate ?? new Date().toISOString().slice(0, 10);
      // Resolve the account actually debited/credited and the owning group.
      let accountId: string;
      let groupId: string;

      if (mode === "fund") {
        // Re-resolve the group's fund account from groupId (or lineGroupId).
        let fundGroup = null as typeof groups.$inferSelect | null;
        if (row.groupId) {
          const [g] = await tx
            .select()
            .from(groups)
            .where(eq(groups.id, row.groupId))
            .limit(1);
          fundGroup = g ?? null;
        }
        if (!fundGroup && row.lineGroupId) {
          const [g] = await tx
            .select()
            .from(groups)
            .where(eq(groups.lineGroupId, row.lineGroupId))
            .limit(1);
          fundGroup = g ?? null;
        }
        if (!fundGroup) throw new Error("fund_group_not_found");
        if (!fundGroup.fundAccountId) throw new Error("fund_account_not_set");
        accountId = fundGroup.fundAccountId;
        groupId = fundGroup.id;
      } else if (mode === "group_split") {
        if (!draft.accountId) throw new Error("missing_account");
        if (!row.groupId) throw new Error("missing_group");
        accountId = draft.accountId;
        groupId = row.groupId;
      } else {
        // personal
        if (!draft.accountId) throw new Error("missing_account");
        const personalGroupId = await resolvePersonalGroupId(row.userId);
        accountId = draft.accountId;
        groupId = personalGroupId;
      }

      const [inserted] = await tx
        .insert(transactions)
        .values({
          groupId,
          accountId,
          amount: amount.toFixed(2),
          txDate,
          paidByUserId: row.userId,
          category: draft.category ?? null,
          kind: draft.kind,
          note: draft.note ?? null,
          source: "line_text",
          aiConfidence: draft.confidence != null ? draft.confidence.toFixed(3) : null,
        })
        .returning();
      if (!inserted) throw new Error("transaction_insert_failed");

      // Splits for group_split. Explicit per-person debts (unified split
      // parse) win over the legacy equal split; the payer absorbs
      // total − Σdebts as their own share.
      if (mode === "group_split" && draft.debts && draft.debts.length > 0) {
        // Validate per-person amounts: every debt must be positive and the
        // payer's residual share non-negative — corrupt drafts abort the
        // whole transaction instead of writing garbage splits.
        if (draft.debts.some((d) => !(d.amount > 0))) {
          throw new Error("invalid_debt_amount");
        }
        const debtSum = draft.debts.reduce((s, d) => s + d.amount, 0);
        const myShare =
          draft.myShare ?? Math.round((amount - debtSum) * 100) / 100;
        if (myShare < 0) throw new Error("invalid_debt_distribution");
        const rows = [
          // Drop the payer row only when their share is exactly zero.
          ...(myShare > 0
            ? [{ transactionId: inserted.id, userId: row.userId, amount: myShare.toFixed(2) }]
            : []),
          ...draft.debts.map((d) => ({
            transactionId: inserted.id,
            userId: d.userId,
            amount: d.amount.toFixed(2),
          })),
        ];
        await tx.insert(transactionSplits).values(rows);
      } else if (mode === "group_split" && draft.participantUserIds.length > 0) {
        // Legacy equal split, last participant absorbs remainder.
        // (Rounding logic copied from message.ts lines ~498-508.)
        const participants = draft.participantUserIds;
        const each = Math.floor((amount * 100) / participants.length) / 100;
        const rows = participants.map((uid, i) => ({
          transactionId: inserted.id,
          userId: uid,
          amount: (i === participants.length - 1
            ? Math.round((amount - each * (participants.length - 1)) * 100) / 100
            : each
          ).toFixed(2),
        }));
        await tx.insert(transactionSplits).values(rows);
      }

      // Dual-write explicit debts when the unified split parse provided
      // per-person amounts (creditor = payer). Same transaction → atomic.
      if (mode === "group_split" && draft.debts && draft.debts.length > 0) {
        const { insertDebtsForTransaction } = await import("./debts.js");
        await insertDebtsForTransaction(tx, {
          transactionId: inserted.id,
          creditorId: row.userId,
          debts: draft.debts,
        });
      }

      // Apply the balance delta exactly once for the account touched.
      await applyDelta(accountId, signedAmount(draft.kind, amount), tx);

      // Link the originating AI record (if any) to the committed transaction.
      // Best-effort: a failure here must never roll back the committed write.
      if (row.aiRecordId) {
        try {
          await tx
            .update(aiRecords)
            .set({ transactionId: inserted.id })
            .where(eq(aiRecords.id, row.aiRecordId));
        } catch (linkErr) {
          logger.warn(
            { err: linkErr, aiRecordId: row.aiRecordId, txId: inserted.id },
            "failed to link ai_record to transaction",
          );
        }
      }

      return inserted.id;
    });

    return { txId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "commit_failed";
    // Expected claim/validation outcomes are not logged as errors.
    if (message !== "not_found_or_expired" && message !== "missing_amount") {
      logger.error({ err, pendingId }, "commitPending: failed to commit");
    }
    return { error: message };
  }
}
