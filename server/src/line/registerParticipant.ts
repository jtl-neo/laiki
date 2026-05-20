import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, groups, groupMembers, accountMembers } from "../db/schema.js";
import { lineClient } from "./client.js";
import { fetchLineGroupName } from "./groupName.js";

export async function registerGroupParticipant(
  lineUserId: string,
  lineGroupId: string,
): Promise<{ userId: string; groupId: string } | null> {
  let [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.lineGroupId, lineGroupId))
    .limit(1);

  let [user] = await db.select().from(users).where(eq(users.lineUserId, lineUserId)).limit(1);

  if (!user) {
    let displayName = "群組成員";
    let pictureUrl: string | null = null;
    try {
      const p = await lineClient().getGroupMemberProfile(lineGroupId, lineUserId);
      displayName = p.displayName ?? displayName;
      pictureUrl = p.pictureUrl ?? null;
    } catch (e) {
      console.warn("getGroupMemberProfile failed:", e instanceof Error ? e.message : e);
    }
    const [u] = await db
      .insert(users)
      .values({ lineUserId, displayName, pictureUrl })
      .returning();
    if (!u) return null;
    user = u;
  }

  if (!group) {
    const groupName = (await fetchLineGroupName(lineGroupId)) ?? "LINE 群組";
    const [g] = await db
      .insert(groups)
      .values({
        type: "shared",
        name: groupName,
        lineGroupId,
        ownerUserId: user.id,
      })
      .returning();
    if (!g) return null;
    group = g;
  }

  const [existing] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userId, user.id)))
    .limit(1);
  if (!existing) {
    await db.insert(groupMembers).values({
      groupId: group.id,
      userId: user.id,
      role: "member",
      joinedVia: "line_group",
    });
  }

  if (group.type === "fund" && group.fundAccountId && user.id !== group.ownerUserId) {
    await db
      .insert(accountMembers)
      .values({ accountId: group.fundAccountId, userId: user.id, role: "editor" })
      .onConflictDoNothing();
  }

  return { userId: user.id, groupId: group.id };
}
