import { Hono } from "hono";
import { z } from "zod";
import { and, eq, isNull, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  accounts,
  transactions,
  budgets,
  userPreferences,
  groupMembers,
  groups,
} from "../../db/schema.js";
import { requireSession } from "../../lib/auth.js";
import { ensureUserDefaults } from "../../lib/ensureDefaults.js";
import { getAllFundAccountIds } from "../../lib/fundFilters.js";

const app = new Hono<{ Variables: { userId: string } }>();
app.use("*", requireSession);

const EXPORT_VERSION = 1;

app.get("/export", async (c) => {
  const userId = c.get("userId");

  const fundAcctIds = new Set(await getAllFundAccountIds());
  const allAccs = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), isNull(accounts.archivedAt)));
  const accs = allAccs.filter((a) => !fundAcctIds.has(a.id));
  const accIds = accs.map((a) => a.id);

  const txs = accIds.length
    ? await db
        .select()
        .from(transactions)
        .where(inArray(transactions.accountId, accIds))
    : [];

  const bgts = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.userId, userId), isNull(budgets.groupId)));

  const [prefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  const payload = {
    meta: {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      userId,
    },
    accounts: accs.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      last4: a.last4,
      currency: a.currency,
      balance: a.balance,
      initialBalance: a.initialBalance,
      icon: a.icon,
      color: a.color,
    })),
    transactions: txs.map((t) => {
      const acc = accs.find((a) => a.id === t.accountId);
      return {
        id: t.id,
        accountId: t.accountId,
        accountName: acc?.name ?? null,
        amount: t.amount,
        txDate: t.txDate,
        category: t.category,
        kind: t.kind,
        note: t.note,
        source: t.source,
      };
    }),
    budgets: bgts.map((b) => ({
      category: b.category,
      monthlyLimit: b.monthlyLimit,
    })),
    preferences: prefs
      ? {
          defaultProvider: prefs.defaultProvider,
          notifyWeekly: prefs.notifyWeekly,
          notifyMonthly: prefs.notifyMonthly,
          notifyNudge: prefs.notifyNudge,
        }
      : null,
  };

  const ts = payload.meta.exportedAt.slice(0, 10);
  c.header("content-type", "application/json; charset=utf-8");
  c.header("content-disposition", `attachment; filename="laiki-export-${ts}.json"`);
  return c.body(JSON.stringify(payload, null, 2));
});

const ImportSchema = z.object({
  meta: z.object({ version: z.number() }),
  accounts: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(60),
        type: z.string(),
        last4: z.string().nullable().optional(),
        currency: z.string().optional(),
        balance: z.string().optional(),
        initialBalance: z.string().optional(),
        icon: z.string().nullable().optional(),
        color: z.string().nullable().optional(),
      }),
    )
    .default([]),
  transactions: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        accountId: z.string().uuid().nullable().optional(),
        accountName: z.string().nullable().optional(),
        amount: z.string(),
        txDate: z.string(),
        category: z.string().nullable().optional(),
        kind: z.string(),
        note: z.string().nullable().optional(),
        source: z.string().optional(),
      }),
    )
    .default([]),
  budgets: z
    .array(
      z.object({
        category: z.string().nullable(),
        monthlyLimit: z.string(),
      }),
    )
    .default([]),
  preferences: z
    .object({
      defaultProvider: z.string().nullable().optional(),
      notifyWeekly: z.boolean().optional(),
      notifyMonthly: z.boolean().optional(),
      notifyNudge: z.boolean().optional(),
    })
    .nullable()
    .optional(),
  mode: z.enum(["merge", "replace"]).optional(),
});

app.post("/import", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => null);
  const parsed = ImportSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid payload", detail: parsed.error.issues }, 400);
  if (parsed.data.meta.version !== EXPORT_VERSION) {
    return c.json({ error: `unsupported version ${parsed.data.meta.version}` }, 400);
  }

  await ensureUserDefaults(userId);

  const [member] = await db
    .select({ groupId: groupMembers.groupId, type: groups.type })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(and(eq(groupMembers.userId, userId), eq(groups.type, "shared")))
    .limit(1);
  if (!member) return c.json({ error: "no default group" }, 500);
  const defaultGroupId = member.groupId;

  const existing = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));
  const nameToId = new Map(existing.map((a) => [a.name, a.id]));
  const oldToNewId = new Map<string, string>();
  for (const a of existing) oldToNewId.set(a.id, a.id);

  let createdAccounts = 0;
  for (const a of parsed.data.accounts) {
    const existsId = nameToId.get(a.name);
    if (existsId) {
      if (a.id) oldToNewId.set(a.id, existsId);
      continue;
    }
    const [row] = await db
      .insert(accounts)
      .values({
        userId,
        name: a.name,
        type: a.type as "cash",
        last4: a.last4 ?? null,
        currency: a.currency ?? "TWD",
        balance: a.balance ?? "0",
        initialBalance: a.initialBalance ?? "0",
        icon: a.icon ?? null,
        color: a.color ?? null,
      })
      .returning({ id: accounts.id });
    if (row) {
      nameToId.set(a.name, row.id);
      if (a.id) oldToNewId.set(a.id, row.id);
      createdAccounts++;
    }
  }

  let createdTxs = 0;
  let skippedTxs = 0;
  for (const t of parsed.data.transactions) {
    let accId: string | undefined;
    if (t.accountId) accId = oldToNewId.get(t.accountId);
    if (!accId && t.accountName) accId = nameToId.get(t.accountName);
    if (!accId) {
      skippedTxs++;
      continue;
    }
    await db.insert(transactions).values({
      groupId: defaultGroupId,
      accountId: accId,
      amount: t.amount,
      txDate: t.txDate,
      paidByUserId: userId,
      category: t.category ?? null,
      kind: t.kind as "expense",
      note: t.note ?? null,
      source: "manual",
    });
    createdTxs++;
  }

  let createdBudgets = 0;
  for (const b of parsed.data.budgets) {
    await db.insert(budgets).values({
      userId,
      groupId: null,
      category: b.category ?? null,
      monthlyLimit: b.monthlyLimit,
    });
    createdBudgets++;
  }

  if (parsed.data.preferences) {
    const p = parsed.data.preferences;
    await db
      .insert(userPreferences)
      .values({
        userId,
        defaultProvider: (p.defaultProvider as "gemini") ?? null,
        notifyWeekly: p.notifyWeekly ?? true,
        notifyMonthly: p.notifyMonthly ?? true,
        notifyNudge: p.notifyNudge ?? true,
      })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          defaultProvider: (p.defaultProvider as "gemini") ?? null,
          notifyWeekly: p.notifyWeekly ?? true,
          notifyMonthly: p.notifyMonthly ?? true,
          notifyNudge: p.notifyNudge ?? true,
          updatedAt: new Date(),
        },
      });
  }

  return c.json({
    ok: true,
    summary: {
      accounts: createdAccounts,
      transactions: createdTxs,
      skippedTransactions: skippedTxs,
      budgets: createdBudgets,
    },
  });
});

export default app;
