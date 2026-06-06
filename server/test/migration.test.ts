import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { integrationAvailable } from "./setup.js";
import { cleanDb, getDb, seedShadow, seedUser } from "./helpers.js";

describe.skipIf(!integrationAvailable)("schema migration (shadow accounts)", () => {
  beforeAll(async () => {
    await cleanDb();
  });

  afterEach(async () => {
    await cleanDb();
  });

  // T-201
  it("users has is_virtual / created_by and nullable line_user_id", async () => {
    const db = await getDb();
    const { users } = await import("../src/db/schema.js");
    const owner = await seedUser("Owner");
    const [shadow] = await db
      .insert(users)
      .values({
        lineUserId: null,
        displayName: "a",
        isVirtual: true,
        createdBy: owner.userId,
      })
      .returning();
    expect(shadow).toBeTruthy();
    expect(shadow!.lineUserId).toBeNull();
    expect(shadow!.isVirtual).toBe(true);
    expect(shadow!.createdBy).toBe(owner.userId);
  });

  // T-202: partial unique index must not block multiple NULL line_user_ids
  it("allows multiple shadow users with NULL line_user_id", async () => {
    const owner = await seedUser("Owner");
    const a = await seedShadow(owner.userId, "a");
    const b = await seedShadow(owner.userId, "b");
    expect(a.id).not.toBe(b.id);
  });

  // T-203: real line ids stay unique
  it("rejects duplicate non-null line_user_id", async () => {
    const db = await getDb();
    const { users } = await import("../src/db/schema.js");
    await db.insert(users).values({ lineUserId: "U_dup", displayName: "x" });
    await expect(
      db.insert(users).values({ lineUserId: "U_dup", displayName: "y" }),
    ).rejects.toThrow();
  });

  it("new tables exist: debts, payment_methods, binding_codes", async () => {
    const db = await getDb();
    const { debts, paymentMethods, bindingCodes } = await import("../src/db/schema.js");
    // Empty selects prove the relations exist with the expected columns.
    expect(await db.select().from(debts)).toEqual([]);
    expect(await db.select().from(paymentMethods)).toEqual([]);
    expect(await db.select().from(bindingCodes)).toEqual([]);
  });

  it("default isVirtual is false for regular users", async () => {
    const db = await getDb();
    const { users } = await import("../src/db/schema.js");
    const { eq } = await import("drizzle-orm");
    const u = await seedUser("Regular");
    const [row] = await db.select().from(users).where(eq(users.id, u.userId));
    expect(row!.isVirtual).toBe(false);
  });
});
