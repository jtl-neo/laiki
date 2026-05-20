import { Hono } from "hono";
import { sql as dsql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { requireSession } from "../../lib/auth.js";
import { getUserFundGroupIds } from "../../lib/fundFilters.js";

const app = new Hono<{ Variables: { userId: string } }>();
app.use("*", requireSession);

app.get("/trend", async (c) => {
  const userId = c.get("userId");
  const monthsParam = Number(c.req.query("months") ?? "6");
  const months = Number.isFinite(monthsParam) && monthsParam > 0 && monthsParam <= 24 ? Math.floor(monthsParam) : 6;

  // Build list of YYYY-MM keys (oldest -> newest), inclusive of current month.
  const now = new Date();
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    keys.push(ym);
  }
  const startKey = keys[0]!;
  const startDate = `${startKey}-01`;

  const fundGroupIds = await getUserFundGroupIds(userId);
  const fundExcl = fundGroupIds.length > 0
    ? dsql`AND group_id NOT IN (${dsql.join(fundGroupIds.map((id) => dsql`${id}`), dsql`, `)})`
    : dsql``;
  const result = await db.execute(dsql`
    SELECT
      SUBSTRING(tx_date::text, 1, 7) AS month,
      COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount ELSE 0 END), 0) AS expense,
      COALESCE(SUM(CASE WHEN kind = 'income' THEN amount ELSE 0 END), 0) AS income
    FROM transactions
    WHERE paid_by_user_id = ${userId}
      AND tx_date >= ${startDate}
      ${fundExcl}
    GROUP BY SUBSTRING(tx_date::text, 1, 7)
  `);

  const rows =
    (result as unknown as { rows?: unknown[] }).rows ??
    (result as unknown as unknown[]);
  const byMonth = new Map<string, { expense: number; income: number }>();
  for (const r of rows as Array<Record<string, unknown>>) {
    const m = String(r.month);
    byMonth.set(m, {
      expense: Number(r.expense ?? 0),
      income: Number(r.income ?? 0),
    });
  }

  const data = keys.map((m) => {
    const v = byMonth.get(m);
    return { month: m, expense: v?.expense ?? 0, income: v?.income ?? 0 };
  });

  return c.json({ trend: data });
});

export default app;
