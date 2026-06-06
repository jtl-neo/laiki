import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { webhook } from "@line/bot-sdk";
import { channelSecret } from "../../line/client.js";
import { handleFollow } from "../../line/handlers/follow.js";
import { handleUnfollow } from "../../line/handlers/unfollow.js";
import { handleTextMessage } from "../../line/handlers/message.js";
import { handleImageMessage } from "../../line/handlers/image.js";
import { handlePostback } from "../../line/handlers/postback.js";
import { handleLeave } from "../../line/handlers/leave.js";
import { logger } from "../../lib/logger.js";
import { incr } from "../metrics.js";

const app = new Hono();

app.post("/", async (c) => {
  const signature = c.req.header("x-line-signature") ?? "";
  const raw = await c.req.text();

  const expected = createHmac("sha256", channelSecret()).update(raw).digest("base64");
  let ok = false;
  try {
    ok =
      signature.length === expected.length &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    ok = false;
  }
  if (!ok) return c.json({ error: "bad signature" }, 401);

  let body: { events?: webhook.Event[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return c.json({ error: "bad json" }, 400);
  }

  for (const event of body.events ?? []) {
    incr("webhook_total");
    dispatch(event).catch((e) => logger.error({ err: e }, "event handler error"));
  }
  return c.json({ ok: true });
});

/** Exported for the simulation test harness (test/sim/harness.ts). */
export async function dispatch(event: webhook.Event): Promise<void> {
  // Full events carry message text + user ids (PII) → debug only;
  // info level keeps just the routing metadata.
  logger.debug({ event }, "webhook event");
  logger.info(
    { type: event.type, sourceType: event.source?.type },
    "webhook event received",
  );
  // 1對1 architecture (新想法): the bot lives in private chats only.
  // Group/room events are never answered — the lone exception is `leave`,
  // which is internal cleanup with no reply.
  const src = event.source;
  if (src && (src.type === "group" || src.type === "room")) {
    if (event.type === "leave") return handleLeave(event);
    logger.debug({ type: event.type }, "group event ignored (1-on-1 only)");
    return;
  }

  switch (event.type) {
    case "follow":
      return handleFollow(event);
    case "unfollow":
      return handleUnfollow(event);
    case "message":
      if (event.message.type === "image") return handleImageMessage(event);
      return handleTextMessage(event);
    case "postback":
      return handlePostback(event);
    default:
      return;
  }
}

export default app;
