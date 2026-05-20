import type { messagingApi } from "@line/bot-sdk";
import type { Account } from "../../db/schema.js";

export function buildAccountPickerFlex(
  txId: string,
  accts: Pick<Account, "id" | "name" | "type" | "icon">[],
): messagingApi.FlexMessage {
  const bubbles: messagingApi.FlexBubble[] = accts.slice(0, 10).map((a) => ({
    type: "bubble",
    size: "micro",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "text",
          text: a.icon || "💳",
          align: "center",
          size: "xxl",
        },
        {
          type: "text",
          text: a.name,
          align: "center",
          weight: "bold",
          size: "sm",
          wrap: true,
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          height: "sm",
          action: {
            type: "postback",
            label: "選此",
            data: `action=change_account&txId=${txId}&accountId=${a.id}`,
            displayText: `改帳戶為「${a.name}」`,
          },
        },
      ],
    },
  }));

  return {
    type: "flex",
    altText: "選擇帳戶",
    contents: { type: "carousel", contents: bubbles },
  };
}
