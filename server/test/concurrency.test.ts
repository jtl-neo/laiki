import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { integrationAvailable } from "./setup.js";
import { cleanDb, getDb, seedAccount, seedGroup, seedShadow, seedUser } from "./helpers.js";

async function schema() {
  return import("../src/db/schema.js");
}

describe.skipIf(!integrationAvailable)("concurrency hardening", () => {
  beforeAll(async () => {
    await cleanDb();
  });
  afterEach(async () => {
    await cleanDb();
  });

  it("two concurrent commits of the same pending apply the delta exactly once", async () => {
    const { upsertPending, commitPending } = await import("../src/lib/pendingEntry.js");
    const owner = await seedUser("Owner");
    const account = await seedAccount(owner.userId, "Cash", 1000);
    const group = await seedGroup(owner.userId);

    const pending = await upsertPending({
      userId: owner.userId,
      groupId: group.id,
      lineGroupId: null,
      mode: "personal",
      step: "confirm",
      draft: {
        amount: 100,
        kind: "expense",
        category: "餐飲",
        accountId: account.id,
        accountHint: null,
        note: null,
        txDate: "2026-06-06",
        participantUserIds: [],
        confidence: 0.9,
        categoryResolved: true,
      },
    });

    const [r1, r2] = await Promise.all([
      commitPending(pending.id),
      commitPending(pending.id),
    ]);
    const successes = [r1, r2].filter((r) => "txId" in r);
    expect(successes).toHaveLength(1);

    const db = await getDb();
    const { transactions, accounts } = await schema();
    expect(await db.select().from(transactions)).toHaveLength(1);
    const [acct] = await db.select().from(accounts).where(eq(accounts.id, account.id));
    expect(Number(acct!.balance)).toBe(900); // exactly one -100, not two
  });

  it("two concurrent claims of the same code: only one wins", async () => {
    const { generateBindingCode, claimBindingCode } = await import(
      "../src/lib/shadowAccount.js"
    );
    const owner = await seedUser("Owner");
    const shadow = await seedShadow(owner.userId, "a");
    const code = await generateBindingCode(shadow.id, owner.userId);

    const [r1, r2] = await Promise.all([
      claimBindingCode(code, "U_claimer_1", "one"),
      claimBindingCode(code, "U_claimer_2", "two"),
    ]);
    const wins = [r1, r2].filter((r) => r.ok);
    expect(wins).toHaveLength(1);

    const db = await getDb();
    const { users } = await schema();
    const [u] = await db.select().from(users).where(eq(users.id, shadow.id));
    // The shadow belongs to exactly one of the two claimers.
    expect(["U_claimer_1", "U_claimer_2"]).toContain(u!.lineUserId);
    expect(u!.isVirtual).toBe(false);
  });

  it("concurrent resolveOrCreateShadow for the same alias yields one user", async () => {
    const { resolveOrCreateShadow } = await import("../src/lib/shadowAccount.js");
    const owner = await seedUser("Owner");

    const ids = await Promise.all([
      resolveOrCreateShadow(owner.userId, "新朋友"),
      resolveOrCreateShadow(owner.userId, "新朋友"),
      resolveOrCreateShadow(owner.userId, "新朋友"),
    ]);
    expect(new Set(ids).size).toBe(1);

    const db = await getDb();
    const { users } = await schema();
    const rows = await db.select().from(users).where(eq(users.createdBy, owner.userId));
    expect(rows).toHaveLength(1);
  });

  it("applyDelta rejects non-finite deltas", async () => {
    const { applyDelta } = await import("../src/lib/accountDelta.js");
    const owner = await seedUser("Owner");
    const account = await seedAccount(owner.userId, "Cash", 100);
    await expect(applyDelta(account.id, Number.NaN)).rejects.toThrow(/non-finite/);
    await expect(applyDelta(account.id, Infinity)).rejects.toThrow(/non-finite/);
  });
});
