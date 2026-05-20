import type { messagingApi } from "@line/bot-sdk";

const TYPE_ICON: Record<string, string> = {
  cash: "💵",
  debit: "🏦",
  credit: "💳",
  bank: "🏛️",
  ewallet: "📱",
};

const TYPE_LABEL: Record<string, string> = {
  cash: "現金",
  debit: "金融卡",
  credit: "信用卡",
  bank: "銀行",
  ewallet: "電子錢包",
};

export function buildBalanceFlex(args: {
  accounts: { id: string; name: string; type: string; balance: number }[];
  total: number;
  liffBase: string;
}): messagingApi.FlexMessage {
  if (args.accounts.length === 0) {
    return {
      type: "flex",
      altText: "尚無帳戶",
      contents: {
        type: "bubble",
        size: "kilo",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "text", text: "尚無帳戶", weight: "bold", size: "md", color: "#1DB446" },
            {
              type: "text",
              text: "到 LIFF 建立第一個帳戶",
              size: "sm",
              color: "#777777",
              margin: "sm",
              wrap: true,
            },
            {
              type: "button",
              style: "primary",
              color: "#1DB446",
              height: "sm",
              margin: "md",
              action: { type: "uri", label: "建立帳戶", uri: `${args.liffBase}/accounts` },
            },
          ],
        },
      },
    };
  }

  const rows: messagingApi.FlexBox[] = args.accounts.slice(0, 10).map((a) => {
    const icon = TYPE_ICON[a.type] ?? "💰";
    const label = TYPE_LABEL[a.type] ?? a.type;
    const negative = a.balance < 0;
    return {
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      paddingTop: "xs",
      paddingBottom: "xs",
      contents: [
        {
          type: "text",
          text: `${icon} ${a.name}`,
          size: "sm",
          color: "#333333",
          flex: 5,
          wrap: false,
        },
        {
          type: "text",
          text: label,
          size: "xxs",
          color: "#999999",
          flex: 2,
          align: "center",
        },
        {
          type: "text",
          text: `NT$${a.balance.toLocaleString("zh-TW")}`,
          size: "sm",
          align: "end",
          weight: "bold",
          color: negative ? "#D32F2F" : "#1DB446",
          flex: 4,
        },
      ],
    };
  });

  return {
    type: "flex",
    altText: `各帳戶餘額 合計 NT$${args.total.toLocaleString("zh-TW")}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DB446",
        paddingAll: "lg",
        contents: [
          { type: "text", text: "💰 各帳戶餘額", color: "#FFFFFF", weight: "bold", size: "md" },
          {
            type: "text",
            text: `NT$${args.total.toLocaleString("zh-TW")}`,
            color: "#FFFFFF",
            size: "xxl",
            weight: "bold",
            margin: "sm",
          },
          {
            type: "text",
            text: `${args.accounts.length} 個帳戶 合計`,
            color: "#E8F5E9",
            size: "xxs",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        contents: rows,
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "link",
            height: "sm",
            action: { type: "uri", label: "管理帳戶", uri: `${args.liffBase}/accounts` },
          },
        ],
      },
    },
  };
}
