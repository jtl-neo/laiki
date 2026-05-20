import type { messagingApi } from "@line/bot-sdk";

export interface InsightFlexInput {
  periodLabel: string;
  summary: string;
  topCategory?: string;
  topCategoryAmount?: number;
  tips: string[];
  liffDashboardUrl: string;
}

export function buildInsightFlex(args: InsightFlexInput): messagingApi.FlexMessage {
  const bodyContents: messagingApi.FlexComponent[] = [
    {
      type: "text",
      text: args.summary,
      size: "sm",
      color: "#333333",
      wrap: true,
    },
  ];

  if (args.topCategory) {
    bodyContents.push({
      type: "box",
      layout: "baseline",
      margin: "md",
      contents: [
        { type: "text", text: "最大支出", size: "sm", color: "#888888", flex: 3 },
        {
          type: "text",
          text:
            args.topCategoryAmount != null
              ? `${args.topCategory}（NT$${args.topCategoryAmount.toLocaleString("zh-TW")}）`
              : args.topCategory,
          size: "sm",
          color: "#333333",
          flex: 5,
          wrap: true,
        },
      ],
    });
  }

  if (args.tips.length > 0) {
    bodyContents.push({
      type: "separator",
      margin: "md",
    });
    bodyContents.push({
      type: "text",
      text: "建議",
      size: "sm",
      color: "#888888",
      margin: "md",
    });
    for (const tip of args.tips) {
      bodyContents.push({
        type: "box",
        layout: "baseline",
        contents: [
          { type: "text", text: "•", size: "sm", color: "#888888", flex: 0 },
          {
            type: "text",
            text: tip,
            size: "sm",
            color: "#333333",
            flex: 10,
            wrap: true,
            margin: "sm",
          },
        ],
      });
    }
  }

  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "AI 週報",
          weight: "bold",
          color: "#1DB446",
          size: "sm",
        },
        {
          type: "text",
          text: args.periodLabel,
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
            label: "打開儀表板",
            uri: args.liffDashboardUrl,
          },
        },
        {
          type: "button",
          style: "secondary",
          height: "sm",
          action: {
            type: "postback",
            label: "不再接收此類",
            data: "action=notify_off&type=weekly",
            displayText: "不再接收 AI 週報",
          },
        },
      ],
    },
  };

  return {
    type: "flex",
    altText: `AI 週報 ${args.periodLabel}`,
    contents: bubble,
  };
}
