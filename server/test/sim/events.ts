import type { webhook } from "@line/bot-sdk";

/**
 * LINE webhook event factories for the simulation harness.
 * All events default to a 1-on-1 user chat (source.type === "user").
 */

let seq = 0;
function nextId(): string {
  seq += 1;
  return `evt_${seq}`;
}

function base(lineUserId: string) {
  return {
    mode: "active" as const,
    timestamp: Date.now(),
    source: { type: "user" as const, userId: lineUserId },
    webhookEventId: nextId(),
    deliveryContext: { isRedelivery: false },
  };
}

export function textEvent(lineUserId: string, text: string): webhook.Event {
  return {
    ...base(lineUserId),
    type: "message",
    replyToken: `reply_${nextId()}`,
    message: {
      id: nextId(),
      type: "text",
      text,
      quoteToken: `quote_${nextId()}`,
    },
  } as webhook.Event;
}

export function postbackEvent(lineUserId: string, data: string): webhook.Event {
  return {
    ...base(lineUserId),
    type: "postback",
    replyToken: `reply_${nextId()}`,
    postback: { data },
  } as webhook.Event;
}

export function followEvent(lineUserId: string): webhook.Event {
  return {
    ...base(lineUserId),
    type: "follow",
    replyToken: `reply_${nextId()}`,
    follow: { isUnblocked: false },
  } as webhook.Event;
}

export function imageEvent(lineUserId: string, messageId = "img_1"): webhook.Event {
  return {
    ...base(lineUserId),
    type: "message",
    replyToken: `reply_${nextId()}`,
    message: {
      id: messageId,
      type: "image",
      contentProvider: { type: "line" },
      quoteToken: `quote_${nextId()}`,
    },
  } as webhook.Event;
}
