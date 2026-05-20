import { Hono } from "hono";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "../../db/client.js";
import { groupMembers, groups, users } from "../../db/schema.js";
import { requireSession } from "../../lib/auth.js";

const app = new Hono<{ Variables: { userId: string } }>();
app.use("*", requireSession);

app.get("/contacts", async (c) => {
  const userId = c.get("userId");
  const myGroups = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId));
  const gids = myGroups.map((g) => g.groupId);
  if (gids.length === 0) return c.json({ contacts: [] });

  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      pictureUrl: users.pictureUrl,
      groupName: groups.name,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(and(inArray(groupMembers.groupId, gids), ne(groupMembers.userId, userId)));

  const map = new Map<
    string,
    { id: string; displayName: string | null; pictureUrl: string | null; viaGroups: string[] }
  >();
  for (const r of rows) {
    const existing = map.get(r.id);
    if (existing) {
      if (!existing.viaGroups.includes(r.groupName)) existing.viaGroups.push(r.groupName);
    } else {
      map.set(r.id, {
        id: r.id,
        displayName: r.displayName,
        pictureUrl: r.pictureUrl,
        viaGroups: [r.groupName],
      });
    }
  }

  return c.json({ contacts: Array.from(map.values()) });
});

export default app;
