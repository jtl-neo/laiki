import type { messagingApi } from "@line/bot-sdk";

export const CATEGORIES: { name: string; icon: string }[] = [
  { name: "餐飲", icon: "🍱" },
  { name: "交通", icon: "🚇" },
  { name: "購物", icon: "🛍️" },
  { name: "娛樂", icon: "🎮" },
  { name: "教育", icon: "📚" },
  { name: "醫療", icon: "💊" },
  { name: "居家", icon: "🏠" },
  { name: "通訊", icon: "📱" },
  { name: "醫美", icon: "💆" },
  { name: "其他", icon: "📌" },
];

export function buildCategoryPickerFlex(txId: string): messagingApi.FlexMessage {
  const bubbles: messagingApi.FlexBubble[] = CATEGORIES.map((c) => ({
    type: "bubble",
    size: "micro",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "text",
          text: c.icon,
          align: "center",
          size: "xxl",
        },
        {
          type: "text",
          text: c.name,
          align: "center",
          weight: "bold",
          size: "md",
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
            data: `action=set_category&txId=${txId}&cat=${encodeURIComponent(c.name)}`,
            displayText: `改分類為「${c.name}」`,
          },
        },
      ],
    },
  }));

  return {
    type: "flex",
    altText: "選擇分類",
    contents: {
      type: "carousel",
      contents: bubbles,
    },
  };
}

/**
 * pendingId-keyed category picker for the draft flow.
 * Category buttons post action=set_category&pendingId=...&category=C.
 * A trailing "略過" bubble posts action=skip_category&pendingId=... .
 * Reuses the same CATEGORIES source as the tx-keyed picker.
 */
export function buildCategoryPickFlex(args: {
  pendingId: string;
  categories?: string[];
}): messagingApi.FlexMessage {
  const { pendingId } = args;
  const cats =
    args.categories && args.categories.length > 0
      ? args.categories.map((name) => {
          const known = CATEGORIES.find((c) => c.name === name);
          return { name, icon: known?.icon ?? "📌" };
        })
      : CATEGORIES;

  const bubbles: messagingApi.FlexBubble[] = cats.slice(0, 11).map((c) => ({
    type: "bubble",
    size: "micro",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        { type: "text", text: c.icon, align: "center", size: "xxl" },
        {
          type: "text",
          text: c.name,
          align: "center",
          weight: "bold",
          size: "md",
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
            data: `action=set_category&pendingId=${pendingId}&category=${encodeURIComponent(c.name)}`,
            displayText: `分類「${c.name}」`,
          },
        },
      ],
    },
  }));

  // Trailing "skip" bubble.
  bubbles.push({
    type: "bubble",
    size: "micro",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        { type: "text", text: "⏭️", align: "center", size: "xxl" },
        {
          type: "text",
          text: "略過",
          align: "center",
          weight: "bold",
          size: "md",
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "secondary",
          height: "sm",
          action: {
            type: "postback",
            label: "略過",
            data: `action=skip_category&pendingId=${pendingId}`,
            displayText: "略過分類",
          },
        },
      ],
    },
  });

  return {
    type: "flex",
    altText: "選擇分類",
    contents: { type: "carousel", contents: bubbles },
  };
}
