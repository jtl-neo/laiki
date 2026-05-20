import { Hono } from "hono";
import { z } from "zod";
import { and, eq, gte, sql as dsql, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { budgets, transactions } from "../db/schema.js";
import { requireSession } from "../lib/auth.js";

const app = new Hono<{ Variables: { userId: string } }>();

app.use("*", requireSession);

function firstOfMonth(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

app.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await db.select().from(budgets).where(eq(budgets.userId, userId));
  const start = firstOfMonth();

  const result = await Promise.all(
    rows.map(async (b) => {
      const conditions = [
        eq(transactions.paidByUserId, userId),
        eq(transactions.kind, "expense"),
        gte(transactions.txDate, start),
      ];
      if (b.groupId) conditions.push(eq(transactions.groupId, b.groupId));
      if (b.category) conditions.push(eq(transactions.category, b.category));

      const [row] = await db
        .select({ total: dsql<string>`COALESCE(SUM(${transactions.amount}), 0)` })
        .from(transactions)
        .where(and(...conditions));

      const spent = Number(row?.total ?? 0);
      const limit = Number(b.monthlyLimit);
      const percent = limit > 0 ? spent / limit : 0;
      return {
        id: b.id,
        groupId: b.groupId,
        category: b.category,
        monthlyLimit: b.monthlyLimit,
        spent,
        percent,
      };
    }),
  );

  return c.json({ budgets: result });
});

const PostSchema = z.object({
  groupId: z.string().uuid().nullable().optional(),
  category: z.string().nullable().optional(),
  monthlyLimit: z.number().positive(),
});

app.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "bad request" }, 400);
  const { groupId, category, monthlyLimit } = parsed.data;

  const conditions = [eq(budgets.userId, userId)];
  conditions.push(groupId ? eq(budgets.groupId, groupId) : isNull(budgets.groupId));
  conditions.push(category ? eq(budgets.category, category) : isNull(budgets.category));

  const [existing] = await db
    .select()
    .from(budgets)
    .where(and(...conditions))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(budgets)
      .set({ monthlyLimit: monthlyLimit.toFixed(2), updatedAt: new Date() })
      .where(eq(budgets.id, existing.id))
      .returning();
    return c.json({ budget: updated });
  }

  const [created] = await db
    .insert(budgets)
    .values({
      userId,
      groupId: groupId ?? null,
      category: category ?? null,
      monthlyLimit: monthlyLimit.toFixed(2),
    })
    .returning();
  return c.json({ budget: created });
});

app.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const [b] = await db.select().from(budgets).where(eq(budgets.id, id)).limit(1);
  if (!b) return c.json({ error: "not found" }, 404);
  if (b.userId !== userId) return c.json({ error: "forbidden" }, 403);
  await db.delete(budgets).where(eq(budgets.id, id));
  return c.json({ ok: true });
});

export default app;
