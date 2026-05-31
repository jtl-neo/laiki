import { Hono } from "hono";
import { and, count, eq, gte, lt } from "drizzle-orm";
import { db } from "../../db/client.js";
import { aiRecords } from "../../db/schema.js";
import { requireSession } from "../../lib/auth.js";

const app = new Hono<{ Variables: { userId: string } }>();

app.use("*", requireSession);

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** [start, end) UTC bounds for the current calendar month. */
function monthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

app.get("/ai-usage", async (c) => {
  const userId = c.get("userId");
  const month = currentMonth();
  const { start, end } = monthRange();

  // Real monthly counts come from ai_records (ai_usage no longer increments).
  let parseCount = 0;
  let recognizeCount = 0;
  try {
    const rows = await db
      .select({ op: aiRecords.op, n: count() })
      .from(aiRecords)
      .where(
        and(
          eq(aiRecords.userId, userId),
          gte(aiRecords.createdAt, start),
          lt(aiRecords.createdAt, end),
        ),
      )
      .groupBy(aiRecords.op);
    for (const r of rows) {
      if (r.op === "parse") parseCount = Number(r.n);
      else if (r.op === "recognize") recognizeCount = Number(r.n);
    }
  } catch {
    // Never crash the endpoint over an analytics read; fall back to zeros.
  }

  return c.json({
    month,
    parse_count: parseCount,
    recognize_count: recognizeCount,
    // Quotas were removed (usage is unlimited): report null rather than a stale
    // hardcoded cap. Counts above are kept for backward compatibility.
    parse_quota: null,
    recognize_quota: null,
  });
});

export default app;
