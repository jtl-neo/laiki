import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { userPreferences } from "../../db/schema.js";
import { requireSession } from "../../lib/auth.js";

const app = new Hono<{ Variables: { userId: string } }>();

app.use("*", requireSession);

app.get("/", async (c) => {
  const userId = c.get("userId");
  const [pref] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  return c.json({
    notifyWeekly: pref?.notifyWeekly ?? true,
    notifyMonthly: pref?.notifyMonthly ?? true,
    notifyNudge: pref?.notifyNudge ?? true,
  });
});

app.put("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => ({}));
  const patch: Record<string, boolean> = {};
  if (typeof body.notifyWeekly === "boolean") patch.notifyWeekly = body.notifyWeekly;
  if (typeof body.notifyMonthly === "boolean") patch.notifyMonthly = body.notifyMonthly;
  if (typeof body.notifyNudge === "boolean") patch.notifyNudge = body.notifyNudge;

  await db
    .insert(userPreferences)
    .values({
      userId,
      notifyWeekly: patch.notifyWeekly ?? true,
      notifyMonthly: patch.notifyMonthly ?? true,
      notifyNudge: patch.notifyNudge ?? true,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { ...patch, updatedAt: new Date() },
    });

  const [pref] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  return c.json({
    notifyWeekly: pref?.notifyWeekly ?? true,
    notifyMonthly: pref?.notifyMonthly ?? true,
    notifyNudge: pref?.notifyNudge ?? true,
  });
});

export default app;
