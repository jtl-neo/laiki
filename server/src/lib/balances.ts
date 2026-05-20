import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { transactions, transactionSplits } from "../db/schema.js";

export async function computeBalances(
  groupId: string,
): Promise<{ userId: string; net: number }[]> {
  const txs = await db
    .select({
      id: transactions.id,
      kind: transactions.kind,
      amount: transactions.amount,
      paidByUserId: transactions.paidByUserId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.groupId, groupId),
        inArray(transactions.kind, ["expense", "income"]),
      ),
    );

  if (txs.length === 0) return [];

  const txIds = txs.map((t) => t.id);
  const splits = await db
    .select({
      transactionId: transactionSplits.transactionId,
      userId: transactionSplits.userId,
      amount: transactionSplits.amount,
    })
    .from(transactionSplits)
    .where(inArray(transactionSplits.transactionId, txIds));

  const splitsByTx = new Map<string, { userId: string; amount: number }[]>();
  for (const s of splits) {
    const arr = splitsByTx.get(s.transactionId) ?? [];
    arr.push({ userId: s.userId, amount: Number(s.amount) });
    splitsByTx.set(s.transactionId, arr);
  }

  const net = new Map<string, number>();
  const add = (userId: string, delta: number) => {
    net.set(userId, (net.get(userId) ?? 0) + delta);
  };

  for (const tx of txs) {
    const amount = Number(tx.amount);
    const txSplits = splitsByTx.get(tx.id) ?? [];

    if (tx.kind === "expense") {
      add(tx.paidByUserId, amount);
      if (txSplits.length === 0) {
        add(tx.paidByUserId, -amount);
      } else {
        for (const s of txSplits) add(s.userId, -s.amount);
      }
    } else if (tx.kind === "income") {
      add(tx.paidByUserId, -amount);
      if (txSplits.length === 0) {
        add(tx.paidByUserId, amount);
      } else {
        for (const s of txSplits) add(s.userId, s.amount);
      }
    }
  }

  return Array.from(net.entries())
    .map(([userId, n]) => ({ userId, net: n }))
    .sort((a, b) => b.net - a.net);
}
