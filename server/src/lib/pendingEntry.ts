import { db } from "../db/client.js";
import {
  pendingEntries,
  transactions,
  transactionSplits,
  groups,
  groupMembers,
} from "../db/schema.js";
import { eq, and, gt, isNull } from "drizzle-orm";
import { applyDelta, signedAmount } from "./accountDelta.js";
import { getUserFundGroupIds } from "./fundFilters.js";
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
};

export type Mode = "personal" | "group_split" | "fund";

export type Step =
  | "need_amount"
  | "need_account"
  | "need_participants"
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

export async function deletePending(pendingId: string): Promise<void> {
  try {
    await db.delete(pendingEntries).where(eq(pendingEntries.id, pendingId));
  } catch (err) {
    logger.error({ err, pendingId }, "failed to delete pending entry");
    throw err;
  }
}

/**
 * Pure function deciding the first unsatisfied step in a fixed order.
 * Fund mode skips need_account (the account is the group's fundAccountId,
 * resolved at commit time).
 */
export function computeNextStep(mode: Mode, draft: DraftData): Step {
  if (draft.amount === null || draft.amount <= 0) return "need_amount";
  if (mode !== "fund" && draft.accountId === null) return "need_account";
  if (mode === "group_split" && draft.participantUserIds.length === 0) {
    return "need_participants";
  }
  if (draft.category === null) return "need_category";
  return "confirm";
}

/**
 * Resolve the speaker's personal group, mirroring the personal path in
 * message.ts: member groups, excluding fund groups, prefer the one owned by
 * the user with no lineGroupId; fall back to the first non-fund member group.
 */
async function resolvePersonalGroupId(userId: string): Promise<string | null> {
  const fundGroupIdSet = new Set(await getUserFundGroupIds(userId));
  const rows = await db
    .select({ group: groups })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(eq(groupMembers.userId, userId));
  const userGroups = rows.map((r) => r.group).filter((g) => !fundGroupIdSet.has(g.id));
  if (userGroups.length === 0) return null;
  const personal = userGroups.find((g) => g.ownerUserId === userId && !g.lineGroupId);
  return (personal ?? userGroups[0]!).id;
}

type CommitResult = { txId: string } | { error: string };

/**
 * Perform the real write for a pending entry in one logical flow.
 * Validates, inserts the transaction (+ splits for group_split), applies the
 * account balance delta exactly once, then deletes the pending row.
 * Wrapped in db.transaction so a failure never leaves a half-written balance.
 */
export async function commitPending(pendingId: string): Promise<CommitResult> {
  let pending: PendingRow | null;
  try {
    pending = await getPending(pendingId);
  } catch (err) {
    logger.error({ err, pendingId }, "commitPending: failed to load pending");
    return { error: "load_failed" };
  }
  if (!pending) return { error: "not_found_or_expired" };

  const row = pending;
  const mode = row.mode as Mode;
  const draft = row.draft as DraftData;
  const amount = draft.amount;

  if (amount === null || amount <= 0) return { error: "missing_amount" };

  const txDate = draft.txDate ?? new Date().toISOString().slice(0, 10);

  try {
    const txId = await db.transaction(async (tx) => {
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
        if (!personalGroupId) throw new Error("personal_group_not_found");
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

      // Splits for group_split: equal split, last participant absorbs remainder.
      // (Rounding logic copied from message.ts lines ~498-508.)
      if (mode === "group_split" && draft.participantUserIds.length > 0) {
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

      // Apply the balance delta exactly once for the account touched.
      await applyDelta(accountId, signedAmount(draft.kind, amount), tx);

      return inserted.id;
    });

    await deletePending(pendingId);
    return { txId };
  } catch (err) {
    logger.error({ err, pendingId }, "commitPending: failed to commit");
    return { error: err instanceof Error ? err.message : "commit_failed" };
  }
}
