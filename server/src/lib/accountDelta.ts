import { eq, sql as dsql } from "drizzle-orm";
import { db } from "../db/client.js";
import { accounts } from "../db/schema.js";

// Accepts either the base db client or a transaction client (PgTransaction),
// both of which expose the .update().set().where() builder used below.
type DbOrTx = Pick<typeof db, "update">;

export async function applyDelta(
  accountId: string,
  delta: number,
  tx: DbOrTx = db,
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
