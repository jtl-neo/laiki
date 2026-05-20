import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { accounts, transactions, groupMembers } from "../db/schema.js";
import { requireSession } from "../lib/auth.js";
import { applyDelta } from "../lib/accountDelta.js";

const app = new Hono<{ Variables: { userId: string } }>();

app.use("*", requireSession);

const TransferSchema = z.object({
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  amount: z.number().positive(),
  txDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().optional(),
  groupId: z.string().uuid(),
});

app.post("/", async (c) => {
  try {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => null);
    const parsed = TransferSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "bad request" }, 400);
    const { fromAccountId, toAccountId, amount, txDate, note, groupId } = parsed.data;
    if (fromAccountId === toAccountId) return c.json({ error: "bad request" }, 400);

    const [member] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.userId, userId), eq(groupMembers.groupId, groupId)))
      .limit(1);
    if (!member) return c.json({ error: "forbidden" }, 403);

    const [fromAcc] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, fromAccountId), eq(accounts.userId, userId)))
      .limit(1);
    if (!fromAcc) return c.json({ error: "forbidden" }, 403);
    const [toAcc] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, toAccountId), eq(accounts.userId, userId)))
      .limit(1);
    if (!toAcc) return c.json({ error: "forbidden" }, 403);

    const date = txDate ?? new Date().toISOString().slice(0, 10);
    const amountStr = amount.toFixed(2);

    const [tx1] = await db
      .insert(transactions)
      .values({
        groupId,
        accountId: fromAccountId,
        amount: amountStr,
        txDate: date,
        paidByUserId: userId,
        kind: "transfer",
        note,
        source: "liff",
      })
      .returning();
    if (!tx1) return c.json({ error: "insert failed" }, 500);

    const [tx2] = await db
      .insert(transactions)
      .values({
        groupId,
        accountId: toAccountId,
        amount: amountStr,
        txDate: date,
        paidByUserId: userId,
        kind: "transfer",
        note,
        source: "liff",
        transferPairId: tx1.id,
      })
      .returning();
    if (!tx2) return c.json({ error: "insert failed" }, 500);

    const [tx1Updated] = await db
      .update(transactions)
      .set({ transferPairId: tx2.id, updatedAt: new Date() })
      .where(eq(transactions.id, tx1.id))
      .returning();

    await applyDelta(fromAccountId, -amount);
    await applyDelta(toAccountId, amount);

    return c.json({ from: tx1Updated, to: tx2 });
  } catch (e) {
    return c.json({ error: "bad request" }, 400);
  }
});

export default app;
