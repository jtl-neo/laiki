import type { messagingApi } from "@line/bot-sdk";
import { lineClient } from "./client.js";

export async function replyText(
  replyToken: string,
  text: string,
  quickReply?: messagingApi.QuickReply,
): Promise<void> {
  const msg: messagingApi.TextMessage = { type: "text", text };
  if (quickReply) msg.quickReply = quickReply;
  await lineClient().replyMessage({ replyToken, messages: [msg] });
}

export async function replyMessages(
  replyToken: string,
  messages: messagingApi.Message[],
): Promise<void> {
  await lineClient().replyMessage({ replyToken, messages });
}

export async function showLoading(userId: string, seconds = 30): Promise<void> {
  try {
    const valid = [5, 10, 15, 20, 25, 30, 40, 50, 60] as const;
    const s = valid.reduce((p, v) => (Math.abs(v - seconds) < Math.abs(p - seconds) ? v : p), 5 as number);
    await lineClient().showLoadingAnimation({ chatId: userId, loadingSeconds: s });
  } catch (e) {
    console.warn("showLoading failed:", e instanceof Error ? e.message : e);
  }
}

export function quickReplyActions(
  items: { label: string; data?: string; uri?: string; text?: string; displayText?: string }[],
): messagingApi.QuickReply {
  return {
    items: items.map((i) => ({
      type: "action",
      action: i.uri
        ? { type: "uri", label: i.label, uri: i.uri }
        : i.text !== undefined
          ? // Sends the text as a user message → re-enters the normal
            // command/parse flow (used for「記一筆」-style shortcuts).
            { type: "message", label: i.label, text: i.text }
          : { type: "postback", label: i.label, data: i.data ?? "", displayText: i.displayText ?? i.label },
    })),
  };
}

export function flexWithQuickReply<T extends messagingApi.Message>(
  msg: T,
  qr: messagingApi.QuickReply,
): T {
  return { ...msg, quickReply: qr };
}
