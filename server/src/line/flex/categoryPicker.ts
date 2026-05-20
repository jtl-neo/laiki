import type { messagingApi } from "@line/bot-sdk";

const CATEGORIES: { name: string; icon: string }[] = [
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
