import type { webhook } from "@line/bot-sdk";

export async function handleUnfollow(event: webhook.UnfollowEvent): Promise<void> {
  const lineUserId = event.source?.userId;
  console.log("[line] unfollow:", lineUserId ?? "(unknown)");
}
