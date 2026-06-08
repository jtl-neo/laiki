import type { messagingApi } from "@line/bot-sdk";

export function buildPersonalMenuFlex(liffBase: string): messagingApi.FlexMessage {
  const tile = (
    icon: string,
    label: string,
    payload:
      | { kind: "uri"; uri: string }
      | { kind: "postback"; data: string; displayText: string },
  ): messagingApi.FlexBox => ({
    type: "box",
    layout: "vertical",
    flex: 1,
    spacing: "xs",
    paddingAll: "md",
    cornerRadius: "lg",
    backgroundColor: "#F5FBF6",
    height: "92px",
    action:
      payload.kind === "uri"
        ? { type: "uri", label, uri: payload.uri }
        : { type: "postback", label, data: payload.data, displayText: payload.displayText },
    contents: [
      { type: "text", text: icon, size: "xl", align: "center" },
      {
        type: "text",
        text: label,
        size: "xs",
        align: "center",
        color: "#1DB446",
        weight: "bold",
      },
    ],
  });

  const grid: messagingApi.FlexBox = {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        contents: [
          tile("💰", "餘額", { kind: "postback", data: "action=balance", displayText: "餘額" }),
          tile("📊", "本月", { kind: "postback", data: "action=monthly", displayText: "本月" }),
          tile("➕", "新增", { kind: "uri", uri: `${liffBase}/tx/new` }),
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        contents: [
          tile("📒", "帳戶", { kind: "uri", uri: `${liffBase}/accounts` }),
          tile("🔁", "轉帳", { kind: "uri", uri: `${liffBase}/transfer` }),
          tile("🔄", "定期", { kind: "uri", uri: `${liffBase}/recurring` }),
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        contents: [
          tile("👥", "好友", { kind: "uri", uri: `${liffBase}/friends` }),
          tile("📈", "預算", { kind: "uri", uri: `${liffBase}/budgets` }),
          tile("⚙", "設定", { kind: "uri", uri: `${liffBase}/settings` }),
        ],
      },
    ],
  };

  return {
    type: "flex",
    altText: "來記 選單",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DB446",
        paddingAll: "lg",
        contents: [
          { type: "text", text: "來記 Laiki", color: "#FFFFFF", weight: "bold", size: "lg" },
          {
            type: "text",
            text: "傳「早餐 65 現金」或拍收據,或點下方功能",
            color: "#E8F5E9",
            size: "xxs",
            margin: "sm",
            wrap: true,
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "md",
        contents: [grid],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "link",
            height: "sm",
            action: { type: "uri", label: "Dashboard", uri: `${liffBase}/dashboard` },
          },
        ],
      },
    },
  };
}

export function buildGroupMenuFlex(args: {
  groupId: string;
  groupName: string;
  groupType: string;
  liffBase: string;
}): messagingApi.FlexMessage {
  return {
    type: "flex",
    altText: `${args.groupName} 選單`,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: args.groupName,
            weight: "bold",
            size: "md",
            color: "#1DB446",
          },
          {
            type: "text",
            text: args.groupType === "fund" ? "共同基金模式" : "群組分帳模式",
            size: "xs",
            color: "#777777",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents:
          args.groupType === "fund"
            ? [
                {
                  type: "text",
                  text: "在群組裡 @我 + 內容即可，例如「@bot 房租 5000」記入支出",
                  size: "xs",
                  color: "#777777",
                  wrap: true,
                },
                { type: "separator", margin: "sm" },
                row("💰 基金餘額", "查看共同基金餘額", `action=fund_balance&groupId=${args.groupId}`),
                row("👥 貢獻排行", "成員累計存入排行", `action=fund_contributions&groupId=${args.groupId}`),
                row("➕ 存入", "存入基金", `uri=${args.liffBase}/group/${args.groupId}/tx/new`),
                row("➖ 支出", "從基金支出", `uri=${args.liffBase}/group/${args.groupId}/tx/new`),
                row("👥 成員", "已登記的群組成員", `action=group_members&groupId=${args.groupId}`),
                row("📒 交易明細", "基金收支明細", `uri=${args.liffBase}/group/${args.groupId}/tx`),
                row("⚙ 設定", "群組設定", `uri=${args.liffBase}/group/${args.groupId}`),
              ]
            : [
                {
                  type: "text",
                  text: "在群組裡 @我 + 記帳內容即可，例如「@bot 火鍋 1200 信用卡」",
                  size: "xs",
                  color: "#777777",
                  wrap: true,
                },
                { type: "separator", margin: "sm" },
                row("➕ 新增交易", "手動新增一筆", `uri=${args.liffBase}/group/${args.groupId}/tx/new`),
                row("📊 結算", "本群最少轉帳建議", `action=group_settle&groupId=${args.groupId}`),
                row("💰 餘額", "本群每人欠收狀態", `action=group_balances&groupId=${args.groupId}`),
                row("👥 名單", "已登記的群組成員", `action=group_members&groupId=${args.groupId}`),
                row("📒 明細", "群組交易列表", `uri=${args.liffBase}/group/${args.groupId}/tx`),
                row("⚙ 設定", "群組設定", `uri=${args.liffBase}/group/${args.groupId}`),
              ],
      },
    },
  };
}

