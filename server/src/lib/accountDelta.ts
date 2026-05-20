import { eq, sql as dsql } from "drizzle-orm";
import { db } from "../db/client.js";
import { accounts } from "../db/schema.js";

export async function applyDelta(
  accountId: string,
  delta: number,
  tx: typeof db = db,
): Promise<void> {
  await tx
    .update(accounts)
    .set({
      balance: dsql`${accounts.balance} + ${delta.toFixed(2)}::numeric`,
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, accountId));
}

export function signedAmount(kind: string, amount: number): number {
  if (kind === "income" || kind === "fund_in") return Math.abs(amount);
  return -Math.abs(amount);
}
