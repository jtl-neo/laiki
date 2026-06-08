import { and, desc, eq } from "drizzle-orm";
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

export type FriendDebt = {
  id: string;
  transactionId: string;
  amount: number;
  note: string | null;
  txDate: string | null;
  createdAt: Date;
};

/** PENDING debts a specific friend owes the creditor, newest first. */
export async function listFriendDebts(
  creditorId: string,
  debtorId: string,
): Promise<FriendDebt[]> {
  const { transactions } = await import("../db/schema.js");
  const rows = await db
    .select({
      id: debts.id,
      transactionId: debts.transactionId,
      amount: debts.amount,
      note: transactions.note,
      txDate: transactions.txDate,
      createdAt: debts.createdAt,
    })
    .from(debts)
    .leftJoin(transactions, eq(transactions.id, debts.transactionId))
    .where(
      and(
        eq(debts.creditorId, creditorId),
        eq(debts.debtorId, debtorId),
        eq(debts.status, "PENDING"),
      ),
    )
    .orderBy(desc(debts.createdAt));
  return rows.map((r) => ({
    id: r.id,
    transactionId: r.transactionId,
    amount: Number(r.amount),
    note: r.note,
    txDate: r.txDate,
    createdAt: r.createdAt,
  }));
}

/**
 * Settle a friend's outstanding debt. Without `debtId`, settles ALL of the
 * friend's PENDING debts to the creditor. Returns the count settled.
 */
export async function settleFriendDebts(
  creditorId: string,
  debtorId: string,
  debtId?: string,
): Promise<number> {
  const where = debtId
    ? and(
        eq(debts.id, debtId),
        eq(debts.creditorId, creditorId),
        eq(debts.debtorId, debtorId),
        eq(debts.status, "PENDING"),
      )
    : and(
        eq(debts.creditorId, creditorId),
        eq(debts.debtorId, debtorId),
        eq(debts.status, "PENDING"),
      );
  const updated = await db
    .update(debts)
    .set({ status: "SETTLED" })
    .where(where)
    .returning({ id: debts.id });
  return updated.length;
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
