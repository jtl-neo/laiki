import type { messagingApi } from "@line/bot-sdk";

function headerBox(title: string, subtitle?: string): messagingApi.FlexBox {
  const contents: messagingApi.FlexComponent[] = [
    { type: "text", text: title, color: "#FFFFFF", weight: "bold", size: "md" },
  ];
  if (subtitle) {
    contents.push({
      type: "text",
      text: subtitle,
      color: "#E8F5E9",
      size: "xxs",
      margin: "sm",
      wrap: true,
    });
  }
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: "#1DB446",
    paddingAll: "lg",
    contents,
  };
}

export function buildGroupBalancesFlex(args: {
  rows: { name: string; net: number }[];
  liffBase: string;
  groupId: string;
}): messagingApi.FlexMessage {
  if (args.rows.length === 0) {
    return {
      type: "flex",
      altText: "本群還沒有可結算的交易",
      contents: {
        type: "bubble",
        size: "kilo",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "text", text: "💰 群組欠收", weight: "bold", size: "md", color: "#1DB446" },
            {
              type: "text",
              text: "本群還沒有可以結算的交易",
              size: "sm",
              color: "#777777",
              margin: "md",
              wrap: true,
            },
          ],
        },
      },
    };
  }

  const rows: messagingApi.FlexBox[] = args.rows.map((r) => ({
    type: "box",
    layout: "horizontal",
    paddingTop: "xs",
    paddingBottom: "xs",
    contents: [
      { type: "text", text: r.name, size: "sm", color: "#333333", flex: 5 },
      {
        type: "text",
        text: `${r.net > 0 ? "+" : ""}${r.net.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}`,
        size: "sm",
        align: "end",
        weight: "bold",
        color: r.net > 0 ? "#1DB446" : r.net < 0 ? "#D32F2F" : "#666666",
        flex: 4,
      },
    ],
  }));

  return {
    type: "flex",
    altText: "群組欠收狀態",
    contents: {
      type: "bubble",
      size: "mega",
      header: headerBox("💰 群組欠收", "正數=應收回 / 負數=應付出"),
      body: { type: "box", layout: "vertical", spacing: "xs", contents: rows },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "link",
            height: "sm",
            action: {
              type: "uri",
              label: "群組詳情",
              uri: `${args.liffBase}/group/${args.groupId}`,
            },
          },
        ],
      },
    },
  };
}

export function buildGroupSettleFlex(args: {
  transfers: { fromName: string; toName: string; amount: number }[];
  liffBase: string;
  groupId: string;
}): messagingApi.FlexMessage {
  if (args.transfers.length === 0) {
    return {
      type: "flex",
      altText: "目前無需結算",
      contents: {
        type: "bubble",
        size: "kilo",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "text", text: "📊 結算", weight: "bold", size: "md", color: "#1DB446" },
            {
              type: "text",
              text: "目前無需結算 ✨",
              size: "sm",
              color: "#777777",
              margin: "md",
            },
          ],
        },
      },
    };
  }

  const rows: messagingApi.FlexBox[] = args.transfers.map((t) => ({
    type: "box",
    layout: "horizontal",
    paddingTop: "xs",
    paddingBottom: "xs",
    contents: [
      {
        type: "text",
        text: t.fromName,
        size: "sm",
        color: "#D32F2F",
        flex: 3,
        wrap: false,
      },
      { type: "text", text: "→", size: "sm", align: "center", color: "#999999", flex: 1 },
      {
        type: "text",
        text: t.toName,
        size: "sm",
        color: "#1DB446",
        flex: 3,
        wrap: false,
      },
      {
        type: "text",
        text: `NT$${t.amount.toLocaleString("zh-TW")}`,
        size: "sm",
        align: "end",
        weight: "bold",
        color: "#333333",
        flex: 4,
      },
    ],
  }));

  return {
    type: "flex",
    altText: "結算建議",
    contents: {
      type: "bubble",
      size: "mega",
      header: headerBox("📊 結算建議", `共 ${args.transfers.length} 筆轉帳`),
      body: { type: "box", layout: "vertical", spacing: "xs", contents: rows },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "link",
            height: "sm",
            action: {
              type: "uri",
              label: "記錄已付",
              uri: `${args.liffBase}/group/${args.groupId}`,
            },
          },
        ],
      },
    },
  };
}

