import type { messagingApi } from "@line/bot-sdk";

export interface TransferFlexInput {
  txId: string;
  amount: number;
  fromAccount: string;
  toAccount: string;
  fromBalance: number;
  toBalance: number;
  liffEditUrl: string;
}

export function buildTransferFlex(args: TransferFlexInput): messagingApi.FlexMessage {
  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "⇄ 已記錄轉帳",
          weight: "bold",
          color: "#1DB446",
          size: "sm",
        },
        {
          type: "text",
          text: `NT$${args.amount.toLocaleString("zh-TW")}`,
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
        kv("流向", `「${args.fromAccount}」→「${args.toAccount}」`),
        kv(
          `${args.fromAccount} 餘額`,
          `NT$${args.fromBalance.toLocaleString("zh-TW")}`,
        ),
        kv(
          `${args.toAccount} 餘額`,
          `NT$${args.toBalance.toLocaleString("zh-TW")}`,
        ),
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
            data: `action=tx_cancel&txId=${args.txId}`,
            displayText: "取消這筆轉帳",
          },
        },
        {
          type: "button",
          style: "primary",
          height: "sm",
          action: { type: "uri", label: "改", uri: args.liffEditUrl },
        },
      ],
    },
  };

  return {
    type: "flex",
    altText: `轉帳 NT$${args.amount} ${args.fromAccount} → ${args.toAccount}`,
    contents: bubble,
  };
}

function kv(k: string, v: string): messagingApi.FlexBox {
  return {
    type: "box",
    layout: "baseline",
    contents: [
      { type: "text", text: k, size: "sm", color: "#888888", flex: 3 },
      { type: "text", text: v, size: "sm", color: "#333333", flex: 5, wrap: true },
    ],
  };
}
