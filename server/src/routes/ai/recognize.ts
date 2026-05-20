import { Hono } from "hono";
import { z } from "zod";
import { requireSession } from "../../lib/auth.js";
import { checkAndConsume } from "../../lib/quota.js";
import { recognizeReceipt } from "../../ai/recognizeReceipt.js";

const app = new Hono<{ Variables: { userId: string } }>();

const MAX_BASE64_LEN = Math.floor((10 * 1024 * 1024 * 4) / 3); // 10MB raw ≈ 13.5MB base64
const MAX_IMAGES = 8;

const ImageSchema = z.object({
  imageBase64: z.string().min(1).max(MAX_BASE64_LEN),
  mimeType: z.string().min(1),
});

const BodySchema = z.union([
  ImageSchema,
  z.object({ images: z.array(ImageSchema).min(1).max(MAX_IMAGES) }),
]);

app.use("*", requireSession);

app.post("/", async (c) => {
  const json = await c.req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return c.json({ error: "bad request" }, 400);

  const userId = c.get("userId");
  const quota = await checkAndConsume(userId, "recognize");
  if (!quota.allowed) return c.json({ error: "quota_exceeded" }, 402);

  const images =
    "images" in parsed.data
      ? parsed.data.images.map((i) => ({ base64: i.imageBase64, mimeType: i.mimeType }))
      : [{ base64: parsed.data.imageBase64, mimeType: parsed.data.mimeType }];

  try {
    const result = await recognizeReceipt(quota.provider, images);
    return c.json({ result, usingBYOK: quota.usingBYOK });
  } catch (e) {
    console.error("ai/recognize failed:", e);
    return c.json({ error: "recognize_failed" }, 502);
  }
});

export default app;