export function buildGroupMembersFlex(args: {
  members: { name: string; role: string }[];
  inviteUrl: string | null;
  liffBase: string;
  groupId: string;
}): messagingApi.FlexMessage {
  if (args.members.length === 0) {
    return {
      type: "flex",
      altText: "本群還沒有登記成員",
      contents: {
        type: "bubble",
        size: "kilo",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "text", text: "👥 成員", weight: "bold", size: "md", color: "#1DB446" },
            {
              type: "text",
              text: "本群還沒有登記成員",
              size: "sm",
              color: "#777777",
              margin: "md",
            },
            {
              type: "text",
              text: "請成員在群組裡發言一次即會自動登記",
              size: "xxs",
              color: "#999999",
              margin: "sm",
              wrap: true,
            },
          ],
        },
      },
    };
  }

  const rows: messagingApi.FlexBox[] = args.members.slice(0, 30).map((m) => ({
    type: "box",
    layout: "horizontal",
    paddingTop: "xs",
    paddingBottom: "xs",
    contents: [
      { type: "text", text: m.name, size: "sm", color: "#333333", flex: 5 },
      ...(m.role === "owner"
        ? [
            {
              type: "text" as const,
              text: "owner",
              size: "xxs" as const,
              color: "#1DB446",
              align: "end" as const,
              flex: 2,
            },
          ]
        : []),
    ],
  }));

  const buttons: messagingApi.FlexButton[] = [];
  if (args.inviteUrl) {
    buttons.push({
      type: "button",
      style: "link",
      height: "sm",
      action: { type: "uri", label: "邀請加好友", uri: args.inviteUrl },
    });
  }

  return {
    type: "flex",
    altText: `已登記 ${args.members.length} 位成員`,
    contents: {
      type: "bubble",
      size: "mega",
      header: headerBox("👥 群組成員", `共 ${args.members.length} 位 · 發言自動登記`),
      body: { type: "box", layout: "vertical", spacing: "xs", contents: rows },
      footer:
        buttons.length > 0
          ? { type: "box", layout: "vertical", contents: buttons }
          : undefined,
    },
  };
}

export function buildFundContributionsFlex(args: {
  rows: { name: string; total: number }[];
  fundName: string;
  liffBase: string;
  groupId: string;
}): messagingApi.FlexMessage {
  if (args.rows.length === 0) {
    return {
      type: "flex",
      altText: "尚無基金存入紀錄",
      contents: {
        type: "bubble",
        size: "kilo",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "text", text: "👥 貢獻排行", weight: "bold", size: "md", color: "#1DB446" },
            {
              type: "text",
              text: "尚無基金存入紀錄",
              size: "sm",
              color: "#777777",
              margin: "md",
            },
          ],
        },
      },
    };
  }
  const max = args.rows[0]?.total ?? 1;
  const rows: messagingApi.FlexBox[] = args.rows.map((r, i) => {
    const pct = Math.max(2, Math.round((r.total / max) * 100));
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
            {
              type: "text",
              text: `${i + 1}. ${r.name}`,
              size: "sm",
              color: "#333333",
              flex: 5,
            },
            {
              type: "text",
              text: `NT$${r.total.toLocaleString("zh-TW")}`,
              size: "sm",
              align: "end",
              weight: "bold",
              color: "#1DB446",
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
  return {
    type: "flex",
    altText: `${args.fundName} 貢獻排行`,
    contents: {
      type: "bubble",
      size: "mega",
      header: headerBox("👥 基金貢獻", args.fundName),
      body: { type: "box", layout: "vertical", spacing: "xs", contents: rows },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "link",
            height: "sm",
            action: {
              type: "uri",
              label: "查看詳情",
              uri: `${args.liffBase}/group/${args.groupId}`,
            },
          },
        ],
      },
    },
  };
}

export function buildQuotaExceededFlex(args: {
  liffBase: string;
}): messagingApi.FlexMessage {
  return {
    type: "flex",
    altText: "本月 AI 額度已用完",
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#F59E0B",
        paddingAll: "lg",
        contents: [
          { type: "text", text: "⚠ 額度已用完", color: "#FFFFFF", weight: "bold", size: "md" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "text",
            text: "本月 AI 額度已達上限",
            size: "sm",
            weight: "bold",
            color: "#333333",
          },
          {
            type: "text",
            text: "可手動新增交易,或設定 BYOK (自己的 API key) 無限使用",
            size: "xs",
            color: "#777777",
            wrap: true,
            margin: "sm",
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
            action: { type: "uri", label: "設定 API Key", uri: `${args.liffBase}/apikey` },
          },
          {
            type: "button",
            style: "link",
            height: "sm",
            action: { type: "uri", label: "手動新增", uri: `${args.liffBase}/tx/new` },
          },
        ],
      },
    },
  };
}
