import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { integrationAvailable } from "../setup.js";
import { getDb, seedAccount, seedGroup, seedShadow } from "../helpers.js";
import { setupSim, resetSim, type Sim } from "./harness.js";
import { textEvent, followEvent } from "./events.js";
import { lastReply, messageText, pushTargets } from "./fakeLine.js";

const OWNER = "U_scn_claim_owner";
const FRIEND = "U_scn_claim_friend";

async function ownerId(): Promise<string> {
  const db = await getDb();
  const { users } = await import("../../src/db/schema.js");
  const [u] = await db.select().from(users).where(eq(users.lineUserId, OWNER));
  return u!.id;
}

/** Shadow "a" owing the owner NT$180 on a committed transaction + a PIN. */
async function seedShadowWithDebt(): Promise<{ shadowId: string; pin: string }> {
  const uid = await ownerId();
  const db = await getDb();
  const { transactions, debts } = await import("../../src/db/schema.js");
  const { generateBindingCode } = await import("../../src/lib/shadowAccount.js");

  const shadow = await seedShadow(uid, "a");
  const account = await seedAccount(uid, "Cash", 1000);
  const group = await seedGroup(uid, "Test");
  const [tx] = await db
    .insert(transactions)
    .values({
      groupId: group.id,
      accountId: account.id,
      amount: "500.00",
      txDate: "2026-06-05",
      paidByUserId: uid,
      kind: "expense",
      note: "麥當勞午餐",
    })
    .returning();
  await db.insert(debts).values({
    transactionId: tx!.id,
    creditorId: uid,
    debtorId: shadow.id,
    amount: "180.00",
  });
  const pin = await generateBindingCode(shadow.id, uid);
  return { shadowId: shadow.id, pin };
}

describe.skipIf(!integrationAvailable)("scenario: 範例二 事後綁定", () => {
  let sim: Sim;

  beforeAll(async () => {
    sim = await setupSim();
  });

  beforeEach(async () => {
    await resetSim();
    await sim.send(followEvent(OWNER));
    sim.replies.length = 0;
  });

  // T-311 + T-315: claim awakens the shadow, replies the history card,
  // notifies the creator
  it("claims history with a PIN and notifies the creator", async () => {
    const { shadowId, pin } = await seedShadowWithDebt();

    await sim.send(followEvent(FRIEND));
    sim.replies.length = 0;
    await sim.send(textEvent(FRIEND, pin));

    const db = await getDb();
    const { users } = await import("../../src/db/schema.js");
    // FRIEND followed first → already a real user → merge path: shadow gone.
    const shadowRows = await db.select().from(users).where(eq(users.id, shadowId));
    expect(shadowRows).toHaveLength(0);

    const reply = messageText(lastReply()!.messages);
    expect(reply).toContain("認領歷史帳目");
    expect(reply).toContain("180");

    // Creator push (T-315).
    expect(pushTargets()).toContain(OWNER);
  });

  // T-311 variant: claimer who never followed → shadow awakens in place
  it("fresh claimer awakens the shadow UUID in place", async () => {
    const { shadowId, pin } = await seedShadowWithDebt();

    // The friend has NOT followed; simulate their very first DM = the PIN.
    // (LINE allows messages after add; our handler requires a user row, so
    // follow happens implicitly first in the real world. Here we follow
    // then delete nothing — claim merges. To test in-place awakening we
    // claim via the lib directly.)
    const { claimBindingCode } = await import("../../src/lib/shadowAccount.js");
    const result = await claimBindingCode(pin, "U_brand_new_a", "真實a");
    expect(result).toMatchObject({ ok: true, userId: shadowId, merged: false });

    const db = await getDb();
    const { users, debts } = await import("../../src/db/schema.js");
    const [u] = await db.select().from(users).where(eq(users.id, shadowId));
    expect(u!.lineUserId).toBe("U_brand_new_a");
    expect(u!.isVirtual).toBe(false);
    const rows = await db.select().from(debts).where(eq(debts.debtorId, shadowId));
    expect(rows).toHaveLength(1);
  });

  // T-312: wrong PIN harms nothing
  it("an unknown 6-digit number falls through without side effects", async () => {
    await seedShadowWithDebt();
    await sim.send(followEvent(FRIEND));
    sim.replies.length = 0;

    await sim.send(textEvent(FRIEND, "999999")); // not a real code; falls to parse
    // FakeProvider queue empty → parse fails → graceful error reply.
    expect(sim.replies.length).toBeGreaterThan(0);

    const db = await getDb();
    const { users } = await import("../../src/db/schema.js");
    const virtuals = await db.select().from(users).where(eq(users.isVirtual, true));
    expect(virtuals).toHaveLength(1); // shadow untouched
  });

  // T-313: expired PIN
  it("rejects an expired PIN with a clear message", async () => {
    const { pin } = await seedShadowWithDebt();
    const db = await getDb();
    const { bindingCodes } = await import("../../src/db/schema.js");
    await db
      .update(bindingCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(bindingCodes.code, pin));

    await sim.send(followEvent(FRIEND));
    sim.replies.length = 0;
    await sim.send(textEvent(FRIEND, pin));
    expect(messageText(lastReply()!.messages)).toContain("過期");
  });

  // T-314: self-claim rejected
  it("rejects the creator claiming their own code", async () => {
    const { pin } = await seedShadowWithDebt();
    sim.replies.length = 0;
    await sim.send(textEvent(OWNER, pin));
    expect(messageText(lastReply()!.messages)).toContain("不能自己認領");
  });

  // T-316: a valid PIN wins over an active need_amount draft
  it("PIN claim takes priority over the amount shortcut", async () => {
    const { pin } = await seedShadowWithDebt();
    await sim.send(followEvent(FRIEND));

    // Give the FRIEND an active need_amount pending.
    sim.provider.enqueue({
      type: "expense",
      is_complete: false,
      missing_fields: ["total_amount"],
      confidence: 0.6,
      data: { description: "午餐", total_amount: null, payment_method: "現金", category: "餐飲" },
    });
    await sim.send(textEvent(FRIEND, "今天吃了好多東西"));
    sim.replies.length = 0;

    await sim.send(textEvent(FRIEND, pin));
    // Claimed, NOT treated as the amount answer.
    expect(messageText(lastReply()!.messages)).toContain("認領歷史帳目");
  });
});
