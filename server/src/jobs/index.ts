import cron from "node-cron";
import { runWeeklyInsight } from "./weeklyInsight.js";
import { runMonthlySettle } from "./monthlySettle.js";
import { runChurnNudge } from "./churnNudge.js";
import { runBudgetWarn } from "./budgetWarn.js";
import { runRecurring } from "./recurringRunner.js";
import { JOB_TZ as TZ } from "../lib/config.js";

async function safeRun(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    console.log(`[jobs] ${name} starting`);
    await fn();
    console.log(`[jobs] ${name} done`);
  } catch (err) {
    console.error(`[jobs] ${name} failed:`, err);
  }
}

export function startJobs(): void {
  // Weekly insight: Sundays at 21:00 TPE
  cron.schedule(
    "0 21 * * 0",
    () => {
      void safeRun("weeklyInsight", runWeeklyInsight);
    },
    { timezone: TZ },
  );

  // Monthly settle: 1st of month at 09:00 TPE
  cron.schedule(
    "0 9 1 * *",
    () => {
      void safeRun("monthlySettle", runMonthlySettle);
    },
    { timezone: TZ },
  );

  // Churn nudge: daily at 19:00 TPE
  cron.schedule(
    "0 19 * * *",
    () => {
      void safeRun("churnNudge", runChurnNudge);
    },
    { timezone: TZ },
  );

  // Budget warn: daily at 20:00 TPE
  cron.schedule(
    "0 20 * * *",
    () => {
      void safeRun("budgetWarn", runBudgetWarn);
    },
    { timezone: TZ },
  );

  // Recurring runner: daily at 00:30 TPE
  cron.schedule(
    "30 0 * * *",
    () => {
      void safeRun("recurring", runRecurring);
    },
    { timezone: TZ },
  );

  console.log(`[jobs] schedulers registered (TZ=${TZ})`);
}
