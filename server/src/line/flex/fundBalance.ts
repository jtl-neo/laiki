import type { messagingApi } from "@line/bot-sdk";

export interface FundBalanceInput {
  fundName: string;
  balance: number;
  memberCount: number;
  recent: { txDate: string; note: string | null; kind: string; amount: number }[];
}

function money(n: number): string {
  return `NT$${n.toLocaleString("zh-TW")}`;
}

/** 基金餘額查詢卡：餘額 + 最近紀錄 + 快速動作。 */
export function buildFundBalanceFlex(input: FundBalanceInput): messagingApi.FlexMessage {
  const negative = input.balance < 0;

  const recentRows: messagingApi.FlexComponent[] = input.recent.map((t) => {
    const isIn = t.kind === "fund_in";
    return {
      type: "box",
      layout: "horizontal",
      contents: [
        {
          type: "text",
          text: t.txDate.slice(5).replace("-", "/"),
          size: "xs",
          color: "#AAAAAA",
          flex: 2,
          gravity: "center",
        },
        {
          type: "text",
          text: t.note ?? (isIn ? "存入" : "支出"),
          size: "xs",
          color: "#555555",
          flex: 5,
          wrap: true,
          gravity: "center",
        },
        {
          type: "text",
          text: `${isIn ? "+" : "-"}${money(t.amount)}`,
          size: "xs",
          color: isIn ? "#1DB446" : "#D14B00",
          flex: 3,
          align: "end",
          gravity: "center",
        },
      ],
    };
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
          text: `🏡 ${input.fundName}`,
          weight: "bold",
          color: "#1D7FB4",
          size: "sm",
          wrap: true,
        },
        {
          type: "text",
          text: money(input.balance),
          weight: "bold",
          size: "xxl",
          margin: "md",
          color: negative ? "#D14B00" : "#111111",
        },
        {
          type: "text",
          text: `目前餘額 · ${input.memberCount} 位成員`,
          size: "xs",
          color: "#8C8C8C",
          margin: "sm",
        },
        ...(negative
          ? [
              {
                type: "text" as const,
                text: "⚠️ 餘額為負，記得補錢進基金",
                size: "xs" as const,
                color: "#D14B00",
                margin: "sm" as const,
              },
            ]
          : []),
      ],
    },
    body:
      input.recent.length > 0
        ? {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: "最近紀錄",
                size: "xs",
                color: "#8C8C8C",
                weight: "bold",
              },
              ...recentRows,
            ],
          }
        : {
            type: "box",
            layout: "vertical",
            contents: [
              { type: "text", text: "還沒有任何紀錄", size: "xs", color: "#8C8C8C" },
            ],
          },
  };

  return {
    type: "flex",
    altText: `${input.fundName} 餘額 ${money(input.balance)}`,
    contents: bubble,
  };
}
