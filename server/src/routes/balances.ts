import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { groupMembers, users } from "../db/schema.js";
import { requireSession } from "../lib/auth.js";
import { computeBalances } from "../lib/balances.js";

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

app.get("/:id/balances", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  if (!(await userInGroup(userId, id))) return c.json({ error: "forbidden" }, 403);

  const balances = await computeBalances(id);

  const memberRows = await db
    .select({ userId: users.id, displayName: users.displayName })
    .from(users)
    .innerJoin(groupMembers, eq(groupMembers.userId, users.id))
    .where(eq(groupMembers.groupId, id));

  const nameMap = new Map<string, string | null>();
  for (const m of memberRows) nameMap.set(m.userId, m.displayName);

  const result = balances.map((b) => ({
    userId: b.userId,
    displayName: nameMap.get(b.userId) ?? null,
    net: b.net,
  }));

  return c.json({ balances: result });
});

export default app;
