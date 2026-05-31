import type { webhook } from "@line/bot-sdk";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { groups } from "../../db/schema.js";
import { replyMessages, replyText } from "../reply.js";
import { buildGroupTypePicker } from "../flex/groupTypePicker.js";

export async function handleJoin(event: webhook.JoinEvent): Promise<void> {
  const source = event.source;
  if (!source) return;
  const lineGroupId =
    source.type === "group" ? source.groupId : source.type === "room" ? source.roomId : null;
  if (!lineGroupId) return;

  if (!event.replyToken) return;

  // Look up the group; do NOT create it here. Group creation is handled lazily by
  // the first real message (registerGroupParticipant), which correctly assigns the
  // speaking user as owner. Creating it here would leak an arbitrary user as owner.
  const [g] = await db
    .select()
    .from(groups)
    .where(eq(groups.lineGroupId, lineGroupId))
    .limit(1);

  if (g) {
    await replyMessages(event.replyToken, [buildGroupTypePicker({ groupId: g.id })]);
    return;
  }

  await replyText(
    event.replyToken,
    "嗨！我是來記帳 🤖\n請任一位成員在群組內傳一則訊息，我就能把你登記進來、完成設定。",
  );
}
