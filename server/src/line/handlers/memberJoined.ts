import type { webhook } from "@line/bot-sdk";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users, groups, groupMembers } from "../../db/schema.js";

export async function handleMemberJoined(event: webhook.MemberJoinedEvent): Promise<void> {
  const source = event.source;
  if (!source) return;
  const lineGroupId =
    source.type === "group" ? source.groupId : source.type === "room" ? source.roomId : null;
  if (!lineGroupId) return;

  const [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.lineGroupId, lineGroupId))
    .limit(1);
  if (!group) {
    console.log("[line] memberJoined: no matching group for", lineGroupId);
    return;
  }

  const joined = event.joined?.members ?? [];
  for (const m of joined) {
    if (m.type !== "user" || !m.userId) continue;
    const [u] = await db
      .select()
      .from(users)
      .where(eq(users.lineUserId, m.userId))
      .limit(1);
    if (!u) continue;
    await db
      .insert(groupMembers)
      .values({
        groupId: group.id,
        userId: u.id,
        role: "member",
        joinedVia: "line_group",
      })
      .onConflictDoNothing();
  }
}
