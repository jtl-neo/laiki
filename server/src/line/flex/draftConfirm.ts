import type { messagingApi } from "@line/bot-sdk";
import type { Mode } from "../../lib/pendingEntry.js";

type FlexMessage = messagingApi.FlexMessage;
type FlexComponent = messagingApi.FlexComponent;

function money(n: number): string {
  return `NT$${n.toLocaleString("zh-TW")}`;
}

export function buildDraftConfirmFlex(args: {
  pendingId: string;
  mode: Mode;
  amount: number;
  category: string | null;
  accountName: string;
  groupName: string | null;
  participantsLabel: string | null;
  perHead: number | null;
  kindLabel: string;
  confidence: number;
}): FlexMessage {
  const {
    pendingId,
    mode,
    amount,
    category,
    accountName,
    groupName,
    participantsLabel,
    perHead,
    kindLabel,
    confidence,
  } = args;

  const detailRows: FlexComponent[] = [
    kv("類型", kindLabel),
    kv("金額", money(amount)),
    kv("分類", category ?? "未分類"),
    kv("帳戶", accountName),
  ];
  if (groupName) detailRows.push(kv("群組", groupName));
  if (mode === "group_split" && participantsLabel) {
    detailRows.push(kv("分帳", participantsLabel));
    if (perHead != null) detailRows.push(kv("每人", money(perHead)));
  }

  const editButtons: FlexComponent[] = [
    {
      type: "button",
      style: "secondary",
      height: "sm",
      action: {
        type: "postback",
        label: "改金額",
        data: `action=ask_amount&pendingId=${pendingId}`,
        displayText: "改金額",
      },
    },
    {
      type: "button",
      style: "secondary",
      height: "sm",
      action: {
        type: "postback",
        label: "改分類",
        data: `action=ask_category&pendingId=${pendingId}`,
        displayText: "改分類",
      },
    },
  ];
  if (mode === "group_split") {
    editButtons.push({
      type: "button",
      style: "secondary",
      height: "sm",
      action: {
        type: "postback",
        label: "改成員",
        data: `action=ask_participants&pendingId=${pendingId}`,
        displayText: "改成員",
      },
    });
  }

  return {
    type: "flex",
    altText: `確認記帳 ${kindLabel} ${money(amount)}`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "📝 確認記帳", weight: "bold", size: "lg" },
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: detailRows,
          },
          {
            type: "text",
            text: `AI 信心 ${Math.round(confidence * 100)}%`,
            size: "xxs",
            color: "#aaaaaa",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "sm",
            action: {
              type: "postback",
              label: "✅ 確認記帳",
              data: `action=confirm_entry&pendingId=${pendingId}`,
              displayText: "確認記帳",
            },
          },
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: editButtons,
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            action: {
              type: "postback",
              label: "❌ 取消",
              data: `action=cancel_entry&pendingId=${pendingId}`,
              displayText: "取消",
            },
          },
        ],
      },
    },
  };
}

function kv(k: string, v: string): messagingApi.FlexBox {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: k, size: "sm", color: "#999999", flex: 2 },
      { type: "text", text: v, size: "sm", color: "#333333", flex: 5, wrap: true },
    ],
  };
}
