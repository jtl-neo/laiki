import type { messagingApi } from "@line/bot-sdk";

type FlexMessage = messagingApi.FlexMessage;
type FlexComponent = messagingApi.FlexComponent;

function money(n: number): string {
  return `NT$${n.toLocaleString("zh-TW")}`;
}

export function buildMemberToggleFlex(args: {
  pendingId: string;
  groupName: string;
  amountLabel: string;
  members: { userId: string; displayName: string; selected: boolean }[];
}): FlexMessage {
  const { pendingId, groupName, amountLabel, members } = args;
  const selectedCount = members.filter((m) => m.selected).length;
  const amount = parseAmount(amountLabel);
  const perHead =
    selectedCount > 0 ? Math.floor((amount / selectedCount) * 100) / 100 : 0;

  const memberRows: FlexComponent[] = members.map((m) => ({
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    contents: [
      {
        type: "text",
        text: `${m.selected ? "✅" : "⬜"} ${m.displayName}`,
        size: "sm",
        color: m.selected ? "#333333" : "#999999",
        flex: 5,
        wrap: true,
        gravity: "center",
      },
      {
        type: "button",
        style: m.selected ? "primary" : "secondary",
        height: "sm",
        flex: 2,
        action: {
          type: "postback",
          label: m.selected ? "移除" : "加入",
          data: `action=toggle_member&pendingId=${pendingId}&userId=${m.userId}`,
          displayText: m.selected ? `移除 ${m.displayName}` : `加入 ${m.displayName}`,
        },
      },
    ],
  }));

  return {
    type: "flex",
    altText: "請選擇分帳成員",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "👥 選擇分帳成員", weight: "bold", size: "lg" },
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            contents: [
              kv("群組", groupName),
              kv("總金額", amountLabel),
              kv(
                "已選",
                selectedCount > 0
                  ? `${selectedCount} 人 · 每人 ${money(perHead)}`
                  : "尚未選擇",
              ),
            ],
          },
          { type: "separator" },
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: memberRows,
          },
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
              label: "全選",
              data: `action=select_all_members&pendingId=${pendingId}`,
              displayText: "全選",
            },
          },
          {
            type: "button",
            style: "primary",
            height: "sm",
            action: {
              type: "postback",
              label: "確認分帳成員",
              data: `action=members_done&pendingId=${pendingId}`,
              displayText: "確認分帳成員",
            },
          },
        ],
      },
    },
  };
}

function parseAmount(label: string): number {
  const n = Number(label.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
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
