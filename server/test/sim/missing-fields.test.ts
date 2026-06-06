import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { integrationAvailable } from "../setup.js";
import { getDb } from "../helpers.js";
import { setupSim, resetSim, type Sim } from "./harness.js";
import { textEvent, followEvent, postbackEvent } from "./events.js";
import { lastReply, quickReplyPostbackData, messageText } from "./fakeLine.js";

const U = "U_missing_fields";

function splitParse(overrides: {
  total?: number | null;
  payment?: string | null;
  debts?: { name: string; amount: number }[];
  my_share?: number | null;
  category?: string | null;
}) {
  return {
    type: "split_expense",
    is_complete: false,
    missing_fields: [],
    confidence: 0.9,
    data: {
      description: "麥當勞午餐",
      total_amount: overrides.total === undefined ? 500 : overrides.total,
      payment_method: overrides.payment === undefined ? null : overrides.payment,
      payer_id: "me",
      my_share: overrides.my_share ?? null,
      debts: overrides.debts ?? [
        { name: "a", amount: 180 },
        { name: "b", amount: 200 },
      ],
      fund_name: null,
      category: overrides.category === undefined ? "餐飲" : overrides.category,
      tx_date: null,
    },
  };
}

async function activePendings(userId?: string) {
  const db = await getDb();
  const { pendingEntries } = await import("../../src/db/schema.js");
  if (!userId) return db.select().from(pendingEntries);
  return db.select().from(pendingEntries).where(eq(pendingEntries.userId, userId));
}

describe.skipIf(!integrationAvailable)("missing-fields follow-up flow", () => {
  let sim: Sim;

  beforeAll(async () => {
    sim = await setupSim();
  });

  beforeEach(async () => {
    await resetSim();
    await sim.send(followEvent(U));
    sim.replies.length = 0;
  });

  // T-331
  it("asks for the amount when total_amount is missing", async () => {
    sim.provider.enqueue(splitParse({ total: null }));
    await sim.send(textEvent(U, "和a和b吃麥當勞我先出"));
    expect(quickReplyPostbackData().join("|")).toContain("action=set_amount");
  });

  // T-332
  it("asks for the payment method when missing", async () => {
    sim.provider.enqueue(splitParse({ payment: null }));
    await sim.send(textEvent(U, "和a和b吃麥當勞我先出 a180 b200 共500"));
    expect(messageText(lastReply()!.messages)).toContain("pick_account");
  });

  // T-333
  it("re-asks the distribution when the math is wrong", async () => {
    sim.provider.enqueue(
      splitParse({ payment: "現金", my_share: 100, debts: [{ name: "a", amount: 180 }], total: 500 }),
    );
    await sim.send(textEvent(U, "和a吃飯我先出共500 a出180"));
    expect(messageText(lastReply()!.messages)).toContain("分帳金額對不上");
  });

  // T-334: amount asked first, then payment method after it's answered
  it("asks fields in order: amount before payment method", async () => {
    sim.provider.enqueue(splitParse({ total: null, payment: null }));
    await sim.send(textEvent(U, "和a和b吃麥當勞我先出"));
    const data = quickReplyPostbackData().join("|");
    expect(data).toContain("action=set_amount");
    const pendingId = /pendingId=([0-9a-f-]+)/.exec(data)?.[1];
    expect(pendingId).toBeTruthy();

    sim.replies.length = 0;
    await sim.send(postbackEvent(U, `action=set_amount&pendingId=${pendingId}&amount=500`));
    expect(messageText(lastReply()!.messages)).toContain("pick_account");
  });

  // T-335
  it("goes straight to confirm when everything is present", async () => {
    sim.provider.enqueue(splitParse({ payment: "現金", my_share: 120 }));
    await sim.send(textEvent(U, "和a和b吃麥當勞我先出 現金 a180 b200 共500"));
    expect(messageText(lastReply()!.messages)).toContain("confirm_entry");
  });

  // T-336
  it("accepts a typed number as the amount answer", async () => {
    sim.provider.enqueue(splitParse({ total: null, payment: null }));
    await sim.send(textEvent(U, "和a和b吃麥當勞我先出"));
    sim.replies.length = 0;
    await sim.send(textEvent(U, "500"));
    // Advanced past the amount: next ask is the account picker.
    expect(messageText(lastReply()!.messages)).toContain("pick_account");
  });

  // T-337
  it("answers 已逾時 for postbacks on an expired pending", async () => {
    sim.provider.enqueue(splitParse({ payment: "現金", my_share: 120 }));
    await sim.send(textEvent(U, "和a和b吃麥當勞我先出 現金 a180 b200 共500"));
    const rows = await activePendings();
    expect(rows).toHaveLength(1);
    const db = await getDb();
    const { pendingEntries } = await import("../../src/db/schema.js");
    await db
      .update(pendingEntries)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(pendingEntries.id, rows[0]!.id));

    sim.replies.length = 0;
    await sim.send(postbackEvent(U, `action=confirm_entry&pendingId=${rows[0]!.id}`));
    expect(messageText(lastReply()!.messages)).toContain("已逾時");
  });

  // T-338
  it("a new parse supersedes the old pending in the same DM", async () => {
    sim.provider.enqueue(splitParse({ total: null }));
    await sim.send(textEvent(U, "和a和b吃麥當勞我先出"));
    const before = await activePendings();
    expect(before).toHaveLength(1);

    sim.provider.enqueue(splitParse({ payment: "現金", my_share: 120 }));
    await sim.send(textEvent(U, "和a和b吃晚餐我先出 現金 a180 b200 共500"));
    const after = await activePendings();
    expect(after).toHaveLength(1);
    expect(after[0]!.id).not.toBe(before[0]!.id);
  });
});
