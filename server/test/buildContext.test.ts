import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { integrationAvailable } from "./setup.js";
import {
  cleanDb,
  getDb,
  seedFundGroup,
  seedPaymentMethod,
  seedShadow,
  seedUser,
} from "./helpers.js";

describe.skipIf(!integrationAvailable)("loadParseContext (DB-backed)", () => {
  beforeAll(async () => {
    await cleanDb();
  });
  afterEach(async () => {
    await cleanDb();
  });

  // T-241
  it("returns aliases, payment methods and fund names", async () => {
    const { loadParseContext } = await import("../src/ai/buildContext.js");
    const user = await seedUser("Me");
    await seedShadow(user.userId, "a");
    await seedShadow(user.userId, "老王");
    await seedPaymentMethod(user.userId, "富邦卡", "CREDIT");
    await seedFundGroup(user.userId, "家裡用的東西", 5000);

    const ctx = await loadParseContext(user.userId);
    expect(ctx.aliases.sort()).toEqual(["a", "老王"].sort());
    expect(ctx.paymentMethods).toEqual(["富邦卡"]);
    expect(ctx.fundNames).toEqual(["家裡用的東西"]);
  });

  // T-242
  it("returns empty lists for a brand-new user", async () => {
    const { loadParseContext } = await import("../src/ai/buildContext.js");
    const user = await seedUser("New");
    const ctx = await loadParseContext(user.userId);
    expect(ctx).toEqual({ aliases: [], paymentMethods: [], fundNames: [] });
  });

  // T-243: claimed (real) friends still show up as aliases
  it("includes bound friends created by the user", async () => {
    const { loadParseContext } = await import("../src/ai/buildContext.js");
    const { users } = await import("../src/db/schema.js");
    const db = await getDb();
    const user = await seedUser("Me");
    await db.insert(users).values({
      lineUserId: "U_claimed",
      displayName: "a",
      isVirtual: false,
      createdBy: user.userId,
    });

    const ctx = await loadParseContext(user.userId);
    expect(ctx.aliases).toEqual(["a"]);
  });
});
