import type { messagingApi } from "@line/bot-sdk";
import type { FriendEntry } from "../../lib/shadowAccount.js";

function money(n: number): string {
  return `NT$${n.toLocaleString("zh-TW")}`;
}

/** 管理好友卡：影子帳號附「產生綁定碼」按鈕，已綁定的只顯示狀態。 */
export function buildFriendListFlex(friends: FriendEntry[]): messagingApi.FlexMessage {
  const rows: messagingApi.FlexComponent[] = friends.slice(0, 10).flatMap((f) => {
    const entry: messagingApi.FlexComponent[] = [
      {
        type: "box",
        layout: "horizontal",
        margin: "md",
        contents: [
          {
            type: "text",
            text: `👤 ${f.displayName ?? "好友"}${f.isVirtual ? "（未綁定）" : "（已綁定）"}`,
            size: "sm",
            flex: 5,
            wrap: true,
          },
          {
            type: "text",
            text: f.outstanding > 0 ? `欠你 ${money(f.outstanding)}` : "無欠款",
            size: "sm",
            flex: 4,
            align: "end",
            color: f.outstanding > 0 ? "#D14B00" : "#8C8C8C",
          },
        ],
      },
    ];
    if (f.isVirtual) {
      entry.push({
        type: "button",
        style: "secondary",
        height: "sm",
        action: {
          type: "postback",
          label: "產生綁定碼",
          data: `action=friend_pin&friendId=${f.userId}`,
          displayText: `產生 ${f.displayName ?? "好友"} 的綁定碼`,
        },
      });
    }
    return entry;
  });

  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: "👥 管理好友", weight: "bold", color: "#1D7FB4", size: "sm" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: rows,
    },
  };

  return { type: "flex", altText: "管理好友", contents: bubble };
}
