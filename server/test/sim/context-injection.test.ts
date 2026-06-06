import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { integrationAvailable } from "../setup.js";
import { getDb, seedFundGroup, seedPaymentMethod, seedShadow } from "../helpers.js";
import { setupSim, resetSim, type Sim } from "./harness.js";
import { textEvent, followEvent } from "./events.js";

const U = "U_ctx_inject";

const minimalParse = {
  type: "split_expense",
  is_complete: true,
  confidence: 0.9,
  data: {
    total_amount: 500,
    payment_method: "富邦卡",
    my_share: 320,
    debts: [{ name: "老王", amount: 180 }],
  },
};

async function userIdFor(lineUserId: string): Promise<string> {
  const db = await getDb();
  const { users } = await import("../../src/db/schema.js");
  const [u] = await db.select().from(users).where(eq(users.lineUserId, lineUserId));
  if (!u) throw new Error("user not found");
  return u.id;
}

describe.skipIf(!integrationAvailable)("context injection", () => {
  let sim: Sim;

  beforeAll(async () => {
    sim = await setupSim();
  });

  beforeEach(async () => {
    await resetSim();
    await sim.send(followEvent(U));
    sim.replies.length = 0;
  });

  // T-341
  it("injects aliases, payment methods and fund names into the prompt", async () => {
    const uid = await userIdFor(U);
    await seedShadow(uid, "老王");
    await seedPaymentMethod(uid, "富邦卡", "CREDIT");
    await seedFundGroup(uid, "家裡用的東西", 5000);

    sim.provider.enqueue(minimalParse);
    await sim.send(textEvent(U, "和老王吃飯我先出 富邦卡 共500 老王180"));

    const sys = sim.provider.lastCall!.systemPrompt;
    expect(sys).toContain("已知好友");
    expect(sys).toContain("老王");
    expect(sys).toContain("富邦卡");
    expect(sys).toContain("家裡用的東西");
  });

  // T-342
  it("omits the context block (and never says undefined) for a new user", async () => {
    sim.provider.enqueue(minimalParse);
    await sim.send(textEvent(U, "和老王吃飯我先出 富邦卡 共500 老王180"));

    const sys = sim.provider.lastCall!.systemPrompt;
    // The instruction text mentions the lists; the injected block header
    // must be absent when the user has no data.
    expect(sys).not.toContain("使用者已知資料");
    expect(sys).not.toContain("undefined");
  });
});
