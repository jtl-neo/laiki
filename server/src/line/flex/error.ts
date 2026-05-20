import type { messagingApi } from "@line/bot-sdk";

export function buildErrorFlex(args: {
  title: string;
  body: string;
  liffNewUrl: string;
}): messagingApi.FlexMessage {
  return {
    type: "flex",
    altText: args.title,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: args.title, weight: "bold", size: "md", color: "#D9534F" },
          { type: "text", text: args.body, wrap: true, size: "sm", color: "#555555" },
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
            action: { type: "uri", label: "手動新增", uri: args.liffNewUrl },
          },
        ],
      },
    },
  };
}
