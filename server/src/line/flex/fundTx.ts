import type { messagingApi } from "@line/bot-sdk";

export interface FundTxInput {
  txId: string;
  user: string;
  kind: "fund_in" | "fund_out";
  amount: number;
  fundBalance: number;
  fundName: string;
  liffEditUrl: string;
  note?: string | null;
  userContribution?: number;
}

export function buildFundTxFlex(input: FundTxInput): messagingApi.FlexMessage {
  const label = input.kind === "fund_in" ? "存入" : "支出";
  const color = input.kind === "fund_in" ? "#1DB446" : "#D17B00";

  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: `✓ ${input.fundName} ${label}`,
          weight: "bold",
          color,
          size: "sm",
        },
        {
          type: "text",
          text: `${input.user} ${label} NT$${input.amount.toLocaleString("zh-TW")}`,
          weight: "bold",
          size: "lg",
          margin: "md",
          wrap: true,
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        kv("基金", input.fundName),
        kv("動作", label),
        kv("金額", `NT$${input.amount.toLocaleString("zh-TW")}`),
        kv("基金餘額", `NT$${input.fundBalance.toLocaleString("zh-TW")}`),
        ...(input.kind === "fund_in" && typeof input.userContribution === "number"
          ? [
              kv(
                "成員累計貢獻",
                `NT$${input.userContribution.toLocaleString("zh-TW")}`,
              ),
            ]
          : []),
        ...(input.note ? [kv("成員", input.note)] : []),
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
    altText: `${input.user} ${label} NT$${input.amount}，基金餘額 NT$${input.fundBalance}`,
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
