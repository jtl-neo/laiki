import type { webhook } from "@line/bot-sdk";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users, groups, groupMembers, accounts } from "../../db/schema.js";
import { lineClient } from "../client.js";
import { replyMessages, quickReplyActions, flexWithQuickReply } from "../reply.js";
import { buildOnboardingFlex } from "../flex/onboarding.js";
import { ensureUserDefaults } from "../../lib/ensureDefaults.js";
import { LIFF_BASE } from "../../lib/config.js";

export async function handleFollow(event: webhook.FollowEvent): Promise<void> {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return;

  let profile: { displayName: string; pictureUrl?: string } | null = null;
  try {
    const p = await lineClient().getProfile(lineUserId);
    profile = { displayName: p.displayName, pictureUrl: p.pictureUrl };
  } catch {
    profile = { displayName: "Laiki User" };
  }

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.lineUserId, lineUserId))
    .limit(1);

  let userId: string;
  if (existing) {
    userId = existing.id;
    await db
      .update(users)
      .set({
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl ?? null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  } else {
    const [u] = await db
      .insert(users)
      .values({
        lineUserId,
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl ?? null,
      })
      .returning();
    userId = u!.id;
  }

  await ensureUserDefaults(userId);

  if (event.replyToken) {
    const qr = quickReplyActions([
      { label: "試打字記帳", data: "action=demo_text", displayText: "早餐 65 現金" },
      { label: "拍發票教學", data: "action=demo_image", displayText: "怎麼拍發票？" },
      { label: "開啟儀表板", uri: `${LIFF_BASE}/dashboard` },
      { label: "帳戶設定", uri: `${LIFF_BASE}/accounts` },
      { label: "邀請夥伴", uri: `${LIFF_BASE}/groups` },
    ]);
    await replyMessages(event.replyToken, [
      flexWithQuickReply(buildOnboardingFlex(LIFF_BASE, profile.displayName), qr),
    ]);
  }
}
