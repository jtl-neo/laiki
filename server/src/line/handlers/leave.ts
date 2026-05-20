import type { webhook } from "@line/bot-sdk";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { groups, groupMembers } from "../../db/schema.js";

export async function handleLeave(event: webhook.LeaveEvent): Promise<void> {
  const source = event.source;
  if (!source) return;
  const lineGroupId =
    source.type === "group" ? source.groupId : source.type === "room" ? source.roomId : null;
  if (!lineGroupId) return;

  const [g] = await db
    .select()
    .from(groups)
    .where(eq(groups.lineGroupId, lineGroupId))
    .limit(1);
  if (!g) {
    console.log("[line] leave: no matching group for", lineGroupId);
    return;
  }

  await db.delete(groupMembers).where(eq(groupMembers.groupId, g.id));
  console.log("[line] leave: cleared members for group", g.id);
}
