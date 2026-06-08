import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { requireSession } from "../../lib/auth.js";
import {
  generateBindingCode,
  listFriendsWithOutstanding,
  resolveOrCreateShadow,
} from "../../lib/shadowAccount.js";

const app = new Hono<{ Variables: { userId: string } }>();
app.use("*", requireSession);

/** The caller's friend roster (shadow + bound) with outstanding totals. */
app.get("/friends", async (c) => {
  const userId = c.get("userId");
  const friends = await listFriendsWithOutstanding(userId);
  return c.json({ friends });
});

const CreateFriendSchema = z.object({ name: z.string().min(1).max(30) });

/** Create (or resolve) a shadow friend by display name. */
app.post("/friends", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => null);
  const parsed = CreateFriendSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "bad request" }, 400);

  const friendId = await resolveOrCreateShadow(userId, parsed.data.name.trim());
  const [friend] = await db
    .select({
      userId: users.id,
      displayName: users.displayName,
      isVirtual: users.isVirtual,
    })
    .from(users)
    .where(eq(users.id, friendId))
    .limit(1);
  return c.json({ friend });
});

/** A friend's PENDING debt breakdown owed to the caller. */
app.get("/friends/:id/debts", async (c) => {
  const userId = c.get("userId");
  const friendId = c.req.param("id");
  const [friend] = await db
    .select({ displayName: users.displayName, isVirtual: users.isVirtual })
    .from(users)
    .where(and(eq(users.id, friendId), eq(users.createdBy, userId)))
    .limit(1);
  if (!friend) return c.json({ error: "not found" }, 404);

  const { listFriendDebts } = await import("../../lib/debts.js");
  const debts = await listFriendDebts(userId, friendId);
  const total = debts.reduce((s, d) => s + d.amount, 0);
  return c.json({ friend, debts, total });
});

const SettleSchema = z.object({ debtId: z.string().uuid().optional() });

/** Settle one or all of a friend's debts to the caller. */
app.post("/friends/:id/settle", async (c) => {
  const userId = c.get("userId");
  const friendId = c.req.param("id");
  const [friend] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, friendId), eq(users.createdBy, userId)))
    .limit(1);
  if (!friend) return c.json({ error: "not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const parsed = SettleSchema.safeParse(body ?? {});
  if (!parsed.success) return c.json({ error: "bad request" }, 400);

  const { settleFriendDebts } = await import("../../lib/debts.js");
  const settled = await settleFriendDebts(userId, friendId, parsed.data.debtId);
  return c.json({ settled });
});

/** Generate a 24h binding PIN for one of the caller's shadow friends. */
app.post("/friends/:id/pin", async (c) => {
  const userId = c.get("userId");
  const friendId = c.req.param("id");
  const [friend] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, friendId), eq(users.createdBy, userId)))
    .limit(1);
  if (!friend) return c.json({ error: "not found" }, 404);
  if (!friend.isVirtual) return c.json({ error: "already bound" }, 400);

  const pin = await generateBindingCode(friend.id, userId);
  return c.json({ pin, expiresInHours: 24 });
});

export default app;
