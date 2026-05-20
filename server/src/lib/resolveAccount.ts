import { and, eq, sql as dsql } from "drizzle-orm";
import { db } from "../db/client.js";
import { accounts, accountMembers, type Account } from "../db/schema.js";

export async function listUserAccounts(userId: string): Promise<Account[]> {
  const result = await db.execute(dsql`
    SELECT DISTINCT a.* FROM accounts a
    LEFT JOIN account_members m ON m.account_id = a.id AND m.user_id = ${userId}
    WHERE (a.user_id = ${userId} OR m.user_id = ${userId})
      AND a.archived_at IS NULL
    ORDER BY a.created_at
  `);
  const rows = (result as unknown as { rows?: unknown[] }).rows ?? (result as unknown as unknown[]);
  return (rows as unknown[]).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      type: row.type,
      last4: row.last4,
      currency: row.currency,
      balance: row.balance,
      initialBalance: row.initial_balance,
      icon: row.icon,
      color: row.color,
      archivedAt: row.archived_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } as Account;
  });
}

export async function canAccessAccount(userId: string, accountId: string): Promise<boolean> {
  const [own] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
    .limit(1);
  if (own) return true;
  const [m] = await db
    .select()
    .from(accountMembers)
    .where(and(eq(accountMembers.accountId, accountId), eq(accountMembers.userId, userId)))
    .limit(1);
  return !!m;
}


const TYPE_ALIAS: Record<string, Account["type"]> = {
  現金: "cash",
  cash: "cash",
  錢包: "cash",
  信用卡: "credit",
  卡: "credit",
  credit: "credit",
  銀行: "bank",
  bank: "bank",
  活存: "bank",
  悠遊卡: "debit",
  一卡通: "debit",
  "line pay": "ewallet",
  linepay: "ewallet",
  街口: "ewallet",
  悠遊付: "ewallet",
};

export function resolveAccount(
  userAccounts: Account[],
  hint: string | null | undefined,
): Account | null {
  if (userAccounts.length === 0) return null;
  if (!hint) return userAccounts[0] ?? null;

  const h = hint.toLowerCase().trim();

  for (const a of userAccounts) {
    if (a.name.toLowerCase() === h) return a;
  }
  const digits = h.replace(/\D/g, "");
  if (digits.length >= 3) {
    for (const a of userAccounts) {
      if (a.last4 && digits.includes(a.last4)) return a;
    }
  }
  for (const a of userAccounts) {
    if (a.name.toLowerCase().includes(h) || h.includes(a.name.toLowerCase())) return a;
  }
  const aliasType = TYPE_ALIAS[h];
  if (aliasType) {
    const match = userAccounts.find((a) => a.type === aliasType);
    if (match) return match;
  }
  return userAccounts[0] ?? null;
}
