import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { aiInsights, groups, transactions, users, userPreferences } from "../db/schema.js";
import { weeklyInsight, type InsightData } from "../ai/weeklyInsight.js";
import { makeProvider } from "../ai/providers/factory.js";
import { buildInsightFlex } from "../line/flex/insight.js";
import { lineClient } from "../line/client.js";
import { LIFF_BASE as liffBase } from "../lib/config.js";
import { logger } from "../lib/logger.js";

function fmtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function runWeeklyInsight(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.error("[weeklyInsight] GEMINI_API_KEY not set; skipping");
    return;
  }
  const model = process.env.GEMINI_INSIGHT_MODEL ?? "gemini-2.5-flash";
  const provider = makeProvider({
    provider: "gemini",
    apiKey,
    endpoint: null,
    model,
  });

  const now = new Date();
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const periodStart = fmtDate(start);
  const periodEnd = fmtDate(now);

  const allGroups = await db
    .select({ id: groups.id, name: groups.name, ownerUserId: groups.ownerUserId })
    .from(groups);

  for (const g of allGroups) {
    try {
      const txs = await db
        .select({
          amount: transactions.amount,
          category: transactions.category,
          txDate: transactions.txDate,
          kind: transactions.kind,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.groupId, g.id),
            gte(transactions.txDate, periodStart),
            lte(transactions.txDate, periodEnd),
          ),
        );

      if (txs.length === 0) continue;

      const normalised = txs.map((t) => ({
        amount: Number(t.amount),
        category: t.category,
        txDate: t.txDate,
        kind: t.kind,
      }));

      const insight = await weeklyInsight(provider, normalised);

      const insightData: InsightData = {
        summary: insight.summary,
        topCategory: insight.topCategory ?? undefined,
        topCategoryAmount: insight.topCategoryAmount ?? undefined,
        comparedLastWeek: insight.comparedLastWeek ?? undefined,
        tips: insight.tips,
      };

      await db.insert(aiInsights).values({
        groupId: g.id,
        periodStart,
        periodEnd,
        insights: insightData,
      });

      const owner = await db
        .select({ lineUserId: users.lineUserId })
        .from(users)
        .where(eq(users.id, g.ownerUserId))
        .limit(1);

      const lineUserId = owner[0]?.lineUserId;
      if (!lineUserId) continue;

      const [pref] = await db
        .select({ notifyWeekly: userPreferences.notifyWeekly })
        .from(userPreferences)
        .where(eq(userPreferences.userId, g.ownerUserId))
        .limit(1);
      if (pref && pref.notifyWeekly === false) continue;

      const flex = buildInsightFlex({
        periodLabel: `${g.name}・${periodStart} ~ ${periodEnd}`,
        summary: insight.summary,
        topCategory: insight.topCategory ?? undefined,
        topCategoryAmount: insight.topCategoryAmount ?? undefined,
        tips: insight.tips,
        liffDashboardUrl: `${liffBase}/dashboard?groupId=${g.id}`,
      });

      await lineClient().pushMessage({ to: lineUserId, messages: [flex] });
    } catch (err) {
      logger.error({ err }, `[weeklyInsight] group=${g.id} failed`);
    }
  }
}
