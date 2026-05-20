import type { messagingApi } from "@line/bot-sdk";

export interface TxConfirmInput {
  txId: string;
  amount: number;
  category: string | null;
  accountName: string;
  groupName: string;
  note?: string | null;
  confidence: number;
  liffEditUrl: string;
}

export function buildTxConfirmFlex(input: TxConfirmInput): messagingApi.FlexMessage {
  const conf = Math.round(input.confidence * 100);
  const lowConf = input.confidence < 0.6;

  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: `✓ 已記錄${lowConf ? "（信心偏低，請確認）" : ""}`,
          weight: "bold",
          color: lowConf ? "#D17B00" : "#1DB446",
          size: "sm",
        },
        {
          type: "text",
          text: `NT$${input.amount.toLocaleString("zh-TW")}`,
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
        kv("群組", input.groupName),
        kv("帳戶", input.accountName),
        kv("分類", input.category ?? "未分類"),
        ...(input.note ? [kv("備註", input.note)] : []),
        kv("AI 信心", `${conf}%`),
      ],
    },
    footer: {
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "secondary",
          height: "sm",
          action: {
            type: "postback",
            label: "取消",
            data: `action=cancel_tx&txId=${input.txId}`,
            displayText: "取消這筆",
          },
        },
        {
          type: "button",
          style: "primary",
          height: "sm",
          action: { type: "uri", label: "編輯", uri: input.liffEditUrl },
        },
      ],
    },
  };

  return {
    type: "flex",
    altText: `已記錄 NT$${input.amount} ${input.category ?? ""}`.trim(),
    contents: bubble,
  };
}

function kv(k: string, v: string): messagingApi.FlexBox {
  return {
    type: "box",
    layout: "baseline",
    contents: [
      { type: "text", text: k, size: "sm", color: "#888888", flex: 2 },
      { type: "text", text: v, size: "sm", color: "#333333", flex: 5, wrap: true },
    ],
  };
}
