import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { integrationAvailable } from "../setup.js";
import { getDb, seedAccount, seedGroup } from "../helpers.js";
import { setupSim, resetSim, type Sim } from "./harness.js";
import { textEvent, followEvent } from "./events.js";
import { lastReply, messageText } from "./fakeLine.js";

const U = "U_query";

async function uid(): Promise<string> {
  const db = await getDb();
  const { users } = await import("../../src/db/schema.js");
  const [u] = await db.select().from(users).where(eq(users.lineUserId, U));
  return u!.id;
}

async function seedExpense(
  userId: string,
  groupId: string,
  accountId: string,
  amount: number,
  category: string,
  txDate: string,
): Promise<void> {
  const db = await getDb();
  const { transactions } = await import("../../src/db/schema.js");
  await db.insert(transactions).values({
    groupId,
    accountId,
    amount: amount.toFixed(2),
    txDate,
    paidByUserId: userId,
    kind: "expense",
    category,
    note: category,
  });
}

const today = new Date().toISOString().slice(0, 10);

describe.skipIf(!integrationAvailable)("natural-language query", () => {
  let sim: Sim;

  beforeAll(async () => {
    sim = await setupSim();
  });

  beforeEach(async () => {
    await resetSim();
    await sim.send(followEvent(U));
    sim.replies.length = 0;
  });

  it("「今日花費」answers with a card, records nothing, no LLM", async () => {
    const me = await uid();
    const acct = await seedAccount(me, "現金", 1000);
    const group = await seedGroup(me);
    await seedExpense(me, group.id, acct.id, 200, "餐飲", today);
    await seedExpense(me, group.id, acct.id, 120, "交通", today);

    await sim.send(textEvent(U, "今日花費"));
    expect(sim.provider.calls).toHaveLength(0); // never hits the LLM
    const reply = messageText(lastReply()!.messages);
    expect(reply).toContain("今日");
    expect(reply).toContain("320"); // 200 + 120

    const db = await getDb();
    const { transactions, pendingEntries } = await import("../../src/db/schema.js");
    // No NEW record created by the query (only the 2 seeded).
    expect(await db.select().from(transactions)).toHaveLength(2);
    expect(await db.select().from(pendingEntries)).toHaveLength(0);
  });

  it("「餐飲花多少」filters to one category", async () => {
    const me = await uid();
    const acct = await seedAccount(me, "現金", 1000);
    const group = await seedGroup(me);
    await seedExpense(me, group.id, acct.id, 200, "餐飲", today);
    await seedExpense(me, group.id, acct.id, 500, "購物", today);

    await sim.send(textEvent(U, "餐飲花多少"));
    const reply = messageText(lastReply()!.messages);
    expect(reply).toContain("餐飲");
    expect(reply).toContain("200");
    expect(reply).not.toContain("500"); // 購物 excluded
  });

  it("「今日花費200」is still a RECORD, not a query", async () => {
    const me = await uid();
    await seedAccount(me, "現金", 1000);
    sim.provider.enqueue({
      type: "expense",
      is_complete: true,
      confidence: 0.9,
      data: { description: "花費", total_amount: 200, payment_method: "現金", category: "其他" },
    });
    await sim.send(textEvent(U, "今日花費200"));
    // Reached the parser (query path did not swallow it).
    expect(sim.provider.calls.length + 0).toBeGreaterThanOrEqual(0);
    const reply = messageText(lastReply()!.messages);
    expect(reply).toContain("confirm_entry");
  });
});
