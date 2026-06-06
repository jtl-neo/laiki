import { and, eq, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { recurringTransactions, transactions } from "../db/schema.js";
import { applyDelta, signedAmount } from "../lib/accountDelta.js";
import { computeNextRunDate, parseYmd, ymd, type Frequency } from "../lib/recurring.js";

export async function runRecurring(): Promise<void> {
  const today = ymd(new Date());
  const due = await db
    .select()
    .from(recurringTransactions)
    .where(
      and(eq(recurringTransactions.active, true), lte(recurringTransactions.nextRunDate, today)),
    );

  for (const r of due) {
    try {
      let runDate = r.nextRunDate;
      let safety = 0;
      while (runDate <= today && safety < 50) {
        if (r.endDate && runDate > r.endDate) break;
        const next = ymd(
          computeNextRunDate(parseYmd(runDate), r.frequency as Frequency, r.anchorDay),
        );
        // Each occurrence is atomic: tx insert + balance delta + nextRunDate
        // advance commit together, so a crash mid-loop can never replay an
        // occurrence that already posted (old code advanced nextRunDate only
        // after the whole loop).
        await db.transaction(async (dtx) => {
          await dtx.insert(transactions).values({
            groupId: r.groupId,
            accountId: r.accountId,
            amount: r.amount,
            txDate: runDate,
            paidByUserId: r.userId,
            category: r.category,
            kind: r.kind,
            note: r.note ?? "定期定額",
            source: "manual",
          });
          await applyDelta(r.accountId, signedAmount(r.kind, Number(r.amount)), dtx);
          await dtx
            .update(recurringTransactions)
            .set({ lastRunDate: today, nextRunDate: next, updatedAt: new Date() })
            .where(eq(recurringTransactions.id, r.id));
        });
        runDate = next;
        safety++;
      }
      const deactivate = r.endDate ? runDate > r.endDate : false;
      if (deactivate) {
        await db
          .update(recurringTransactions)
          .set({ active: false, updatedAt: new Date() })
          .where(eq(recurringTransactions.id, r.id));
      }
    } catch (err) {
      console.error(`[recurring] failed for ${r.id}:`, err);
    }
  }
}
