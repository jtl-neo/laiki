import { and, eq, gte, isNull, sql, notInArray, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { accounts, transactions, groupMembers, users, groups } from "../db/schema.js";
import { computeBalances } from "../lib/balances.js";
import { minTransfers } from "../lib/settle.js";
import { getAllFundAccountIds, getUserFundGroupIds } from "../lib/fundFilters.js";

export interface PersonalReplyText {
  text: string;
}

export interface BalanceData {
  accounts: { id: string; name: string; type: string; balance: number }[];
  total: number;
}

export async function personalBalanceData(userId: string): Promise<BalanceData> {
  const fundAcctIds = await getAllFundAccountIds();
  const rows = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        isNull(accounts.archivedAt),
        fundAcctIds.length > 0 ? notInArray(accounts.id, fundAcctIds) : undefined,
      ),
    );
  const list = rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    balance: Number(r.balance),
  }));
  const total = list.reduce((s, r) => s + r.balance, 0);
  return { accounts: list, total };
}

export interface MonthlyData {
  startStr: string;
  expense: number;
  income: number;
  topCategories: { category: string; amount: number }[];
  txCount: number;
}

export async function personalMonthlyData(userId: string): Promise<MonthlyData> {
  const memberRows = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId));
  const groupIds = memberRows.map((m) => m.groupId);

  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const startStr = start.toISOString().slice(0, 10);

  if (groupIds.length === 0) {
    return { startStr, expense: 0, income: 0, topCategories: [], txCount: 0 };
  }

  const fundGroupIds = await getUserFundGroupIds(userId);
  const rows = await db
    .select({
      category: transactions.category,
      amount: transactions.amount,
      kind: transactions.kind,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.paidByUserId, userId),
        gte(transactions.txDate, startStr),
        fundGroupIds.length > 0
          ? notInArray(transactions.groupId, fundGroupIds)
          : undefined,
      ),
    );

  let expense = 0;
  let income = 0;
  const byCat: Record<string, number> = {};
  for (const r of rows) {
    const amt = Number(r.amount);
    if (r.kind === "income") income += amt;
    else if (r.kind === "expense") {
      expense += amt;
      const c = r.category ?? "未分類";
      byCat[c] = (byCat[c] ?? 0) + amt;
    }
  }
  const topCategories = Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => ({ category, amount }));
  return { startStr, expense, income, topCategories, txCount: rows.length };
}

export async function personalBalance(userId: string): Promise<string> {
  const fundAcctIds = await getAllFundAccountIds();
  const rows = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        isNull(accounts.archivedAt),
        fundAcctIds.length > 0 ? notInArray(accounts.id, fundAcctIds) : undefined,
      ),
    );
  if (rows.length === 0) return "你還沒有任何帳戶，到 LIFF 建一個吧。";
  const total = rows.reduce((s, r) => s + Number(r.balance), 0);
  const lines = rows
    .map((r) => `• ${r.name}: NT$${Number(r.balance).toLocaleString("zh-TW")}`)
    .join("\n");
  return `各帳戶餘額：\n${lines}\n— 合計：NT$${total.toLocaleString("zh-TW")}`;
}

export async function personalMonthly(userId: string): Promise<string> {
  const memberRows = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId));
  const groupIds = memberRows.map((m) => m.groupId);
  if (groupIds.length === 0) return "尚未加入任何群組。";

  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const startStr = start.toISOString().slice(0, 10);

  const fundGroupIds = await getUserFundGroupIds(userId);
  const rows = await db
    .select({
      category: transactions.category,
      amount: transactions.amount,
      kind: transactions.kind,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.paidByUserId, userId),
        gte(transactions.txDate, startStr),
        fundGroupIds.length > 0
          ? notInArray(transactions.groupId, fundGroupIds)
          : undefined,
      ),
    );

  if (rows.length === 0) return "本月還沒有任何記錄。";

  let expense = 0;
  let income = 0;
  const byCat: Record<string, number> = {};
  for (const r of rows) {
    const amt = Number(r.amount);
    if (r.kind === "income") income += amt;
    else if (r.kind === "expense") {
      expense += amt;
      const c = r.category ?? "未分類";
      byCat[c] = (byCat[c] ?? 0) + amt;
    }
  }
  const top = Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c, v]) => `• ${c}: NT$${v.toLocaleString("zh-TW")}`)
    .join("\n");

  return [
    `本月（自 ${startStr}）統計：`,
    `支出 NT$${expense.toLocaleString("zh-TW")}`,
    `收入 NT$${income.toLocaleString("zh-TW")}`,
    "",
    "TOP 分類：",
    top || "（無）",
  ].join("\n");
}

