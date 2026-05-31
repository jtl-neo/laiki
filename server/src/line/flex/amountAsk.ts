import type { messagingApi } from "@line/bot-sdk";
import { quickReplyActions } from "../reply.js";

function money(n: number): string {
  return `NT$${n.toLocaleString("zh-TW")}`;
}

/**
 * Build a text message with a quick-reply for picking / typing the amount.
 * Each guess posts action=set_amount&pendingId=...&amount=N.
 * If the user types a plain number instead, the handler phase will catch it.
 */
export function buildAmountAskQuickReply(
  pendingId: string,
  guesses: number[],
): messagingApi.TextMessage {
  const items = guesses.map((g) => ({
    label: money(g),
    data: `action=set_amount&pendingId=${pendingId}&amount=${g}`,
    displayText: money(g),
  }));
  return {
    type: "text",
    text: "這筆多少錢？輸入數字或選擇下方金額。",
    quickReply: quickReplyActions(items),
  };
}
