import type { messagingApi } from "@line/bot-sdk";
import { t } from "../../lib/i18n.js";

export function buildOnboardingFlex(liffBase: string): messagingApi.FlexMessage {
  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        { type: "text", text: t("onboarding_title"), weight: "bold", size: "lg" },
        { type: "text", text: t("onboarding_body"), wrap: true, size: "sm", color: "#555555" },
        { type: "separator", margin: "md" },
        {
          type: "text",
          text: "已為你建立預設群組「我的記帳」與帳戶「錢包現金」",
          size: "xs",
          color: "#888888",
          wrap: true,
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
          action: { type: "uri", label: "打開儀表板", uri: liffBase },
        },
      ],
    },
  };
  return { type: "flex", altText: t("onboarding_title"), contents: bubble };
}
