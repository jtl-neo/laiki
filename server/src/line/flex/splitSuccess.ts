import type { messagingApi } from "@line/bot-sdk";

export interface SplitSuccessInput {
  description: string | null;
  totalAmount: number;
  accountName: string;
  myShare: number;
  debtors: { name: string; amount: number; isVirtual: boolean }[];
}

function money(n: number): string {
  return `NT$${n.toLocaleString("zh-TW")}`;
}

/** 分帳成功 Bento 卡 (新想法 範例一). */
export function buildSplitSuccessFlex(input: SplitSuccessInput): messagingApi.FlexMessage {
  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: `🍔 ${input.description ?? "分帳"}（分帳成功）`,
          weight: "bold",
          color: "#1DB446",
          size: "sm",
          wrap: true,
        },
        {
          type: "text",
          text: money(input.totalAmount),
          weight: "bold",
          size: "xxl",
          margin: "md",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        kv("💳 支付", input.accountName),
        kv("👤 你的分攤", money(input.myShare)),
        ...input.debtors.map((d) =>
          kv(
            `👤 ${d.name}${d.isVirtual ? "（未綁定）" : ""}`,
            `應付 ${money(d.amount)}`,
          ),
        ),
      ],
    },
  };
  return {
    type: "flex",
    altText: `分帳成功：${input.description ?? ""} ${money(input.totalAmount)}`,
    contents: bubble,
  };
}

function kv(k: string, v: string): messagingApi.FlexBox {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: k, size: "sm", color: "#555555", flex: 4, wrap: true },
      { type: "text", text: v, size: "sm", flex: 3, align: "end", wrap: true },
    ],
  };
}
