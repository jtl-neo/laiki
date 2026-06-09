import { and, desc, eq, gte, lte, notInArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { groupMembers, transactions } from "../db/schema.js";
import { getUserFundGroupIds } from "./fundFilters.js";
import type { QueryParse, QueryPeriod } from "../ai/queryIntent.js";

export type QueryResult = {
  metric: QueryParse["metric"];
  periodLabel: string;
  category: string | null;
  total: number;
  txCount: number;
  topCategories: { category: string; amount: number }[];
  /** Single biggest expense (metric=biggest). */
  biggest: { amount: number; category: string | null; note: string | null; txDate: string } | null;
  /** Previous comparable period total (compare=true). */
  prevTotal: number | null;
};

const PERIOD_LABEL: Record<QueryPeriod, string> = {
  today: "今日",
  yesterday: "昨日",
  this_week: "本週",
  this_month: "本月",
  last_month: "上月",
  this_year: "今年",
  all: "全部",
};

/** UTC date range [startStr, endStr] (inclusive) for a period. `now` injectable for tests. */
export function periodRange(period: QueryPeriod, now = new Date()): { start: string; end: string } {
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const today = new Date(Date.UTC(y, m, d));

  switch (period) {
    case "today":
      return { start: ymd(today), end: ymd(today) };
    case "yesterday": {
      const yd = new Date(today);
      yd.setUTCDate(yd.getUTCDate() - 1);
      return { start: ymd(yd), end: ymd(yd) };
    }
    case "this_week": {
      // Week starts Monday.
      const dow = (today.getUTCDay() + 6) % 7;
      const start = new Date(today);
      start.setUTCDate(start.getUTCDate() - dow);
      return { start: ymd(start), end: ymd(today) };
    }
    case "this_month":
      return { start: ymd(new Date(Date.UTC(y, m, 1))), end: ymd(today) };
    case "last_month": {
      const start = new Date(Date.UTC(y, m - 1, 1));
      const end = new Date(Date.UTC(y, m, 0)); // last day of prev month
      return { start: ymd(start), end: ymd(end) };
    }
    case "this_year":
      return { start: ymd(new Date(Date.UTC(y, 0, 1))), end: ymd(today) };
    case "all":
      return { start: "1970-01-01", end: ymd(today) };
  }
}

/** Previous comparable period (for compare=true). */
function prevPeriod(period: QueryPeriod, now: Date): { start: string; end: string } | null {
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  switch (period) {
    case "today":
      return periodRange("yesterday", now);
    case "this_month":
      return periodRange("last_month", now);
    case "this_week": {
      const today = new Date(Date.UTC(y, m, d));
      const dow = (today.getUTCDay() + 6) % 7;
      const start = new Date(today);
      start.setUTCDate(start.getUTCDate() - dow - 7);
      const end = new Date(today);
      end.setUTCDate(end.getUTCDate() - dow - 1);
      return { start: ymd(start), end: ymd(end) };
    }
    case "this_year":
      return { start: ymd(new Date(Date.UTC(y - 1, 0, 1))), end: ymd(new Date(Date.UTC(y - 1, 11, 31))) };
    default:
      return null;
  }
}

async function sumRange(
  userId: string,
  fundGroupIds: string[],
  range: { start: string; end: string },
): Promise<{ rows: { category: string | null; amount: string; kind: string; note: string | null; txDate: string }[] }> {
  const rows = await db
    .select({
      category: transactions.category,
      amount: transactions.amount,
      kind: transactions.kind,
      note: transactions.note,
      txDate: transactions.txDate,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.paidByUserId, userId),
        gte(transactions.txDate, range.start),
        lte(transactions.txDate, range.end),
        fundGroupIds.length > 0 ? notInArray(transactions.groupId, fundGroupIds) : undefined,
      ),
    )
    .orderBy(desc(transactions.amount));
  return { rows };
}

/**
 * Run a parsed query: aggregate the user's personal (non-fund) transactions
 * over the period. Mirrors commands.ts monthly logic but parameterized.
 */
export async function runQuery(
  userId: string,
  q: QueryParse,
  now = new Date(),
): Promise<QueryResult> {
  // The user must belong to ≥1 group for any tx to exist; fund groups excluded.
  const memberRows = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId));
  const fundGroupIds = await getUserFundGroupIds(userId);

  const range = periodRange(q.period, now);
  const empty: QueryResult = {
    metric: q.metric,
    periodLabel: PERIOD_LABEL[q.period],
    category: q.category,
    total: 0,
    txCount: 0,
    topCategories: [],
    biggest: null,
    prevTotal: null,
  };
  if (memberRows.length === 0) return empty;

  const { rows } = await sumRange(userId, fundGroupIds, range);

  const wantKind = q.metric === "income" ? "income" : "expense";
  const filtered = rows.filter(
    (r) => r.kind === wantKind && (!q.category || r.category === q.category),
  );

  let total = 0;
  const byCat: Record<string, number> = {};
  for (const r of filtered) {
    const amt = Number(r.amount);
    total += amt;
    const c = r.category ?? "未分類";
    byCat[c] = (byCat[c] ?? 0) + amt;
  }
  const topCategories = Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, amount]) => ({ category, amount }));

  const biggestRow = filtered[0] ?? null; // rows ordered by amount desc
  const biggest = biggestRow
    ? {
        amount: Number(biggestRow.amount),
        category: biggestRow.category,
        note: biggestRow.note,
        txDate: biggestRow.txDate,
      }
    : null;

  let prevTotal: number | null = null;
  if (q.compare) {
    const pr = prevPeriod(q.period, now);
    if (pr) {
      const { rows: prevRows } = await sumRange(userId, fundGroupIds, pr);
      prevTotal = prevRows
        .filter((r) => r.kind === wantKind && (!q.category || r.category === q.category))
        .reduce((s, r) => s + Number(r.amount), 0);
    }
  }

  return {
    ...empty,
    total,
    txCount: filtered.length,
    topCategories,
    biggest,
    prevTotal,
  };
}
