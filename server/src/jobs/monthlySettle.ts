import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { groups, groupMembers, users, userPreferences } from "../db/schema.js";
import { computeBalances } from "../lib/balances.js";
import { minTransfers } from "../lib/settle.js";
import { buildSettleFlex } from "../line/flex/settle.js";
import { lineClient } from "../line/client.js";
import { LIFF_BASE as liffBase } from "../lib/config.js";
import { logger } from "../lib/logger.js";

export async function runMonthlySettle(): Promise<void> {

  const allGroups = await db
    .select({ id: groups.id, name: groups.name, ownerUserId: groups.ownerUserId })
    .from(groups);

  for (const g of allGroups) {
    try {
      const balances = await computeBalances(g.id);
      if (balances.length === 0) continue;

      const transfers = minTransfers(balances);

      const memberIds = Array.from(
        new Set([
          ...transfers.map((t) => t.from),
          ...transfers.map((t) => t.to),
          g.ownerUserId,
        ]),
      );

      const memberUsers = memberIds.length
        ? await db
            .select({ id: users.id, displayName: users.displayName, lineUserId: users.lineUserId })
            .from(users)
            .where(inArray(users.id, memberIds))
        : [];
      const nameById = new Map(
        memberUsers.map((u) => [u.id, u.displayName ?? "成員"] as const),
      );

      const namedTransfers = transfers.map((t) => ({
        fromName: nameById.get(t.from) ?? "成員",
        toName: nameById.get(t.to) ?? "成員",
        amount: t.amount,
        fromUserId: t.from,
        toUserId: t.to,
      }));

      const ownerLineId = memberUsers.find((u) => u.id === g.ownerUserId)?.lineUserId;
      if (!ownerLineId) continue;

      const [pref] = await db
        .select({ notifyMonthly: userPreferences.notifyMonthly })
        .from(userPreferences)
        .where(eq(userPreferences.userId, g.ownerUserId))
        .limit(1);
      if (pref && pref.notifyMonthly === false) continue;

      const flex = buildSettleFlex({
        groupId: g.id,
        groupName: g.name,
        transfers: namedTransfers,
        liffSettleUrl: `${liffBase}/settle?groupId=${g.id}`,
      });

      await lineClient().pushMessage({ to: ownerLineId, messages: [flex] });
    } catch (err) {
      logger.error({ err }, `[monthlySettle] group=${g.id} failed`);
    }
  }
  // suppress unused import warning if groupMembers reserved for future
  void groupMembers;
  void eq;
}
