import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { groups, groupMembers, accounts } from "../db/schema.js";

/**
 * Deterministically resolve the user's PERSONAL group — the one created by
 * ensureUserDefaults: type "shared", ownerUserId = userId, lineGroupId IS NULL.
 *
 * Rule: pick the group where ownerUserId = userId AND lineGroupId IS NULL,
 * ordered by createdAt ascending (oldest first) and take the first. This is
 * stable regardless of how many real LINE groups the user also belongs to.
 * If none exists, create it via the same path ensureUserDefaults uses.
 */
export async function resolvePersonalGroupId(userId: string): Promise<string> {
  const [existing] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(
      and(
        eq(groups.ownerUserId, userId),
        isNull(groups.lineGroupId),
        // DM-created ledgers are type split/fund; the personal group is the
        // shared one ensureUserDefaults creates. Without this filter a
        // user-created group could be mistaken for the personal ledger.
        eq(groups.type, "shared"),
      ),
    )
    .orderBy(asc(groups.createdAt))
    .limit(1);
  if (existing) return existing.id;

  // None exists: create it the same shape ensureUserDefaults creates, and make
  // the user the owner member.
  const [g] = await db
    .insert(groups)
    .values({ type: "shared", name: "我的記帳", ownerUserId: userId })
    .returning();
  if (!g) throw new Error("failed to create personal group");
  await db
    .insert(groupMembers)
    .values({ groupId: g.id, userId, role: "owner", joinedVia: "manual" })
    .onConflictDoNothing();
  return g.id;
}

export async function ensureUserDefaults(userId: string): Promise<void> {
  const [m] = await db
    .select()
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId))
    .limit(1);
  if (!m) {
    const [g] = await db
      .insert(groups)
      .values({ type: "shared", name: "我的記帳", ownerUserId: userId })
      .returning();
    if (g) {
      await db.insert(groupMembers).values({
        groupId: g.id,
        userId,
        role: "owner",
        joinedVia: "manual",
      });
    }
  }

  const [a] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .limit(1);
  if (!a) {
    await db.insert(accounts).values({ userId, name: "錢包現金", type: "cash" });
  }
}
