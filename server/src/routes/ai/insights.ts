import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { requireSession } from "../../lib/auth.js";
import { db } from "../../db/client.js";
import { aiInsights, groupMembers } from "../../db/schema.js";
import type { InsightData } from "../../ai/weeklyInsight.js";

const app = new Hono<{ Variables: { userId: string } }>();

app.use("*", requireSession);

app.get("/:groupId/latest", async (c) => {
  const userId = c.get("userId");
  const groupId = c.req.param("groupId");

  const member = await db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .limit(1);

  if (member.length === 0) return c.json({ error: "forbidden" }, 403);

  const rows = await db
    .select()
    .from(aiInsights)
    .where(eq(aiInsights.groupId, groupId))
    .orderBy(desc(aiInsights.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row) return c.json({ insights: null });

  return c.json({
    insights: row.insights as InsightData,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    createdAt: row.createdAt,
  });
});

export default app;
