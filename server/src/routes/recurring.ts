import { Hono } from "hono";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { recurringTransactions, groupMembers, transactions } from "../db/schema.js";
import { requireSession } from "../lib/auth.js";
import { canAccessAccount } from "../lib/resolveAccount.js";
import { applyDelta, signedAmount } from "../lib/accountDelta.js";
import { computeNextRunDate, parseYmd, ymd, type Frequency } from "../lib/recurring.js";

const app = new Hono<{ Variables: { userId: string } }>();
app.use("*", requireSession);

async function userInGroup(userId: string, groupId: string): Promise<boolean> {
  const [m] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.userId, userId), eq(groupMembers.groupId, groupId)))
    .limit(1);
  return !!m;
}

app.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await db
    .select()
    .from(recurringTransactions)
    .where(eq(recurringTransactions.userId, userId))
    .orderBy(desc(recurringTransactions.createdAt));
  return c.json({ recurring: rows });
});

const CreateSchema = z.object({
  groupId: z.string().uuid(),
  accountId: z.string().uuid(),
  amount: z.number().positive(),
  kind: z.enum(["expense", "income"]).optional(),
  category: z.string().max(32).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  anchorDay: z.number().int().nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

app.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "bad request", issues: parsed.error.issues }, 400);
  const d = parsed.data;
  if (!(await userInGroup(userId, d.groupId))) return c.json({ error: "forbidden" }, 403);
  if (!(await canAccessAccount(userId, d.accountId)))
    return c.json({ error: "forbidden: account" }, 403);

  const [row] = await db
    .insert(recurringTransactions)
    .values({
      userId,
      groupId: d.groupId,
      accountId: d.accountId,
      amount: d.amount.toFixed(2),
      kind: d.kind ?? "expense",
      category: d.category ?? null,
      note: d.note ?? null,
      frequency: d.frequency,
      anchorDay: d.anchorDay ?? null,
      startDate: d.startDate,
      endDate: d.endDate ?? null,
      nextRunDate: d.startDate,
    })
    .returning();
  return c.json({ recurring: row });
});

const PatchSchema = z.object({
  amount: z.number().positive().optional(),
  kind: z.enum(["expense", "income"]).optional(),
  category: z.string().max(32).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]).optional(),
  anchorDay: z.number().int().nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  active: z.boolean().optional(),
  accountId: z.string().uuid().optional(),
});

app.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "bad request" }, 400);
  const [row] = await db
    .select()
    .from(recurringTransactions)
    .where(eq(recurringTransactions.id, id))
    .limit(1);
  if (!row || row.userId !== userId) return c.json({ error: "not found" }, 404);
  if (parsed.data.accountId && !(await canAccessAccount(userId, parsed.data.accountId)))
    return c.json({ error: "forbidden: account" }, 403);

  const upd: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.amount !== undefined) upd.amount = parsed.data.amount.toFixed(2);
  if (parsed.data.kind !== undefined) upd.kind = parsed.data.kind;
  if (parsed.data.category !== undefined) upd.category = parsed.data.category;
  if (parsed.data.note !== undefined) upd.note = parsed.data.note;
  if (parsed.data.frequency !== undefined) upd.frequency = parsed.data.frequency;
  if (parsed.data.anchorDay !== undefined) upd.anchorDay = parsed.data.anchorDay;
  if (parsed.data.endDate !== undefined) upd.endDate = parsed.data.endDate;
  if (parsed.data.active !== undefined) upd.active = parsed.data.active;
  if (parsed.data.accountId !== undefined) upd.accountId = parsed.data.accountId;

  await db.update(recurringTransactions).set(upd).where(eq(recurringTransactions.id, id));
  const [updated] = await db
    .select()
    .from(recurringTransactions)
    .where(eq(recurringTransactions.id, id))
    .limit(1);
  return c.json({ recurring: updated });
});

app.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const [row] = await db
    .select()
    .from(recurringTransactions)
    .where(eq(recurringTransactions.id, id))
    .limit(1);
  if (!row || row.userId !== userId) return c.json({ error: "not found" }, 404);
  await db.delete(recurringTransactions).where(eq(recurringTransactions.id, id));
  return c.json({ ok: true });
});

app.post("/:id/run", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const [row] = await db
    .select()
    .from(recurringTransactions)
    .where(eq(recurringTransactions.id, id))
    .limit(1);
  if (!row || row.userId !== userId) return c.json({ error: "not found" }, 404);
  const today = ymd(new Date());
  const [tx] = await db
    .insert(transactions)
    .values({
      groupId: row.groupId,
      accountId: row.accountId,
      amount: row.amount,
      txDate: today,
      paidByUserId: userId,
      category: row.category,
      kind: row.kind,
      note: row.note ?? "定期定額",
      source: "manual",
    })
    .returning();
  await applyDelta(row.accountId, signedAmount(row.kind, Number(row.amount)));
  const next = computeNextRunDate(parseYmd(today), row.frequency as Frequency, row.anchorDay);
  await db
    .update(recurringTransactions)
    .set({ lastRunDate: today, nextRunDate: ymd(next), updatedAt: new Date() })
    .where(eq(recurringTransactions.id, id));
  return c.json({ tx });
});

export default app;
