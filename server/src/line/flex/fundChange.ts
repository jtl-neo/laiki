import type { messagingApi } from "@line/bot-sdk";

export interface FundChangeInput {
  fundName: string;
  description: string | null;
  amount: number;
  /** Positive = 入金, negative = 支出 (display only). */
  isOut: boolean;
  byDisplayName: string;
  balanceAfter: number;
}

function money(n: number): string {
  return `NT$${n.toLocaleString("zh-TW")}`;
}

/** 共同基金變動通知卡 (新想法 範例三). */
export function buildFundChangeFlex(input: FundChangeInput): messagingApi.FlexMessage {
  const negative = input.balanceAfter < 0;
  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: "🏡 共同基金變動", weight: "bold", color: "#1D7FB4", size: "sm" },
        {
          type: "text",
          text: `${input.isOut ? "-" : "+"}${money(input.amount)}`,
          weight: "bold",
          size: "xxl",
          margin: "md",
          color: input.isOut ? "#D14B00" : "#1DB446",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        kv("帳本", input.fundName),
        ...(input.description ? [kv("品項", input.description)] : []),
        kv("登記人", input.byDisplayName),
        kv("剩餘額度", money(input.balanceAfter)),
        ...(negative
          ? [
              {
                type: "text" as const,
                text: "⚠️ 基金餘額不足，已記為負值",
                size: "xs" as const,
                color: "#D14B00",
                margin: "md" as const,
              },
            ]
          : []),
      ],
    },
  };
  return {
    type: "flex",
    altText: `共同基金「${input.fundName}」${input.isOut ? "-" : "+"}${money(input.amount)}，剩餘 ${money(input.balanceAfter)}`,
    contents: bubble,
  };
}

function kv(k: string, v: string): messagingApi.FlexBox {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: k, size: "sm", color: "#8C8C8C", flex: 2 },
      { type: "text", text: v, size: "sm", flex: 5, wrap: true },
    ],
  };
}
