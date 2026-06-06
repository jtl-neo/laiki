import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { integrationAvailable } from "./setup.js";
import { cleanDb, seedPaymentMethod, seedUser } from "./helpers.js";

async function lib() {
  return import("../src/lib/paymentMethods.js");
}

describe.skipIf(!integrationAvailable)("paymentMethods", () => {
  beforeAll(async () => {
    await cleanDb();
  });
  afterEach(async () => {
    await cleanDb();
  });

  // T-231
  it("creates and lists payment methods", async () => {
    const { createPaymentMethod, listPaymentMethods } = await lib();
    const user = await seedUser();
    await createPaymentMethod(user.userId, "富邦卡", "CREDIT");
    await createPaymentMethod(user.userId, "現金", "CASH");
    const list = await listPaymentMethods(user.userId);
    expect(list.map((m) => m.name).sort()).toEqual(["富邦卡", "現金"].sort());
  });

  // T-232
  it("resolves an exact name", async () => {
    const { resolvePaymentMethod } = await lib();
    const user = await seedUser();
    const pm = await seedPaymentMethod(user.userId, "富邦卡", "CREDIT");
    const hit = await resolvePaymentMethod(user.userId, "富邦卡");
    expect(hit?.id).toBe(pm.id);
  });

  // T-233: unique substring match
  it("resolves a unique partial name (富邦 → 富邦卡)", async () => {
    const { resolvePaymentMethod } = await lib();
    const user = await seedUser();
    const pm = await seedPaymentMethod(user.userId, "富邦卡", "CREDIT");
    await seedPaymentMethod(user.userId, "現金", "CASH");
    const hit = await resolvePaymentMethod(user.userId, "富邦");
    expect(hit?.id).toBe(pm.id);
  });

  it("returns null when the partial match is ambiguous", async () => {
    const { resolvePaymentMethod } = await lib();
    const user = await seedUser();
    await seedPaymentMethod(user.userId, "富邦卡", "CREDIT");
    await seedPaymentMethod(user.userId, "富邦銀行", "CASH");
    expect(await resolvePaymentMethod(user.userId, "富邦")).toBeNull();
  });

  // T-234
  it("returns null when nothing matches", async () => {
    const { resolvePaymentMethod } = await lib();
    const user = await seedUser();
    await seedPaymentMethod(user.userId, "現金", "CASH");
    expect(await resolvePaymentMethod(user.userId, "台新卡")).toBeNull();
  });

  it("matches case-insensitively and ignores width", async () => {
    const { resolvePaymentMethod } = await lib();
    const user = await seedUser();
    const pm = await seedPaymentMethod(user.userId, "LINE Pay", "CASH");
    const hit = await resolvePaymentMethod(user.userId, "line pay");
    expect(hit?.id).toBe(pm.id);
  });
});
