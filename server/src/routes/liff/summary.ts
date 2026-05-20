import { Hono } from "hono";
import { and, eq, gte, desc, notInArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { transactions } from "../../db/schema.js";
import { requireSession } from "../../lib/auth.js";
import { getUserFundGroupIds } from "../../lib/fundFilters.js";

const app = new Hono<{ Variables: { userId: string } }>();
app.use("*", requireSession);

app.get("/summary", async (c) => {
  const userId = c.get("userId");
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const startStr = start.toISOString().slice(0, 10);

  const fundGroupIds = await getUserFundGroupIds(userId);
  const rows = await db
    .select()
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
    if (r.kind === "income" || r.kind === "fund_in") income += amt;
    else if (r.kind === "expense") {
      expense += amt;
      const c = r.category ?? "未分類";
      byCat[c] = (byCat[c] ?? 0) + amt;
    }
  }
  const topCategories = Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => ({ category, amount }));

  const recent = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.paidByUserId, userId),
        fundGroupIds.length > 0
          ? notInArray(transactions.groupId, fundGroupIds)
          : undefined,
      ),
    )
    .orderBy(desc(transactions.createdAt))
    .limit(5);

  return c.json({
    month: { start: startStr, expense, income, topCategories },
    recent,
  });
});

export default app;
