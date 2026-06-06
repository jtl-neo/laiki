import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { accounts, groupMembers, groups, transactions, users } from "../db/schema.js";
import { pushToMany } from "../line/push.js";
import { buildFundChangeFlex } from "../line/flex/fundChange.js";
import { logger } from "./logger.js";

/**
 * Post-commit cross-account notifications. Best-effort by contract: a
 * notification failure must never roll back or mask a committed write —
 * callers fire-and-forget (or await with .catch).
 */
export async function notifyFundChange(txId: string): Promise<void> {
  try {
    const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId)).limit(1);
    if (!tx) return;
    const [group] = await db.select().from(groups).where(eq(groups.id, tx.groupId)).limit(1);
    if (!group || group.type !== "fund" || !group.fundAccountId) return;

    const [account] = await db
      .select({ balance: accounts.balance })
      .from(accounts)
      .where(eq(accounts.id, group.fundAccountId))
      .limit(1);
    const [by] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, tx.paidByUserId))
      .limit(1);
    const members = await db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, group.id));

    const card = buildFundChangeFlex({
      fundName: group.name,
      description: tx.note,
      amount: Number(tx.amount),
      isOut: tx.kind !== "fund_in",
      byDisplayName: by?.displayName ?? "成員",
      balanceAfter: Number(account?.balance ?? 0),
    });

    await pushToMany(
      members.map((m) => m.userId),
      [card],
    );
  } catch (err) {
    logger.warn({ err, txId }, "notifyFundChange failed");
  }
}

/** Tell the shadow's creator their friend claimed the binding code. */
export async function notifyClaim(creatorId: string, claimerName: string | null): Promise<void> {
  try {
    await pushToMany(
      [creatorId],
      [
        {
          type: "text",
          text: `🔗 ${claimerName ?? "好友"} 已輸入綁定碼，認領了你幫他記的帳目！`,
        },
      ],
    );
  } catch (err) {
    logger.warn({ err, creatorId }, "notifyClaim failed");
  }
}
