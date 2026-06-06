import type { messagingApi } from "@line/bot-sdk";
import { inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { lineClient } from "./client.js";
import { logger } from "../lib/logger.js";

export async function pushTo(to: string, messages: messagingApi.Message[]): Promise<void> {
  await lineClient().pushMessage({ to, messages });
}

/**
 * Fan a message out to many internal user ids. Shadow accounts (no LINE
 * id / still virtual) are silently skipped; per-recipient failures are
 * logged and never break the batch.
 */
export async function pushToMany(
  userIds: string[],
  messages: messagingApi.Message[],
): Promise<void> {
  if (userIds.length === 0) return;
  const rows = await db
    .select({ id: users.id, lineUserId: users.lineUserId, isVirtual: users.isVirtual })
    .from(users)
    .where(inArray(users.id, [...new Set(userIds)]));
  await Promise.all(
    rows
      .filter((u) => !u.isVirtual && u.lineUserId)
      .map((u) =>
        pushTo(u.lineUserId!, messages).catch((err) =>
          logger.warn({ err, userId: u.id }, "pushToMany: recipient failed"),
        ),
      ),
  );
}