export async function groupBalancesText(groupId: string): Promise<string> {
  const balances = await computeBalances(groupId);
  if (balances.length === 0) return "本群還沒有可以結算的交易。";
  const ids = balances.map((b) => b.userId);
  const us = ids.length === 0 ? [] : await db.select().from(users).where(inArray(users.id, ids));
  const nameMap = new Map(us.map((u) => [u.id, u.displayName ?? "成員"]));
  const lines = balances
    .map((b) => {
      const n = nameMap.get(b.userId) ?? "成員";
      const v = b.net.toFixed(2);
      const sign = b.net > 0 ? "+" : "";
      return `• ${n}: ${sign}${v}`;
    })
    .join("\n");
  return `本群欠收狀態（正數＝應收回）：\n${lines}`;
}

export async function groupSettleText(groupId: string): Promise<string> {
  const balances = await computeBalances(groupId);
  const tx = minTransfers(balances);
  if (tx.length === 0) return "本群目前無需結算 ✨";
  const ids = Array.from(new Set(tx.flatMap((t) => [t.from, t.to])));
  const us = ids.length === 0 ? [] : await db.select().from(users).where(inArray(users.id, ids));
  const nameMap = new Map(us.map((u) => [u.id, u.displayName ?? "成員"]));
  const lines = tx
    .map(
      (t) =>
        `• ${nameMap.get(t.from) ?? "成員"} → ${nameMap.get(t.to) ?? "成員"}：NT$${t.amount.toLocaleString("zh-TW")}`,
    )
    .join("\n");
  return `結算建議（最少轉帳）：\n${lines}`;
}

export async function groupMembersText(groupId: string): Promise<string> {
  const rows = await db
    .select({ name: users.displayName, role: groupMembers.role })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId));
  if (rows.length === 0) return "本群還沒有登記任何成員。";
  const lines = rows
    .map((r) => `• ${r.name ?? "成員"}${r.role === "owner" ? "（owner）" : ""}`)
    .join("\n");
  let base = `已登記成員（共 ${rows.length}）：\n${lines}\n\n沒看到的人請直接在群組發言，我就會自動加入。`;
  const botId = process.env.LINE_BOT_BASIC_ID;
  if (botId) {
    const encoded = encodeURIComponent(botId.startsWith("@") ? botId : `@${botId}`);
    base += `\n沒看到的成員請點此加好友: https://line.me/R/ti/p/${encoded}`;
  }
  return base;
}

export interface GroupBalanceData {
  groupId: string;
  rows: { userId: string; name: string; net: number }[];
}
export async function groupBalancesData(groupId: string): Promise<GroupBalanceData> {
  const balances = await computeBalances(groupId);
  if (balances.length === 0) return { groupId, rows: [] };
  const ids = balances.map((b) => b.userId);
  const us = await db.select().from(users).where(inArray(users.id, ids));
  const nm = new Map(us.map((u) => [u.id, u.displayName ?? "成員"]));
  return {
    groupId,
    rows: balances.map((b) => ({
      userId: b.userId,
      name: nm.get(b.userId) ?? "成員",
      net: b.net,
    })),
  };
}

export interface GroupSettleData {
  groupId: string;
  transfers: { from: string; fromName: string; to: string; toName: string; amount: number }[];
}
export async function groupSettleData(groupId: string): Promise<GroupSettleData> {
  const balances = await computeBalances(groupId);
  const tx = minTransfers(balances);
  if (tx.length === 0) return { groupId, transfers: [] };
  const ids = Array.from(new Set(tx.flatMap((t) => [t.from, t.to])));
  const us = await db.select().from(users).where(inArray(users.id, ids));
  const nm = new Map(us.map((u) => [u.id, u.displayName ?? "成員"]));
  return {
    groupId,
    transfers: tx.map((t) => ({
      from: t.from,
      fromName: nm.get(t.from) ?? "成員",
      to: t.to,
      toName: nm.get(t.to) ?? "成員",
      amount: t.amount,
    })),
  };
}

export interface GroupMembersData {
  groupId: string;
  members: { userId: string; name: string; role: string }[];
  inviteUrl: string | null;
}
export async function groupMembersData(groupId: string): Promise<GroupMembersData> {
  const rows = await db
    .select({ userId: users.id, name: users.displayName, role: groupMembers.role })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId));
  const botId = process.env.LINE_BOT_BASIC_ID;
  const inviteUrl = botId
    ? `https://line.me/R/ti/p/${encodeURIComponent(botId.startsWith("@") ? botId : `@${botId}`)}`
    : null;
  return {
    groupId,
    members: rows.map((r) => ({
      userId: r.userId,
      name: r.name ?? "成員",
      role: r.role,
    })),
    inviteUrl,
  };
}

export async function groupMembersCompact(groupId: string): Promise<string> {
  const rows = await db
    .select({ name: users.displayName })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId));
  if (rows.length === 0) return "";
  const names = rows.map((r) => r.name ?? "成員");
  const shown = names.slice(0, 3).join(", ");
  const suffix = names.length > 3 ? "…" : "";
  return `目前 ${names.length} 位成員: ${shown}${suffix}`;
}

export async function findGroupByLine(lineGroupId: string): Promise<typeof groups.$inferSelect | null> {
  const [g] = await db.select().from(groups).where(eq(groups.lineGroupId, lineGroupId)).limit(1);
  return g ?? null;
}
