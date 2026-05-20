import { Hono } from "hono";
import { z } from "zod";
import { and, eq, desc, inArray } from "drizzle-orm";
import { getUserFundGroupIds } from "../lib/fundFilters.js";
import { db } from "../db/client.js";
import { transactions, transactionSplits, groupMembers } from "../db/schema.js";
import { requireSession } from "../lib/auth.js";
import { applyDelta, signedAmount } from "../lib/accountDelta.js";
import { canAccessAccount } from "../lib/resolveAccount.js";

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


app.get("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const [tx] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  if (!tx) return c.json({ error: "not found" }, 404);
  if (!(await userInGroup(userId, tx.groupId))) return c.json({ error: "forbidden" }, 403);
  const splits = await db
    .select({ userId: transactionSplits.userId, amount: transactionSplits.amount })
    .from(transactionSplits)
    .where(eq(transactionSplits.transactionId, id));
  return c.json({ tx: { ...tx, splits } });
});

const PatchSchema = z.object({
  amount: z.number().positive().optional(),
  category: z.string().max(32).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  txDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  accountId: z.string().uuid().optional(),
  splits: z
    .array(z.object({ userId: z.string().uuid(), amount: z.number() }))
    .optional(),
});

app.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "bad request" }, 400);

  const [tx] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  if (!tx) return c.json({ error: "not found" }, 404);
  if (!(await userInGroup(userId, tx.groupId))) return c.json({ error: "forbidden" }, 403);

  const oldAccountId = tx.accountId;
  const oldAmount = Number(tx.amount);
  const oldKind = tx.kind;

  const newAccountId = parsed.data.accountId ?? oldAccountId;
  if (parsed.data.accountId && parsed.data.accountId !== oldAccountId) {
    if (!(await canAccessAccount(userId, parsed.data.accountId))) {
      return c.json({ error: "forbidden: account" }, 403);
    }
  }
  const newAmount = parsed.data.amount ?? oldAmount;

  await applyDelta(oldAccountId, -signedAmount(oldKind, oldAmount));
  await db
    .update(transactions)
    .set({
      ...(parsed.data.amount !== undefined ? { amount: parsed.data.amount.toFixed(2) } : {}),
      ...(parsed.data.category !== undefined ? { category: parsed.data.category } : {}),
      ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
      ...(parsed.data.txDate ? { txDate: parsed.data.txDate } : {}),
      ...(parsed.data.accountId ? { accountId: parsed.data.accountId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, id));
  await applyDelta(newAccountId, signedAmount(oldKind, newAmount));

  if (parsed.data.splits !== undefined) {
    await db.delete(transactionSplits).where(eq(transactionSplits.transactionId, id));
    if (parsed.data.splits.length > 0) {
      await db.insert(transactionSplits).values(
        parsed.data.splits.map((s) => ({
          transactionId: id,
          userId: s.userId,
          amount: s.amount.toFixed(2),
        })),
      );
    }
  }

  const [updated] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  return c.json({ tx: updated });
});

app.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const [tx] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  if (!tx) return c.json({ error: "not found" }, 404);
  if (!(await userInGroup(userId, tx.groupId))) return c.json({ error: "forbidden" }, 403);

  await applyDelta(tx.accountId, -signedAmount(tx.kind, Number(tx.amount)));
  await db.delete(transactions).where(eq(transactions.id, id));
  return c.json({ ok: true });
});

const CreateSchema = z.object({
  groupId: z.string().uuid(),
  accountId: z.string().uuid(),
  amount: z.number().positive(),
  txDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().max(32).nullable().optional(),
  kind: z.enum(["expense", "income", "transfer", "fund_in", "fund_out"]).optional(),
  note: z.string().max(500).nullable().optional(),
  splits: z.array(z.object({ userId: z.string().uuid(), amount: z.number() })).optional(),
});

app.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "bad request" }, 400);

  const { groupId, accountId, amount, txDate, category, kind, note, splits } = parsed.data;
  if (!(await userInGroup(userId, groupId))) return c.json({ error: "forbidden" }, 403);
  if (!(await canAccessAccount(userId, accountId))) {
    return c.json({ error: "forbidden: account" }, 403);
  }

  const txKind = kind ?? "expense";
  const [tx] = await db
    .insert(transactions)
    .values({
      groupId,
      accountId,
      amount: amount.toFixed(2),
      txDate,
      paidByUserId: userId,
      category: category ?? null,
      kind: txKind,
      note: note ?? null,
      source: "liff",
    })
    .returning();

  if (!tx) return c.json({ error: "insert failed" }, 500);

  if (splits && splits.length > 0) {
    await db.insert(transactionSplits).values(
      splits.map((s) => ({
        transactionId: tx.id,
        userId: s.userId,
        amount: s.amount.toFixed(2),
      })),
    );
  }

  await applyDelta(accountId, signedAmount(txKind, amount));

  return c.json({ tx });
});

app.get("/", async (c) => {
  const userId = c.get("userId");
  const groupId = c.req.query("groupId");
  if (groupId) {
    if (!(await userInGroup(userId, groupId))) return c.json({ error: "forbidden" }, 403);
    const rows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.groupId, groupId))
      .orderBy(desc(transactions.txDate), desc(transactions.createdAt))
      .limit(100);
    return c.json({ transactions: rows });
  }
  const memberRows = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId));
  const fundGroupIds = new Set(await getUserFundGroupIds(userId));
  const groupIds = memberRows
    .map((r) => r.groupId)
    .filter((g) => !fundGroupIds.has(g));
  if (groupIds.length === 0) return c.json({ transactions: [] });
  const rows = await db
    .select()
    .from(transactions)
    .where(inArray(transactions.groupId, groupIds))
    .orderBy(desc(transactions.txDate), desc(transactions.createdAt))
    .limit(100);
  return c.json({ transactions: rows });
});

export default app;
