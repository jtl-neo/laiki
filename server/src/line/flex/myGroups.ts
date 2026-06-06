import type { messagingApi } from "@line/bot-sdk";
import type { DmGroup, GroupMemberCandidate } from "../../lib/myGroups.js";

const TYPE_LABEL: Record<DmGroup["type"], string> = {
  shared: "共享",
  split: "分帳",
  fund: "🏡 基金",
};

/** 我的群組清單卡。 */
export function buildMyGroupsFlex(groupsList: DmGroup[]): messagingApi.FlexMessage {
  const rows: messagingApi.FlexComponent[] = groupsList.slice(0, 10).flatMap((g) => {
    const entry: messagingApi.FlexComponent[] = [
      {
        type: "box",
        layout: "horizontal",
        margin: "md",
        contents: [
          {
            type: "text",
            text: `${TYPE_LABEL[g.type]}｜${g.name}`,
            size: "sm",
            flex: 5,
            wrap: true,
            gravity: "center",
          },
          {
            type: "text",
            text: `${g.memberCount} 人`,
            size: "sm",
            flex: 2,
            align: "end",
            color: "#8C8C8C",
            gravity: "center",
          },
        ],
      },
    ];
    if (g.isOwner) {
      entry.push({
        type: "button",
        style: "secondary",
        height: "sm",
        action: {
          type: "postback",
          label: "管理成員",
          data: `action=mygroup_members&groupId=${g.id}`,
          displayText: `管理「${g.name}」成員`,
        },
      });
    }
    return entry;
  });

  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: "📚 我的群組", weight: "bold", color: "#1D7FB4", size: "sm" },
      ],
    },
    body: { type: "box", layout: "vertical", spacing: "sm", contents: rows },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "輸入「建立群組 名稱」或「建立基金 名稱」新增",
          size: "xs",
          color: "#8C8C8C",
          wrap: true,
        },
      ],
    },
  };
  return { type: "flex", altText: "我的群組", contents: bubble };
}

/** 群組成員管理卡：好友清單 + 加入/移除 toggle。 */
export function buildGroupMemberManageFlex(args: {
  groupId: string;
  groupName: string;
  candidates: GroupMemberCandidate[];
}): messagingApi.FlexMessage {
  const rows: messagingApi.FlexComponent[] = args.candidates.slice(0, 10).map((c) => ({
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    margin: "md",
    contents: [
      {
        type: "text",
        text: `${c.inGroup ? "✅" : "⬜"} ${c.displayName ?? "好友"}${c.isVirtual ? "（未綁定）" : ""}`,
        size: "sm",
        flex: 5,
        wrap: true,
        gravity: "center",
      },
      {
        type: "button",
        style: c.inGroup ? "primary" : "secondary",
        height: "sm",
        flex: 2,
        action: {
          type: "postback",
          label: c.inGroup ? "移除" : "加入",
          data: `action=mygroup_toggle&groupId=${args.groupId}&userId=${c.userId}`,
          displayText: `${c.inGroup ? "移除" : "加入"} ${c.displayName ?? "好友"}`,
        },
      },
    ],
  }));

  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: `👥 ${args.groupName}｜成員管理`,
          weight: "bold",
          color: "#1D7FB4",
          size: "sm",
          wrap: true,
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents:
        rows.length > 0
          ? rows
          : [
              {
                type: "text",
                text: "還沒有好友可以加入。先記一筆分帳（例如「和小明吃飯我先出500」）建立好友。",
                size: "sm",
                wrap: true,
              },
            ],
    },
  };
  return { type: "flex", altText: `${args.groupName} 成員管理`, contents: bubble };
}
