import type { messagingApi } from "@line/bot-sdk";

export function buildOnboardingFlex(
  liffBase: string,
  displayName?: string,
): messagingApi.FlexMessage {
  const greeting = displayName ? `${displayName}，歡迎使用來記！` : "歡迎使用來記！";

  const featureRow = (icon: string, title: string, desc: string): messagingApi.FlexBox => ({
    type: "box",
    layout: "horizontal",
    spacing: "md",
    contents: [
      { type: "text", text: icon, size: "lg", flex: 0 },
      {
        type: "box",
        layout: "vertical",
        flex: 5,
        spacing: "xs",
        contents: [
          { type: "text", text: title, size: "sm", weight: "bold", color: "#1F2937" },
          { type: "text", text: desc, size: "xs", color: "#6B7280", wrap: true },
        ],
      },
    ],
  });

  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#1DB446",
      paddingAll: "lg",
      spacing: "xs",
      contents: [
        { type: "text", text: "🎉 來記 Laiki", color: "#FFFFFF", weight: "bold", size: "md" },
        { type: "text", text: greeting, color: "#E8F5E9", size: "xs", wrap: true },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        {
          type: "text",
          text: "我是你的 AI 記帳小幫手，三種方式都能記：",
          size: "sm",
          color: "#374151",
          wrap: true,
        },
        { type: "separator", margin: "sm" },
        featureRow("⌨️", "打字記帳", "傳「早餐 65 LINE Pay」我就懂"),
        featureRow("📸", "拍發票辨識", "傳照片自動填金額、商家、分類"),
        featureRow("📊", "查看儀表板", "餘額、本月支出、分類統計"),
        { type: "separator", margin: "sm" },
        {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          contents: [
            { type: "text", text: "已自動為你建立：", size: "xs", color: "#6B7280" },
            { type: "text", text: "・群組「我的記帳」", size: "xs", color: "#6B7280" },
            { type: "text", text: "・帳戶「錢包現金」", size: "xs", color: "#6B7280" },
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
          height: "sm",
          action: { type: "uri", label: "打開儀表板", uri: `${liffBase}/dashboard` },
        },
        {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          contents: [
            {
              type: "button",
              style: "secondary",
              height: "sm",
              action: { type: "uri", label: "帳戶設定", uri: `${liffBase}/accounts` },
            },
            {
              type: "button",
              style: "secondary",
              height: "sm",
              action: { type: "uri", label: "邀請夥伴", uri: `${liffBase}/groups` },
            },
          ],
        },
        {
          type: "text",
          text: "現在就試試：傳「早餐 65 現金」👇",
          size: "xxs",
          color: "#9CA3AF",
          align: "center",
          margin: "sm",
        },
      ],
    },
  };
  return { type: "flex", altText: greeting, contents: bubble };
}
