import { Hono } from "hono";
import { and, eq, gte, lt, notInArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  transactions,
  groups,
  groupMembers,
} from "../../db/schema.js";
import { requireSession } from "../../lib/auth.js";
import { listUserAccounts } from "../../lib/resolveAccount.js";
import {
  getAllFundAccountIds,
  getUserFundGroupIds,
} from "../../lib/fundFilters.js";

const app = new Hono<{ Variables: { userId: string } }>();
app.use("*", requireSession);

const DEBT_TYPES = new Set(["credit"]);

app.get("/overview", async (c) => {
  const userId = c.get("userId");

  const fundAcctIds = new Set(await getAllFundAccountIds());
  const fundGroupIds = await getUserFundGroupIds(userId);
  const allAccs = (await listUserAccounts(userId)).filter(
    (a) => !a.archivedAt && !fundAcctIds.has(a.id),
  );
  let assets = 0;
  let debts = 0;
  const accountBreakdown = allAccs.map((a) => {
    const bal = Number(a.balance);
    if (DEBT_TYPES.has(a.type)) debts += Math.abs(bal);
    else assets += bal;
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      balance: bal,
      isShared: a.userId !== userId,
    };
  });
  const netWorth = assets - debts;

  const now = new Date();
  const thisStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const fundExcl =
    fundGroupIds.length > 0
      ? notInArray(transactions.groupId, fundGroupIds)
      : undefined;
  const thisRows = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.paidByUserId, userId),
        gte(transactions.txDate, fmt(thisStart)),
        lt(transactions.txDate, fmt(nextStart)),
        fundExcl,
      ),
    );
  const prevRows = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.paidByUserId, userId),
        gte(transactions.txDate, fmt(prevStart)),
        lt(transactions.txDate, fmt(thisStart)),
        fundExcl,
      ),
    );

  function agg(rows: typeof thisRows) {
    let inc = 0;
    let exp = 0;
    const byCat: Record<string, number> = {};
    const byGroup: Record<string, number> = {};
    for (const r of rows) {
      const amt = Number(r.amount);
      if (r.kind === "income" || r.kind === "fund_in") inc += amt;
      else if (r.kind === "expense") {
        exp += amt;
        const c = r.category ?? "未分類";
        byCat[c] = (byCat[c] ?? 0) + amt;
        byGroup[r.groupId] = (byGroup[r.groupId] ?? 0) + amt;
      }
    }
    return { income: inc, expense: exp, byCat, byGroup };
  }

  const cur = agg(thisRows);
  const prev = agg(prevRows);

  const topCategories = Object.entries(cur.byCat)
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => ({ category, amount }));

  const memberRows = await db
    .select({ id: groups.id, name: groups.name, type: groups.type })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(
      and(
        eq(groupMembers.userId, userId),
        fundGroupIds.length > 0 ? notInArray(groups.id, fundGroupIds) : undefined,
      ),
    );
  const groupMap = new Map(memberRows.map((g) => [g.id, g]));
  const byGroupArr = Object.entries(cur.byGroup)
    .map(([gid, amount]) => ({
      id: gid,
      name: groupMap.get(gid)?.name ?? "(未知)",
      type: groupMap.get(gid)?.type ?? "shared",
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);

  return c.json({
    netWorth,
    assets,
    debts,
    accounts: accountBreakdown.sort((a, b) => b.balance - a.balance),
    thisMonth: {
      start: fmt(thisStart),
      income: cur.income,
      expense: cur.expense,
      net: cur.income - cur.expense,
      topCategories,
      byGroup: byGroupArr,
    },
    prevMonth: {
      start: fmt(prevStart),
      income: prev.income,
      expense: prev.expense,
      net: prev.income - prev.expense,
    },
  });
});

export default app;
