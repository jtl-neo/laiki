import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { webhook } from "@line/bot-sdk";
import { channelSecret } from "../../line/client.js";
import { handleFollow } from "../../line/handlers/follow.js";
import { handleUnfollow } from "../../line/handlers/unfollow.js";
import { handleTextMessage } from "../../line/handlers/message.js";
import { handleImageMessage } from "../../line/handlers/image.js";
import { handlePostback } from "../../line/handlers/postback.js";
import { handleJoin } from "../../line/handlers/join.js";
import { handleLeave } from "../../line/handlers/leave.js";
import { handleMemberJoined } from "../../line/handlers/memberJoined.js";
import { registerGroupParticipant } from "../../line/registerParticipant.js";
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

async function dispatch(event: webhook.Event): Promise<void> {
  logger.info({ event }, "webhook event");
  const src = event.source;
  if (src && (src.type === "group" || src.type === "room") && src.userId) {
    const gid = src.type === "group" ? src.groupId : src.roomId;
    try {
      await registerGroupParticipant(src.userId, gid);
    } catch (e) {
      logger.warn({ err: e }, "registerGroupParticipant failed");
    }

    if (event.type === "message" && event.message.type === "text") {
      const mention = (
        event.message as {
          mention?: {
            mentionees?: { userId?: string; isSelf?: boolean; type?: string }[];
          };
        }
      ).mention;
      const mentioned = mention?.mentionees ?? [];
      for (const m of mentioned) {
        if (m.isSelf) continue;
        if (m.type && m.type !== "user") continue;
        if (!m.userId) continue;
        if (m.userId === src.userId) continue;
        try {
          await registerGroupParticipant(m.userId, gid);
        } catch (e) {
          logger.warn({ err: e, mentionedUserId: m.userId }, "register mentioned user failed");
        }
      }
    }
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
    case "join":
      return handleJoin(event);
    case "leave":
      return handleLeave(event);
    case "memberJoined":
      return handleMemberJoined(event);
    default:
      return;
  }
}

export default app;
