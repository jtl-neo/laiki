import type { messagingApi } from "@line/bot-sdk";
import { lineClient } from "./client.js";

export async function pushTo(to: string, messages: messagingApi.Message[]): Promise<void> {
  await lineClient().pushMessage({ to, messages });
}
