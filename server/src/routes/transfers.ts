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

    // Both legs, the pair linkage and both balance deltas are atomic — a
    // partial failure must never leave one account moved or a dangling
    // transferPairId.
    const { from, to } = await db.transaction(async (dtx) => {
      const [tx1] = await dtx
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
      if (!tx1) throw new Error("insert failed");

      const [tx2] = await dtx
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
      if (!tx2) throw new Error("insert failed");

      const [tx1Updated] = await dtx
        .update(transactions)
        .set({ transferPairId: tx2.id, updatedAt: new Date() })
        .where(eq(transactions.id, tx1.id))
        .returning();

      await applyDelta(fromAccountId, -amount, dtx);
      await applyDelta(toAccountId, amount, dtx);

      return { from: tx1Updated, to: tx2 };
    });

    return c.json({ from, to });
  } catch (e) {
    return c.json({ error: "bad request" }, 400);
  }
});

export default app;
