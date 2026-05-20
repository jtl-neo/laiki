import type { messagingApi } from "@line/bot-sdk";

export function buildMonthlyFlex(args: {
  startStr: string;
  expense: number;
  income: number;
  topCategories: { category: string; amount: number }[];
  txCount: number;
  liffBase: string;
}): messagingApi.FlexMessage {
  const net = args.income - args.expense;
  const netColor = net >= 0 ? "#1DB446" : "#D32F2F";
  const maxCat = args.topCategories[0]?.amount ?? 1;

  const catRows: messagingApi.FlexBox[] = args.topCategories.map((c) => {
    const pct = Math.max(2, Math.round((c.amount / maxCat) * 100));
    return {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      paddingTop: "xs",
      paddingBottom: "xs",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: c.category, size: "sm", color: "#333333", flex: 5 },
            {
              type: "text",
              text: `NT$${c.amount.toLocaleString("zh-TW")}`,
              size: "sm",
              align: "end",
              color: "#666666",
              flex: 4,
            },
          ],
        },
        {
          type: "box",
          layout: "vertical",
          height: "4px",
          backgroundColor: "#E8F5E9",
          contents: [
            {
              type: "box",
              layout: "vertical",
              width: `${pct}%`,
              height: "4px",
              backgroundColor: "#1DB446",
              contents: [],
            },
          ],
        },
      ],
    };
  });

  if (args.txCount === 0) {
    return {
      type: "flex",
      altText: "本月還沒有任何記錄",
      contents: {
        type: "bubble",
        size: "kilo",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "text", text: "📊 本月統計", weight: "bold", size: "md", color: "#1DB446" },
            {
              type: "text",
              text: "還沒有任何記錄",
              size: "sm",
              color: "#777777",
              margin: "md",
              wrap: true,
            },
            {
              type: "text",
              text: "傳「早餐 65 現金」即可記帳",
              size: "xxs",
              color: "#999999",
              margin: "sm",
            },
            {
              type: "button",
              style: "primary",
              color: "#1DB446",
              height: "sm",
              margin: "md",
              action: { type: "uri", label: "手動新增", uri: `${args.liffBase}/tx/new` },
            },
          ],
        },
      },
    };
  }

  const body: messagingApi.FlexComponent[] = [
    {
      type: "box",
      layout: "horizontal",
      spacing: "md",
      contents: [
        {
          type: "box",
          layout: "vertical",
          flex: 1,
          contents: [
            { type: "text", text: "支出", size: "xxs", color: "#999999" },
            {
              type: "text",
              text: `NT$${args.expense.toLocaleString("zh-TW")}`,
              size: "lg",
              weight: "bold",
              color: "#D32F2F",
            },
          ],
        },
        {
          type: "box",
          layout: "vertical",
          flex: 1,
          contents: [
            { type: "text", text: "收入", size: "xxs", color: "#999999" },
            {
              type: "text",
              text: `NT$${args.income.toLocaleString("zh-TW")}`,
              size: "lg",
              weight: "bold",
              color: "#1DB446",
            },
          ],
        },
      ],
    },
    {
      type: "box",
      layout: "horizontal",
      margin: "md",
      contents: [
        { type: "text", text: "淨額", size: "xxs", color: "#999999", flex: 2 },
        {
          type: "text",
          text: `${net >= 0 ? "+" : ""}NT$${net.toLocaleString("zh-TW")}`,
          size: "sm",
          weight: "bold",
          align: "end",
          color: netColor,
          flex: 5,
        },
      ],
    },
  ];

  if (catRows.length > 0) {
    body.push({ type: "separator", margin: "md" });
    body.push({
      type: "text",
      text: "TOP 分類",
      size: "xxs",
      color: "#999999",
      margin: "md",
    });
    body.push(...catRows);
  }

  return {
    type: "flex",
    altText: `本月 支出 NT$${args.expense.toLocaleString("zh-TW")} 收入 NT$${args.income.toLocaleString("zh-TW")}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DB446",
        paddingAll: "lg",
        contents: [
          { type: "text", text: "📊 本月統計", color: "#FFFFFF", weight: "bold", size: "md" },
          {
            type: "text",
            text: `自 ${args.startStr} 共 ${args.txCount} 筆`,
            color: "#E8F5E9",
            size: "xxs",
            margin: "sm",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: body,
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "link",
            height: "sm",
            action: { type: "uri", label: "看完整 Dashboard", uri: `${args.liffBase}/dashboard` },
          },
        ],
      },
    },
  };
}
