import { Hono } from "hono";
import { z } from "zod";
import { requireSession } from "../../lib/auth.js";
import { checkAndConsume } from "../../lib/quota.js";
import { parseText } from "../../ai/parseTransaction.js";

const app = new Hono<{ Variables: { userId: string } }>();

const BodySchema = z.object({ text: z.string().min(1).max(500) });

app.use("*", requireSession);

app.post("/parse", async (c) => {
  const json = await c.req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return c.json({ error: "bad request" }, 400);

  const userId = c.get("userId");
  const quota = await checkAndConsume(userId, "parse");

  try {
    const result = await parseText(quota.provider, parsed.data.text);
    return c.json({ result, usingBYOK: quota.usingBYOK });
  } catch (e) {
    console.error("ai/parse failed:", e);
    return c.json({ error: "parse_failed" }, 502);
  }
});

export default app;
