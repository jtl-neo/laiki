import type { webhook } from "@line/bot-sdk";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users, groups, groupMembers } from "../../db/schema.js";
import { replyMessages } from "../reply.js";
import { buildGroupTypePicker } from "../flex/groupTypePicker.js";
import { fetchLineGroupName } from "../groupName.js";

export async function handleJoin(event: webhook.JoinEvent): Promise<void> {
  const source = event.source;
  if (!source) return;
  const lineGroupId =
    source.type === "group" ? source.groupId : source.type === "room" ? source.roomId : null;
  if (!lineGroupId) return;

  try {
    const [existing] = await db
      .select()
      .from(groups)
      .where(eq(groups.lineGroupId, lineGroupId))
      .limit(1);

    if (!existing) {
      const [anyUser] = await db.select().from(users).limit(1);
      if (anyUser) {
        const groupName = (await fetchLineGroupName(lineGroupId)) ?? "LINE 群組";
        const [g] = await db
          .insert(groups)
          .values({
            type: "shared",
            name: groupName,
            lineGroupId,
            ownerUserId: anyUser.id,
          })
          .returning();
        if (g) {
          await db
            .insert(groupMembers)
            .values({
              groupId: g.id,
              userId: anyUser.id,
              role: "owner",
              joinedVia: "line_group",
            })
            .onConflictDoNothing();
        }
      }
    }
  } catch (e) {
    console.error("[line] join upsert failed:", e);
  }

  if (event.replyToken) {
    const [g] = await db
      .select()
      .from(groups)
      .where(eq(groups.lineGroupId, lineGroupId))
      .limit(1);
    if (g) {
      await replyMessages(event.replyToken, [buildGroupTypePicker({ groupId: g.id })]);
    }
  }
}
