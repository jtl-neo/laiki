import type { messagingApi } from "@line/bot-sdk";

export function buildGroupTypePicker(args: { groupId: string }): messagingApi.FlexMessage {
  return {
    type: "flex",
    altText: "請選擇此群組用途",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "歡迎使用來記！", weight: "bold", size: "lg" },
          {
            type: "text",
            text: "請選擇此群組的用途：",
            size: "sm",
            color: "#555555",
            wrap: true,
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            margin: "md",
            contents: [
              {
                type: "text",
                text: "• 群組分帳：成員各自記帳，月底結算誰欠誰多少",
                size: "xs",
                color: "#555555",
                wrap: true,
              },
              {
                type: "text",
                text: "• 共同基金：大家出錢進同一個池子，從池子付支出",
                size: "xs",
                color: "#555555",
                wrap: true,
              },
            ],
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
            color: "#1DB446",
            action: {
              type: "postback",
              label: "群組分帳",
              data: `action=group_type&groupId=${args.groupId}&type=shared`,
              displayText: "群組分帳",
            },
          },
          {
            type: "button",
            style: "primary",
            color: "#06AED5",
            action: {
              type: "postback",
              label: "共同基金",
              data: `action=group_type&groupId=${args.groupId}&type=fund`,
              displayText: "共同基金",
            },
          },
        ],
      },
    },
  };
}
