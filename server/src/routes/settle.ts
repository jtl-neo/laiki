import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { groupMembers, users, settlements, accounts } from "../db/schema.js";
import { requireSession } from "../lib/auth.js";
import { applyDelta } from "../lib/accountDelta.js";
import { computeBalances } from "../lib/balances.js";
import { minTransfers } from "../lib/settle.js";
import { incr } from "./metrics.js";

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

async function userOwnsAccount(userId: string, accountId: string): Promise<boolean> {
  const [a] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)))
    .limit(1);
  return !!a;
}

app.get("/:id/settle", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  if (!(await userInGroup(userId, id))) return c.json({ error: "forbidden" }, 403);

  const balances = await computeBalances(id);
  const transfers = minTransfers(balances);

  const memberRows = await db
    .select({ userId: users.id, displayName: users.displayName })
    .from(users)
    .innerJoin(groupMembers, eq(groupMembers.userId, users.id))
    .where(eq(groupMembers.groupId, id));

  const nameMap = new Map<string, string | null>();
  for (const m of memberRows) nameMap.set(m.userId, m.displayName);

  const result = transfers.map((t) => ({
    fromUserId: t.from,
    fromName: nameMap.get(t.from) ?? null,
    toUserId: t.to,
    toName: nameMap.get(t.to) ?? null,
    amount: t.amount,
  }));

  return c.json({ transfers: result });
});

const RecordPaidSchema = z.object({
  fromUserId: z.string().uuid(),
  toUserId: z.string().uuid(),
  fromAccountId: z.string().uuid().optional(),
  toAccountId: z.string().uuid().optional(),
  amount: z.number().positive(),
  note: z.string().optional(),
});

app.post("/:id/settle/record-paid", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  if (!(await userInGroup(userId, id))) return c.json({ error: "forbidden" }, 403);

  const body = await c.req.json().catch(() => null);
  const parsed = RecordPaidSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "bad request" }, 400);

  const { fromUserId, toUserId, fromAccountId, toAccountId, amount, note } = parsed.data;

  if (fromAccountId) {
    if (!(await userOwnsAccount(fromUserId, fromAccountId))) {
      return c.json({ error: "forbidden: fromAccount" }, 403);
    }
    await applyDelta(fromAccountId, -amount);
  }
  if (toAccountId) {
    if (!(await userOwnsAccount(toUserId, toAccountId))) {
      return c.json({ error: "forbidden: toAccount" }, 403);
    }
    await applyDelta(toAccountId, amount);
  }

  const [settlement] = await db
    .insert(settlements)
    .values({
      groupId: id,
      fromUserId,
      toUserId,
      fromAccountId: fromAccountId ?? null,
      toAccountId: toAccountId ?? null,
      amount: amount.toFixed(2),
      note: note ?? null,
    })
    .returning();

  incr("settle_total");
  return c.json({ settlement });
});

export default app;
