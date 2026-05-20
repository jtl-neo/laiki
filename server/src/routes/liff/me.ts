import { Hono } from "hono";
import { and, eq, isNull, notInArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users, groups, groupMembers, accounts, userApiKeys } from "../../db/schema.js";
import { requireSession } from "../../lib/auth.js";
import { getAllFundAccountIds } from "../../lib/fundFilters.js";

const app = new Hono<{ Variables: { userId: string } }>();

app.use("*", requireSession);

app.get("/me", async (c) => {
  const userId = c.get("userId");
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return c.json({ error: "not found" }, 404);

  const memberRows = await db
    .select({ group: groups })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(eq(groupMembers.userId, userId));

  const fundAcctIds = await getAllFundAccountIds();
  const accountRows = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        isNull(accounts.archivedAt),
        fundAcctIds.length > 0 ? notInArray(accounts.id, fundAcctIds) : undefined,
      ),
    );

  const [apiKey] = await db
    .select({ keyHint: userApiKeys.keyHint })
    .from(userApiKeys)
    .where(eq(userApiKeys.userId, userId))
    .orderBy(userApiKeys.createdAt)
    .limit(1);

  return c.json({
    user: {
      id: u.id,
      displayName: u.displayName,
      pictureUrl: u.pictureUrl,
      locale: u.locale,
    },
    groups: memberRows.map((r) => r.group),
    accounts: accountRows,
    byok: apiKey ? { keyHint: apiKey.keyHint } : null,
  });
});

export default app;
