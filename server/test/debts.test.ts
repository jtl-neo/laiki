import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { integrationAvailable } from "./setup.js";
import {
  cleanDb,
  getDb,
  seedAccount,
  seedGroup,
  seedShadow,
  seedUser,
} from "./helpers.js";

async function schema() {
  return import("../src/db/schema.js");
}

/** Build a committed split pending entry and return commit result + ids. */
async function commitSplit(opts?: { badAccount?: boolean }) {
  const { upsertPending, commitPending } = await import("../src/lib/pendingEntry.js");
  const owner = await seedUser("Owner");
  const account = await seedAccount(owner.userId, "Cash", 1000);
  const group = await seedGroup(owner.userId);
  const shadowA = await seedShadow(owner.userId, "a");
  const shadowB = await seedShadow(owner.userId, "b");

  const pending = await upsertPending({
    userId: owner.userId,
    groupId: group.id,
    lineGroupId: null,
    mode: "group_split",
    step: "confirm",
    draft: {
      amount: 500,
      kind: "expense",
      category: "餐飲",
      accountId: opts?.badAccount ? "00000000-0000-0000-0000-000000000000" : account.id,
      accountHint: null,
      note: "麥當勞",
      txDate: "2026-06-01",
      participantUserIds: [owner.userId, shadowA.id, shadowB.id],
      confidence: 0.9,
      participantsConfirmed: true,
      categoryResolved: true,
      debts: [
        { userId: shadowA.id, amount: 180 },
        { userId: shadowB.id, amount: 200 },
      ],
    },
  });
  const result = await commitPending(pending.id);
  return { result, owner, account, group, shadowA, shadowB };
}

describe.skipIf(!integrationAvailable)("debts dual-write", () => {
  beforeAll(async () => {
    await cleanDb();
  });
  afterEach(async () => {
    await cleanDb();
  });

  // T-221
  it("commitPending(split) writes PENDING debts with creditor=payer", async () => {
    const { debts } = await schema();
    const db = await getDb();
    const { result, owner, shadowA, shadowB } = await commitSplit();
    expect("txId" in result).toBe(true);

    const rows = await db.select().from(debts).where(eq(debts.creditorId, owner.userId));
    expect(rows).toHaveLength(2);
    const byDebtor = new Map(rows.map((r) => [r.debtorId, r]));
    expect(byDebtor.get(shadowA.id)?.amount).toBe("180.00");
    expect(byDebtor.get(shadowB.id)?.amount).toBe("200.00");
    expect(rows.every((r) => r.status === "PENDING")).toBe(true);
  });

  // T-222: splits and debts coexist and agree
  it("also writes transactionSplits consistent with debts", async () => {
    const { transactionSplits } = await schema();
    const db = await getDb();
    const { result, shadowA, shadowB } = await commitSplit();
    if (!("txId" in result)) throw new Error("commit failed");

    const splits = await db
      .select()
      .from(transactionSplits)
      .where(eq(transactionSplits.transactionId, result.txId));
    expect(splits).toHaveLength(3); // owner + a + b (equal split path)
    const ids = splits.map((s) => s.userId);
    expect(ids).toContain(shadowA.id);
    expect(ids).toContain(shadowB.id);
  });

  // T-223
  it("settleDebt marks a debt SETTLED", async () => {
    const { settleDebt } = await import("../src/lib/debts.js");
    const { debts } = await schema();
    const db = await getDb();
    const { owner } = await commitSplit();
    const [debt] = await db.select().from(debts).where(eq(debts.creditorId, owner.userId));
    await settleDebt(debt!.id);
    const [updated] = await db.select().from(debts).where(eq(debts.id, debt!.id));
    expect(updated!.status).toBe("SETTLED");
  });

  // T-224
  it("aggregates outstanding debts per user", async () => {
    const { getOutstandingForUser } = await import("../src/lib/debts.js");
    const { owner, shadowA } = await commitSplit();

    const mine = await getOutstandingForUser(owner.userId);
    expect(mine.owedToMe).toHaveLength(2);
    const a = mine.owedToMe.find((d) => d.userId === shadowA.id);
    expect(a?.amount).toBe(180);
    expect(mine.iOwe).toHaveLength(0);

    const theirs = await getOutstandingForUser(shadowA.id);
    expect(theirs.iOwe).toHaveLength(1);
    expect(theirs.iOwe[0]?.amount).toBe(180);
  });

  // T-225: atomicity — a failing commit leaves nothing behind
  it("rolls back debts and splits when the commit fails", async () => {
    const { debts, transactions, transactionSplits } = await schema();
    const db = await getDb();
    const { result } = await commitSplit({ badAccount: true });
    expect("error" in result).toBe(true);

    expect(await db.select().from(debts)).toHaveLength(0);
    expect(await db.select().from(transactions)).toHaveLength(0);
    expect(await db.select().from(transactionSplits)).toHaveLength(0);
  });
});
