import { randomInt } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { bindingCodes, debts, groupMembers, transactions, transactionSplits, users } from "../db/schema.js";
import { logger } from "./logger.js";

const CODE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const CODE_GEN_ATTEMPTS = 5;

/**
 * Resolve an alias to a user id, lazily creating a shadow (virtual)
 * account on first mention. Aliases are scoped per creator: my "a" is
 * never your "a". A previously-claimed shadow (now a real user, still
 * created_by me) resolves to that real user — no duplicate shadow.
 */
export async function resolveOrCreateShadow(
  creatorUserId: string,
  displayName: string,
): Promise<string> {
  const name = displayName.trim();
  if (!name) throw new Error("resolveOrCreateShadow: empty name");

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.createdBy, creatorUserId), eq(users.displayName, name)))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(users)
    .values({
      lineUserId: null,
      displayName: name,
      isVirtual: true,
      createdBy: creatorUserId,
    })
    .returning({ id: users.id });
  if (!created) throw new Error("resolveOrCreateShadow: insert failed");
  return created.id;
}

/**
 * Generate a 6-digit PIN for claiming a shadow account. Retries on the
 * (unlikely) code collision; codes expire after 24h.
 */
export async function generateBindingCode(
  virtualUserId: string,
  creatorUserId: string,
): Promise<string> {
  for (let attempt = 0; attempt < CODE_GEN_ATTEMPTS; attempt++) {
    const code = String(randomInt(100000, 1000000));
    try {
      await db.insert(bindingCodes).values({
        code,
        virtualUserId,
        createdBy: creatorUserId,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      });
      return code;
    } catch (err) {
      // PK collision → try another code; anything else bubbles up.
      if (attempt === CODE_GEN_ATTEMPTS - 1) throw err;
    }
  }
  throw new Error("generateBindingCode: exhausted attempts");
}

export type FriendEntry = {
  userId: string;
  displayName: string | null;
  isVirtual: boolean;
  /** Σ of PENDING debts this friend owes the creator. */
  outstanding: number;
};

/**
 * Everyone this user has recorded against (shadow or claimed), with their
 * outstanding PENDING total. Drives the 管理好友 card.
 */
export async function listFriendsWithOutstanding(creatorId: string): Promise<FriendEntry[]> {
  const rows = await db
    .select({
      userId: users.id,
      displayName: users.displayName,
      isVirtual: users.isVirtual,
      outstanding: sql<string>`coalesce(sum(${debts.amount}) filter (
        where ${debts.creditorId} = ${creatorId} and ${debts.status} = 'PENDING'
      ), 0)`,
    })
    .from(users)
    .leftJoin(debts, eq(debts.debtorId, users.id))
    .where(eq(users.createdBy, creatorId))
    .groupBy(users.id, users.displayName, users.isVirtual);
  return rows.map((r) => ({
    userId: r.userId,
    displayName: r.displayName,
    isVirtual: r.isVirtual,
    outstanding: Number(r.outstanding),
  }));
}

export type ClaimResult =
  | { ok: true; userId: string; merged: boolean; creatorId: string }
  | { ok: false; error: "not_found" | "expired" | "used" | "self_claim" | "already_claimed" };

/**
 * Claim a binding code with a real LINE user id.
 * - Brand-new claimer: the shadow row itself awakens (line_user_id filled,
 *   is_virtual=false) so every FK keeps pointing at the same UUID (T-217).
 * - Claimer already exists as a real user: merge the shadow INTO the real
 *   user — repoint debts / splits / transactions / group memberships, then
 *   delete the shadow (T-219).
 */
export async function claimBindingCode(
  code: string,
  realLineUserId: string,
  displayName: string | null,
): Promise<ClaimResult> {
  const [row] = await db.select().from(bindingCodes).where(eq(bindingCodes.code, code)).limit(1);
  if (!row) return { ok: false, error: "not_found" };
  if (row.usedAt) return { ok: false, error: "used" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, error: "expired" };

  const [creator] = await db
    .select({ lineUserId: users.lineUserId })
    .from(users)
    .where(eq(users.id, row.createdBy))
    .limit(1);
  if (creator?.lineUserId === realLineUserId) return { ok: false, error: "self_claim" };

  const [shadow] = await db.select().from(users).where(eq(users.id, row.virtualUserId)).limit(1);
  if (!shadow) return { ok: false, error: "not_found" };
  if (!shadow.isVirtual) return { ok: false, error: "already_claimed" };

  const [existingReal] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.lineUserId, realLineUserId))
    .limit(1);

  try {
    if (existingReal) {
      // Merge shadow → existing real user inside one transaction.
      await db.transaction(async (tx) => {
        const shadowId = shadow.id;
        const realId = existingReal.id;
        await tx.update(debts).set({ debtorId: realId }).where(eq(debts.debtorId, shadowId));
        await tx
          .update(debts)
          .set({ creditorId: realId })
          .where(eq(debts.creditorId, shadowId));
        await tx
          .update(transactions)
          .set({ paidByUserId: realId })
          .where(eq(transactions.paidByUserId, shadowId));
        // Splits / memberships have composite PKs that can collide when both
        // rows already exist — move what we can, drop the leftovers.
        await tx.execute(sql`
          UPDATE transaction_splits ts SET user_id = ${realId}
          WHERE ts.user_id = ${shadowId}
            AND NOT EXISTS (
              SELECT 1 FROM transaction_splits other
              WHERE other.transaction_id = ts.transaction_id AND other.user_id = ${realId}
            )`);
        await tx.delete(transactionSplits).where(eq(transactionSplits.userId, shadowId));
        await tx.execute(sql`
          UPDATE group_members gm SET user_id = ${realId}
          WHERE gm.user_id = ${shadowId}
            AND NOT EXISTS (
              SELECT 1 FROM group_members other
              WHERE other.group_id = gm.group_id AND other.user_id = ${realId}
            )`);
        await tx.delete(groupMembers).where(eq(groupMembers.userId, shadowId));
        await tx
          .update(bindingCodes)
          .set({ usedAt: new Date() })
          .where(eq(bindingCodes.code, code));
        await tx.delete(users).where(eq(users.id, shadowId));
      });
      return { ok: true, userId: existingReal.id, merged: true, creatorId: row.createdBy };
    }

    // Fresh claimer: awaken the shadow row in place.
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          lineUserId: realLineUserId,
          isVirtual: false,
          displayName: displayName ?? shadow.displayName,
          updatedAt: new Date(),
        })
        .where(eq(users.id, shadow.id));
      await tx
        .update(bindingCodes)
        .set({ usedAt: new Date() })
        .where(eq(bindingCodes.code, code));
    });
    return { ok: true, userId: shadow.id, merged: false, creatorId: row.createdBy };
  } catch (err) {
    logger.error({ err, code }, "claimBindingCode failed");
    throw err;
  }
}
