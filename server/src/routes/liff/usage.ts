import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { aiUsage } from "../../db/schema.js";
import { requireSession } from "../../lib/auth.js";

const PARSE_QUOTA = 50;
const RECOGNIZE_QUOTA = 30;

const app = new Hono<{ Variables: { userId: string } }>();

app.use("*", requireSession);

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

app.get("/ai-usage", async (c) => {
  const userId = c.get("userId");
  const month = currentMonth();
  const [row] = await db
    .select()
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), eq(aiUsage.month, month)))
    .limit(1);
  return c.json({
    month,
    parse_count: row?.parseCount ?? 0,
    recognize_count: row?.recognizeCount ?? 0,
    parse_quota: PARSE_QUOTA,
    recognize_quota: RECOGNIZE_QUOTA,
  });
});

export default app;