export function buildGroupQuickMenuFlex(args: {
  groupId: string;
  groupName: string;
  groupType: string;
  liffBase: string;
}): messagingApi.FlexMessage {
  const isFund = args.groupType === "fund";
  const buttons: messagingApi.FlexButton[] = isFund
    ? [
        btn("💰 基金餘額", { type: "postback", label: "💰 基金餘額", data: `action=fund_balance&groupId=${args.groupId}`, displayText: "基金餘額" }),
        btn("➕ 存入 / 支出", { type: "uri", label: "➕ 記一筆", uri: `${args.liffBase}/group/${args.groupId}/tx/new` }),
        btn("👥 貢獻排行", { type: "postback", label: "👥 貢獻", data: `action=fund_contributions&groupId=${args.groupId}`, displayText: "貢獻排行" }),
      ]
    : [
        btn("📊 結算", { type: "postback", label: "📊 結算", data: `action=group_settle&groupId=${args.groupId}`, displayText: "結算" }),
        btn("💰 餘額", { type: "postback", label: "💰 餘額", data: `action=group_balances&groupId=${args.groupId}`, displayText: "餘額" }),
        btn("➕ 新增", { type: "uri", label: "➕ 新增", uri: `${args.liffBase}/group/${args.groupId}/tx/new` }),
      ];
  return {
    type: "flex",
    altText: `${args.groupName} 快捷`,
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "text",
            text: args.groupName,
            weight: "bold",
            size: "md",
            color: "#1DB446",
          },
          {
            type: "text",
            text: isFund
              ? "@我 + 內容,例「@bot 房租 5000」"
              : "@我 + 內容,例「@bot 火鍋 1200 信用卡」",
            size: "xxs",
            color: "#999999",
            wrap: true,
          },
          { type: "separator", margin: "sm" },
          ...buttons,
          {
            type: "button",
            style: "secondary",
            height: "sm",
            action: {
              type: "postback",
              label: "⋯ 進階選單",
              data: `action=group_menu&groupId=${args.groupId}`,
              displayText: "進階選單",
            },
          },
        ],
      },
    },
  };
}

function btn(_label: string, action: messagingApi.Action): messagingApi.FlexButton {
  return {
    type: "button",
    style: "primary",
    color: "#1DB446",
    height: "sm",
    action,
  };
}

function row(label: string, hint: string, payload: string): messagingApi.FlexBox {
  const isUri = payload.startsWith("uri=");
  const action: messagingApi.Action = isUri
    ? { type: "uri", label, uri: payload.slice(4) }
    : { type: "postback", label, data: payload, displayText: label };
  return {
    type: "box",
    layout: "horizontal",
    paddingAll: "sm",
    contents: [
      {
        type: "box",
        layout: "vertical",
        flex: 4,
        contents: [
          { type: "text", text: label, size: "sm", weight: "bold", color: "#333333" },
          { type: "text", text: hint, size: "xxs", color: "#999999", wrap: true },
        ],
      },
      {
        type: "button",
        flex: 0,
        style: "primary",
        color: "#1DB446",
        height: "sm",
        action,
      },
    ],
  };
}
