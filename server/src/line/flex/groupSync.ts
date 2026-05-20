import type { messagingApi } from "@line/bot-sdk";

export function buildInviteFlex(args: {
  missingCount: number;
  total: number;
  available: boolean;
  inviteUrl: string;
}): messagingApi.FlexMessage {
  const title = args.available
    ? `還有 ${args.missingCount} / ${args.total} 位未加好友`
    : "成員清單無法取得";
  const body = args.available
    ? "未加好友的成員無法參與分帳。請他們點下方按鈕加我為好友。"
    : "本帳號權限無法列出群組成員。請所有成員直接加我為好友以參與分帳。";

  return {
    type: "flex",
    altText: title,
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: title, weight: "bold", size: "sm", color: "#D9534F", wrap: true },
          { type: "text", text: body, size: "xs", color: "#555555", wrap: true },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#06C755",
            action: { type: "uri", label: "加我為好友", uri: args.inviteUrl },
          },
        ],
      },
    },
  };
}
