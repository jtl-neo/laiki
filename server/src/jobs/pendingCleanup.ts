import { purgeExpiredPending } from "../lib/pendingEntry.js";
import { logger } from "../lib/logger.js";

/**
 * Delete expired pending_entries rows. Wired into the cron scheduler in
 * jobs/index.ts to run hourly. purgeExpiredPending swallows its own errors.
 */
export async function runPendingCleanup(): Promise<void> {
  const deleted = await purgeExpiredPending();
  logger.debug({ deleted }, "purged expired pending entries");
}
