import type { messagingApi } from "@line/bot-sdk";

export interface ClaimHistoryInput {
  iOwe: { displayName: string | null; amount: number }[];
  owedToMe: { displayName: string | null; amount: number }[];
}

function money(n: number): string {
  return `NT$${n.toLocaleString("zh-TW")}`;
}

/** 認領歷史帳目 Bento 卡 (新想法 範例二). */
export function buildClaimHistoryFlex(input: ClaimHistoryInput): messagingApi.FlexMessage {
  const empty = input.iOwe.length === 0 && input.owedToMe.length === 0;
  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "🎉 歡迎加入！已成功認領歷史帳目",
          weight: "bold",
          color: "#1DB446",
          size: "sm",
          wrap: true,
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: empty
        ? [{ type: "text", text: "目前沒有未結帳務 ✨", size: "sm" }]
        : [
            ...input.iOwe.map(
              (o): messagingApi.FlexComponent => ({
                type: "text",
                text: `🔴 您欠 ${o.displayName ?? "對方"}：${money(o.amount)}`,
                size: "sm",
                wrap: true,
              }),
            ),
            ...input.owedToMe.map(
              (o): messagingApi.FlexComponent => ({
                type: "text",
                text: `🟢 ${o.displayName ?? "對方"} 欠您：${money(o.amount)}`,
                size: "sm",
                wrap: true,
              }),
            ),
          ],
    },
  };
  return {
    type: "flex",
    altText: "歡迎加入！已成功認領歷史帳目",
    contents: bubble,
  };
}
