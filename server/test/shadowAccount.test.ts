import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { integrationAvailable } from "./setup.js";
import { cleanDb, getDb, seedShadow, seedUser } from "./helpers.js";

async function lib() {
  return import("../src/lib/shadowAccount.js");
}

async function schema() {
  return import("../src/db/schema.js");
}

describe.skipIf(!integrationAvailable)("shadowAccount", () => {
  beforeAll(async () => {
    await cleanDb();
  });
  afterEach(async () => {
    await cleanDb();
  });

  // T-211
  it("creates a virtual user with created_by on first resolve", async () => {
    const { resolveOrCreateShadow } = await lib();
    const { users } = await schema();
    const db = await getDb();
    const owner = await seedUser("Owner");

    const id = await resolveOrCreateShadow(owner.userId, "a");
    const [row] = await db.select().from(users).where(eq(users.id, id));
    expect(row!.isVirtual).toBe(true);
    expect(row!.createdBy).toBe(owner.userId);
    expect(row!.displayName).toBe("a");
    expect(row!.lineUserId).toBeNull();
  });

  // T-212
  it("returns the same user for the same alias twice", async () => {
    const { resolveOrCreateShadow } = await lib();
    const owner = await seedUser("Owner");
    const first = await resolveOrCreateShadow(owner.userId, "a");
    const second = await resolveOrCreateShadow(owner.userId, "a");
    expect(second).toBe(first);
  });

  // T-213
  it("scopes aliases per creator", async () => {
    const { resolveOrCreateShadow } = await lib();
    const owner1 = await seedUser("Owner1");
    const owner2 = await seedUser("Owner2");
    const a1 = await resolveOrCreateShadow(owner1.userId, "a");
    const a2 = await resolveOrCreateShadow(owner2.userId, "a");
    expect(a1).not.toBe(a2);
  });

  // T-214
  it("returns the bound friend instead of creating a shadow", async () => {
    const { resolveOrCreateShadow } = await lib();
    const { users } = await schema();
    const db = await getDb();
    const owner = await seedUser("Owner");
    // A previously-claimed shadow: real LINE id, not virtual, still created by owner.
    const [friend] = await db
      .insert(users)
      .values({
        lineUserId: "U_friend_real",
        displayName: "a",
        isVirtual: false,
        createdBy: owner.userId,
      })
      .returning();

    const resolved = await resolveOrCreateShadow(owner.userId, "a");
    expect(resolved).toBe(friend!.id);
    const all = await db.select().from(users).where(eq(users.createdBy, owner.userId));
    expect(all).toHaveLength(1); // no extra shadow created
  });

  // T-215 / T-151
  it("generates a 6-digit binding code with future expiry", async () => {
    const { generateBindingCode } = await lib();
    const { bindingCodes } = await schema();
    const db = await getDb();
    const owner = await seedUser("Owner");
    const shadow = await seedShadow(owner.userId, "a");

    const code = await generateBindingCode(shadow.id, owner.userId);
    expect(code).toMatch(/^\d{6}$/);
    const [row] = await db.select().from(bindingCodes).where(eq(bindingCodes.code, code));
    expect(row!.virtualUserId).toBe(shadow.id);
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(row!.usedAt).toBeNull();
  });

  // T-216
  it("claims a code: fills line_user_id, clears is_virtual, marks used", async () => {
    const { generateBindingCode, claimBindingCode } = await lib();
    const { users, bindingCodes } = await schema();
    const db = await getDb();
    const owner = await seedUser("Owner");
    const shadow = await seedShadow(owner.userId, "a");
    const code = await generateBindingCode(shadow.id, owner.userId);

    const result = await claimBindingCode(code, "U_real_a", "真實a");
    expect(result).toMatchObject({ ok: true, userId: shadow.id });

    const [u] = await db.select().from(users).where(eq(users.id, shadow.id));
    expect(u!.lineUserId).toBe("U_real_a");
    expect(u!.isVirtual).toBe(false);
    const [c] = await db.select().from(bindingCodes).where(eq(bindingCodes.code, code));
    expect(c!.usedAt).not.toBeNull();
  });

  // T-217: debts keep pointing at the same UUID after a fresh claim
  it("keeps existing debts attached after claim (same UUID)", async () => {
    const { generateBindingCode, claimBindingCode } = await lib();
    const { debts, transactions } = await schema();
    const db = await getDb();
    const owner = await seedUser("Owner");
    const shadow = await seedShadow(owner.userId, "a");
    const { seedAccount, seedGroup } = await import("./helpers.js");
    const account = await seedAccount(owner.userId, "Cash", 1000);
    const group = await seedGroup(owner.userId);
    const [tx] = await db
      .insert(transactions)
      .values({
        groupId: group.id,
        accountId: account.id,
        amount: "500.00",
        txDate: "2026-06-01",
        paidByUserId: owner.userId,
        kind: "expense",
      })
      .returning();
    await db.insert(debts).values({
      transactionId: tx!.id,
      creditorId: owner.userId,
      debtorId: shadow.id,
      amount: "180.00",
    });

    const code = await generateBindingCode(shadow.id, owner.userId);
    const result = await claimBindingCode(code, "U_real_a", "a");
    expect(result.ok).toBe(true);

    const rows = await db.select().from(debts).where(eq(debts.debtorId, shadow.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe("180.00");
  });

  // T-218
  it("rejects expired, used and unknown codes", async () => {
    const { generateBindingCode, claimBindingCode } = await lib();
    const { bindingCodes } = await schema();
    const db = await getDb();
    const owner = await seedUser("Owner");
    const shadow = await seedShadow(owner.userId, "a");

    // unknown
    expect(await claimBindingCode("000000", "U_x", "x")).toMatchObject({
      ok: false,
      error: "not_found",
    });

    // expired
    const expired = await generateBindingCode(shadow.id, owner.userId);
    await db
      .update(bindingCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(bindingCodes.code, expired));
    expect(await claimBindingCode(expired, "U_x", "x")).toMatchObject({
      ok: false,
      error: "expired",
    });

    // used
    const used = await generateBindingCode(shadow.id, owner.userId);
    await claimBindingCode(used, "U_real_a", "a");
    expect(await claimBindingCode(used, "U_other", "o")).toMatchObject({
      ok: false,
      error: "used",
    });
  });

  // T-314
  it("rejects self-claim by the code creator", async () => {
    const { generateBindingCode, claimBindingCode } = await lib();
    const db = await getDb();
    const { users } = await schema();
    const owner = await seedUser("Owner");
    const [ownerRow] = await db.select().from(users).where(eq(users.id, owner.userId));
    const shadow = await seedShadow(owner.userId, "a");
    const code = await generateBindingCode(shadow.id, owner.userId);

    expect(await claimBindingCode(code, ownerRow!.lineUserId!, "Owner")).toMatchObject({
      ok: false,
      error: "self_claim",
    });
  });

  // T-219: claimer already exists as a real user → merge shadow INTO real
  it("merges the shadow into an existing real user", async () => {
    const { generateBindingCode, claimBindingCode } = await lib();
    const { users, debts, transactions } = await schema();
    const db = await getDb();
    const owner = await seedUser("Owner");
    const real = await seedUser("RealA"); // already followed the bot
    const [realRow] = await db.select().from(users).where(eq(users.id, real.userId));
    const shadow = await seedShadow(owner.userId, "a");

    const { seedAccount, seedGroup } = await import("./helpers.js");
    const account = await seedAccount(owner.userId, "Cash", 1000);
    const group = await seedGroup(owner.userId);
    const [tx] = await db
      .insert(transactions)
      .values({
        groupId: group.id,
        accountId: account.id,
        amount: "500.00",
        txDate: "2026-06-01",
        paidByUserId: owner.userId,
        kind: "expense",
      })
      .returning();
    await db.insert(debts).values({
      transactionId: tx!.id,
      creditorId: owner.userId,
      debtorId: shadow.id,
      amount: "180.00",
    });

    const code = await generateBindingCode(shadow.id, owner.userId);
    const result = await claimBindingCode(code, realRow!.lineUserId!, "RealA");
    expect(result).toMatchObject({ ok: true, userId: real.userId });

    // Debt repointed to the real user; shadow row gone.
    const debtRows = await db.select().from(debts).where(eq(debts.debtorId, real.userId));
    expect(debtRows).toHaveLength(1);
    const shadowRows = await db.select().from(users).where(eq(users.id, shadow.id));
    expect(shadowRows).toHaveLength(0);
  });
});
