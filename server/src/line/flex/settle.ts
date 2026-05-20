import type { messagingApi } from "@line/bot-sdk";

export interface SettleFlexInput {
  groupId?: string;
  groupName: string;
  transfers: {
    fromName: string;
    toName: string;
    amount: number;
    fromUserId?: string;
    toUserId?: string;
  }[];
  liffSettleUrl: string;
}

export function buildSettleFlex(args: SettleFlexInput): messagingApi.FlexMessage {
  const empty = args.transfers.length === 0;

  const bodyContents: messagingApi.FlexComponent[] = empty
    ? [
        {
          type: "text",
          text: "全部結清 ✨",
          weight: "bold",
          size: "lg",
          align: "center",
          color: "#1DB446",
        },
      ]
    : args.transfers.flatMap((t) => {
        const row: messagingApi.FlexComponent = {
          type: "box",
          layout: "baseline",
          contents: [
            {
              type: "text",
              text: `${t.fromName} → ${t.toName}`,
              size: "sm",
              color: "#333333",
              flex: 5,
              wrap: true,
            },
            {
              type: "text",
              text: `NT$${t.amount.toLocaleString("zh-TW")}`,
              size: "sm",
              color: "#111111",
              weight: "bold",
              align: "end",
              flex: 3,
            },
          ],
        };
        const items: messagingApi.FlexComponent[] = [row];
        if (args.groupId && t.fromUserId && t.toUserId) {
          const qs = new URLSearchParams({
            action: "record_paid",
            groupId: args.groupId,
            fromUserId: t.fromUserId,
            toUserId: t.toUserId,
            amount: String(t.amount),
          }).toString();
          items.push({
            type: "button",
            style: "link",
            height: "sm",
            action: {
              type: "postback",
              label: "[已轉]",
              data: qs,
              displayText: `已轉 ${t.fromName}→${t.toName} NT$${t.amount}`,
            },
          });
        }
        return items;
      });

  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "結算建議",
          weight: "bold",
          color: "#1DB446",
          size: "sm",
        },
        {
          type: "text",
          text: args.groupName,
          weight: "bold",
          size: "xl",
          margin: "md",
          wrap: true,
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: bodyContents,
    },
    ...(empty
      ? {}
      : {
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
                  type: "uri",
                  label: "標記已轉帳",
                  uri: args.liffSettleUrl,
                },
              },
              {
                type: "button",
                style: "secondary",
                height: "sm",
                action: {
                  type: "postback",
                  label: "不再接收此類",
                  data: "action=notify_off&type=monthly",
                  displayText: "不再接收每月結算通知",
                },
              },
            ],
          } as messagingApi.FlexBox,
        }),
  };

  return {
    type: "flex",
    altText: empty
      ? `${args.groupName}：全部結清`
      : `${args.groupName} 結算建議（${args.transfers.length} 筆）`,
    contents: bubble,
  };
}
