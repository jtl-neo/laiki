import { Hono } from "hono";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { accounts, transactions, accountMembers, users, groupMembers, groups } from "../db/schema.js";
import { requireSession } from "../lib/auth.js";
import { canAccessAccount, listUserAccounts } from "../lib/resolveAccount.js";
import { lineClient } from "../line/client.js";
import { applyDelta, signedAmount } from "../lib/accountDelta.js";
import { ensureUserDefaults } from "../lib/ensureDefaults.js";

const app = new Hono<{ Variables: { userId: string } }>();

app.use("*", requireSession);

const accountTypeSchema = z.enum(["cash", "debit", "credit", "bank", "ewallet"]);

const CreateSchema = z.object({
  name: z.string().min(1).max(50),
  type: accountTypeSchema,
  last4: z.string().optional(),
  currency: z.string().optional(),
  initialBalance: z.number().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
});

const PatchSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  type: accountTypeSchema.optional(),
  last4: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  archivedAt: z.union([z.null(), z.string()]).optional(),
});

const AdjustSchema = z.object({
  newBalance: z.number(),
  note: z.string().max(200).optional(),
});

app.get("/", async (c) => {
  const userId = c.get("userId");
  const all = await listUserAccounts(userId);
  const withMeta = all
    .map((a) => ({ ...a, isOwner: a.userId === userId, isShared: a.userId !== userId }))
    .sort((a, b) => (a.createdAt instanceof Date && b.createdAt instanceof Date
      ? a.createdAt.getTime() - b.createdAt.getTime()
      : 0));
  return c.json({ accounts: withMeta });
});

app.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "bad request" }, 400);
  const initial = parsed.data.initialBalance ?? 0;
  const [account] = await db
    .insert(accounts)
    .values({
      userId,
      name: parsed.data.name,
      type: parsed.data.type,
      last4: parsed.data.last4,
      currency: parsed.data.currency ?? "TWD",
      initialBalance: initial.toFixed(2),
      balance: initial.toFixed(2),
      icon: parsed.data.icon,
      color: parsed.data.color,
    })
    .returning();
  return c.json({ account });
});

app.get("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  if (!(await canAccessAccount(userId, id))) return c.json({ error: "not found" }, 404);
  const [account] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  if (!account) return c.json({ error: "not found" }, 404);
  return c.json({ account, isOwner: account.userId === userId });
});

app.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "bad request" }, 400);

  const [existing] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
    .limit(1);
  if (!existing) return c.json({ error: "not found" }, 404);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.type !== undefined) updates.type = parsed.data.type;
  if (parsed.data.last4 !== undefined) updates.last4 = parsed.data.last4;
  if (parsed.data.icon !== undefined) updates.icon = parsed.data.icon;
  if (parsed.data.color !== undefined) updates.color = parsed.data.color;
  if (parsed.data.archivedAt !== undefined) {
    updates.archivedAt =
      parsed.data.archivedAt === null ? null : new Date(parsed.data.archivedAt);
  }

  const [account] = await db
    .update(accounts)
    .set(updates)
    .where(eq(accounts.id, id))
    .returning();
  return c.json({ account });
});

app.post("/:id/adjust", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = AdjustSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "bad request" }, 400);

  if (!(await canAccessAccount(userId, id))) return c.json({ error: "not found" }, 404);
  const [acc] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  if (!acc) return c.json({ error: "not found" }, 404);

  const current = Number(acc.balance);
  const target = parsed.data.newBalance;
  const delta = Math.round((target - current) * 100) / 100;
  if (delta === 0) return c.json({ ok: true, delta: 0, balance: acc.balance });

  await ensureUserDefaults(userId);
  const [member] = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(and(eq(groupMembers.userId, userId), eq(groups.type, "shared")))
    .limit(1);
  if (!member) return c.json({ error: "no default group" }, 500);

  const kind: "income" | "expense" = delta > 0 ? "income" : "expense";
  const today = new Date().toISOString().slice(0, 10);
  const [tx] = await db
    .insert(transactions)
    .values({
      groupId: member.groupId,
      accountId: id,
      amount: Math.abs(delta).toFixed(2),
      txDate: today,
      paidByUserId: userId,
      category: "餘額調整",
      kind,
      note: parsed.data.note ?? `調整為 ${target}`,
      source: "manual",
    })
    .returning();

  await applyDelta(id, signedAmount(kind, Math.abs(delta)));

  return c.json({ ok: true, delta, tx });
});

app.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const [existing] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
    .limit(1);
  if (!existing) return c.json({ error: "not found" }, 404);
  await db
    .update(accounts)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(accounts.id, id));
  return c.json({ ok: true });
});

app.get("/:id/transactions", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  if (!(await canAccessAccount(userId, id))) return c.json({ error: "not found" }, 404);
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.accountId, id))
    .orderBy(desc(transactions.txDate), desc(transactions.createdAt))
    .limit(100);
  return c.json({ transactions: rows });
});

app.get("/:id/members", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  if (!(await canAccessAccount(userId, id))) return c.json({ error: "not found" }, 404);
  const [account] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  if (!account) return c.json({ error: "not found" }, 404);

  const memberRows = await db
    .select({
      userId: accountMembers.userId,
      role: accountMembers.role,
      displayName: users.displayName,
      pictureUrl: users.pictureUrl,
    })
    .from(accountMembers)
    .innerJoin(users, eq(users.id, accountMembers.userId))
    .where(eq(accountMembers.accountId, id));

  const [owner] = await db
    .select({ id: users.id, displayName: users.displayName, pictureUrl: users.pictureUrl })
    .from(users)
    .where(eq(users.id, account.userId))
    .limit(1);

  return c.json({
    owner,
    members: memberRows,
  });
});

const ShareSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["editor"]).optional(),
});

app.post("/:id/members", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const [account] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  if (!account) return c.json({ error: "not found" }, 404);
  if (account.userId !== userId) return c.json({ error: "forbidden: owner only" }, 403);

  const body = await c.req.json().catch(() => null);
  const parsed = ShareSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "bad request" }, 400);
  if (parsed.data.userId === userId) return c.json({ error: "owner is implicit" }, 400);

  const [target] = await db.select().from(users).where(eq(users.id, parsed.data.userId)).limit(1);
  if (!target) return c.json({ error: "user not found" }, 404);

  await db
    .insert(accountMembers)
    .values({ accountId: id, userId: parsed.data.userId, role: parsed.data.role ?? "editor" })
    .onConflictDoNothing();

  try {
    if (target.lineUserId) {
      const [owner] = await db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, account.userId))
        .limit(1);
      const ownerName = owner?.displayName ?? "對方";
      const text = `「${ownerName}」將「${account.name}」分享給你了，現在你也可以對這個帳戶記帳。`;
      await lineClient().pushMessage({
        to: target.lineUserId,
        messages: [{ type: "text", text }],
      });
    }
  } catch (e) {
    console.warn("share notify push failed:", e instanceof Error ? e.message : e);
  }

  return c.json({ ok: true });
});

app.delete("/:id/members/:userId", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const targetId = c.req.param("userId");
  const [account] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  if (!account) return c.json({ error: "not found" }, 404);
  if (account.userId !== userId && userId !== targetId) {
    return c.json({ error: "forbidden" }, 403);
  }
  await db
    .delete(accountMembers)
    .where(and(eq(accountMembers.accountId, id), eq(accountMembers.userId, targetId)));
  return c.json({ ok: true });
});

export default app;
