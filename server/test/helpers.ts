// Test helpers for integration suites.
//
// We intentionally do NOT import `src/index.ts` because that file calls
// `serve()` and `startJobs()` at module top-level. Instead we build a minimal
// Hono app that mounts the route modules under test against the test database.
import { randomBytes } from "node:crypto";
import { Hono } from "hono";

import type { db as DbType } from "../src/db/client.js";
import {
  users,
  sessions,
  accounts,
  groups,
  groupMembers,
} from "../src/db/schema.js";

type AppType = Hono;

let cachedApp: AppType | null = null;

export async function getApp(): Promise<AppType> {
  if (cachedApp) return cachedApp;
  // Dynamic imports so DATABASE_URL is already set by setup.ts.
  const transactions = (await import("../src/routes/transactions.js")).default;
  const accountsRoute = (await import("../src/routes/accounts.js")).default;
  const transfers = (await import("../src/routes/transfers.js")).default;
  const groupsRoute = (await import("../src/routes/groups.js")).default;
  const balances = (await import("../src/routes/balances.js")).default;
  const settle = (await import("../src/routes/settle.js")).default;
  const budgets = (await import("../src/routes/budgets.js")).default;
  const liffFriends = (await import("../src/routes/liff/friends.js")).default;

  const app = new Hono();
  app.route("/api/v1/liff", liffFriends);
  app.route("/api/v1/transactions", transactions);
  app.route("/api/v1/accounts", accountsRoute);
  app.route("/api/v1/transfers", transfers);
  app.route("/api/v1/groups", groupsRoute);
  app.route("/api/v1/groups", balances);
  app.route("/api/v1/groups", settle);
  app.route("/api/v1/budgets", budgets);
  cachedApp = app;
  return app;
}

export async function getDb(): Promise<typeof DbType> {
  const mod = await import("../src/db/client.js");
  return mod.db;
}

export async function getSql(): Promise<{ unsafe: (s: string) => Promise<unknown> }> {
  const mod = await import("../src/db/client.js");
  return mod.sql as unknown as { unsafe: (s: string) => Promise<unknown> };
}

export type SeededUser = {
  userId: string;
  sessionId: string;
  cookie: string;
};

export async function seedUser(displayName = "Tester"): Promise<SeededUser> {
  const db = await getDb();
  const lineUserId = `U_${randomBytes(8).toString("hex")}`;
  const [u] = await db.insert(users).values({ lineUserId, displayName }).returning();
  if (!u) throw new Error("seedUser: insert failed");
  const sessionId = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
  await db.insert(sessions).values({ id: sessionId, userId: u.id, expiresAt });
  return {
    userId: u.id,
    sessionId,
    cookie: `laiki_session=${sessionId}`,
  };
}

export async function seedAccount(
  userId: string,
  name = "Test",
  initial = 0,
): Promise<{ id: string }> {
  const db = await getDb();
  const [a] = await db
    .insert(accounts)
    .values({
      userId,
      name,
      type: "cash",
      initialBalance: initial.toFixed(2),
      balance: initial.toFixed(2),
    })
    .returning();
  if (!a) throw new Error("seedAccount: insert failed");
  return { id: a.id };
}

export async function seedGroup(
  ownerId: string,
  name = "Test",
): Promise<{ id: string }> {
  const db = await getDb();
  const [g] = await db
    .insert(groups)
    .values({ name, type: "shared", ownerUserId: ownerId })
    .returning();
  if (!g) throw new Error("seedGroup: insert failed");
  await db
    .insert(groupMembers)
    .values({ groupId: g.id, userId: ownerId, role: "owner", joinedVia: "manual" });
  return { id: g.id };
}

/** Insert a virtual (shadow) user: no LINE id, created by `creatorId`. */
export async function seedShadow(
  creatorId: string,
  displayName: string,
): Promise<{ id: string }> {
  const db = await getDb();
  const [u] = await db
    .insert(users)
    .values({ lineUserId: null, displayName, isVirtual: true, createdBy: creatorId })
    .returning();
  if (!u) throw new Error("seedShadow: insert failed");
  return { id: u.id };
}

export async function seedPaymentMethod(
  userId: string,
  name: string,
  type: "CASH" | "CREDIT" | "FUND" = "CASH",
): Promise<{ id: string }> {
  const db = await getDb();
  const { paymentMethods } = await import("../src/db/schema.js");
  const [pm] = await db.insert(paymentMethods).values({ userId, name, type }).returning();
  if (!pm) throw new Error("seedPaymentMethod: insert failed");
  return { id: pm.id };
}

/** Fund group with its dedicated fund account and the given members. */
export async function seedFundGroup(
  ownerId: string,
  name: string,
  balance: number,
  memberIds: string[] = [],
): Promise<{ groupId: string; fundAccountId: string }> {
  const db = await getDb();
  const [account] = await db
    .insert(accounts)
    .values({
      userId: ownerId,
      name: `${name} 基金`,
      type: "cash",
      initialBalance: balance.toFixed(2),
      balance: balance.toFixed(2),
    })
    .returning();
  if (!account) throw new Error("seedFundGroup: account insert failed");
  const [g] = await db
    .insert(groups)
    .values({ name, type: "fund", ownerUserId: ownerId, fundAccountId: account.id })
    .returning();
  if (!g) throw new Error("seedFundGroup: group insert failed");
  const members = [ownerId, ...memberIds];
  await db.insert(groupMembers).values(
    members.map((uid, i) => ({
      groupId: g.id,
      userId: uid,
      role: (i === 0 ? "owner" : "member") as "owner" | "member",
      joinedVia: "manual" as const,
    })),
  );
  return { groupId: g.id, fundAccountId: account.id };
}

export type AppRequestOpts = {
  cookie?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

export async function appRequest(
  method: string,
  path: string,
  opts: AppRequestOpts = {},
): Promise<Response> {
  const app = await getApp();
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.cookie) headers.cookie = opts.cookie;
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers["content-type"] = headers["content-type"] ?? "application/json";
    body = JSON.stringify(opts.body);
  }
  // Hono routes "/" via app.post("/"); when mounted under /api/v1/x, the
  // mounted prefix is the canonical match, so we strip a trailing slash on
  // non-root paths to keep test call sites tidy.
  const normalized = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  return app.request(normalized, { method, headers, body });
}

// TRUNCATE all data tables. Order doesn't matter with CASCADE.
const TABLES = [
  "sessions",
  "debts",
  "binding_codes",
  "payment_methods",
  "pending_entries",
  "ai_records",
  "transaction_splits",
  "transactions",
  "settlements",
  "account_members",
  "accounts",
  "budgets",
  "ai_insights",
  "ai_usage",
  "user_api_keys",
  "user_preferences",
  "group_members",
  "groups",
  "users",
];

export async function cleanDb(): Promise<void> {
  const sql = await getSql();
  await sql.unsafe(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
}
