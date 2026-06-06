import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { debts, users } from "../db/schema.js";

export type DebtRow = typeof debts.$inferSelect;

export type DebtWrite = { userId: string; amount: number };

/**
 * Insert PENDING debts for a committed split transaction.
 * Runs inside the caller's db.transaction (pass `tx`) so a failed commit
 * never leaves orphan debts (T-225).
 */
export async function insertDebtsForTransaction(
  tx: Pick<typeof db, "insert">,
  args: { transactionId: string; creditorId: string; debts: DebtWrite[] },
): Promise<void> {
  if (args.debts.length === 0) return;
  await tx.insert(debts).values(
    args.debts.map((d) => ({
      transactionId: args.transactionId,
      creditorId: args.creditorId,
      debtorId: d.userId,
      amount: d.amount.toFixed(2),
    })),
  );
}

export async function settleDebt(debtId: string): Promise<void> {
  await db.update(debts).set({ status: "SETTLED" }).where(eq(debts.id, debtId));
}

export type OutstandingEntry = {
  userId: string;
  displayName: string | null;
  isVirtual: boolean;
  amount: number;
};

export type Outstanding = {
  owedToMe: OutstandingEntry[];
  iOwe: OutstandingEntry[];
};

/** Aggregate PENDING debts for a user, grouped per counterparty (T-224). */
export async function getOutstandingForUser(userId: string): Promise<Outstanding> {
  const owedRows = await db
    .select({
      userId: debts.debtorId,
      displayName: users.displayName,
      isVirtual: users.isVirtual,
      amount: debts.amount,
    })
    .from(debts)
    .innerJoin(users, eq(users.id, debts.debtorId))
    .where(and(eq(debts.creditorId, userId), eq(debts.status, "PENDING")));

  const oweRows = await db
    .select({
      userId: debts.creditorId,
      displayName: users.displayName,
      isVirtual: users.isVirtual,
      amount: debts.amount,
    })
    .from(debts)
    .innerJoin(users, eq(users.id, debts.creditorId))
    .where(and(eq(debts.debtorId, userId), eq(debts.status, "PENDING")));

  return { owedToMe: aggregate(owedRows), iOwe: aggregate(oweRows) };
}

function aggregate(
  rows: { userId: string; displayName: string | null; isVirtual: boolean; amount: string }[],
): OutstandingEntry[] {
  const byUser = new Map<string, OutstandingEntry>();
  for (const row of rows) {
    const existing = byUser.get(row.userId);
    const amount = Number(row.amount);
    if (existing) {
      existing.amount = Math.round((existing.amount + amount) * 100) / 100;
    } else {
      byUser.set(row.userId, {
        userId: row.userId,
        displayName: row.displayName,
        isVirtual: row.isVirtual,
        amount,
      });
    }
  }
  return [...byUser.values()];
}
