import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, groupMembers } from "../db/schema.js";
import { lineClient } from "./client.js";

export interface GroupSyncResult {
  knownUserIds: string[];
  unknownLineUserIds: string[];
  total: number;
  available: boolean;
}

export async function syncGroupMembers(
  groupId: string,
  lineGroupId: string,
): Promise<GroupSyncResult> {
  let lineIds: string[] = [];
  let available = true;
  try {
    let next: string | undefined;
    do {
      const res = await lineClient().getGroupMembersIds(lineGroupId, next);
      lineIds.push(...(res.memberIds ?? []));
      next = res.next ?? undefined;
    } while (next);
  } catch (e) {
    available = false;
    console.warn("getGroupMembersIds failed:", e instanceof Error ? e.message : e);
  }

  if (lineIds.length === 0) {
    return { knownUserIds: [], unknownLineUserIds: [], total: 0, available };
  }

  const known = await db
    .select({ id: users.id, lineUserId: users.lineUserId })
    .from(users)
    .where(inArray(users.lineUserId, lineIds));

  const knownLine = new Set(known.map((u) => u.lineUserId));
  const unknown = lineIds.filter((id) => !knownLine.has(id));

  if (known.length > 0) {
    const existing = await db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId));
    const existingIds = new Set(existing.map((m) => m.userId));
    const toInsert = known
      .filter((u) => !existingIds.has(u.id))
      .map((u) => ({
        groupId,
        userId: u.id,
        role: "member" as const,
        joinedVia: "line_group" as const,
      }));
    if (toInsert.length > 0) {
      await db.insert(groupMembers).values(toInsert);
    }
  }

  return {
    knownUserIds: known.map((u) => u.id),
    unknownLineUserIds: unknown,
    total: lineIds.length,
    available,
  };
}
