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

/**
 * pendingId-keyed account picker for the draft flow.
 * Buttons post action=pick_account&pendingId=...&accountId=ID.
 */
export function buildAccountPickFlex(args: {
  pendingId: string;
  accounts: { id: string; name: string; icon?: string | null }[];
}): messagingApi.FlexMessage {
  const { pendingId, accounts: accts } = args;
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
            data: `action=pick_account&pendingId=${pendingId}&accountId=${a.id}`,
            displayText: `使用「${a.name}」`,
          },
        },
      ],
    },
  }));

  return {
    type: "flex",
    altText: "選擇付款帳戶",
    contents: { type: "carousel", contents: bubbles },
  };
}
