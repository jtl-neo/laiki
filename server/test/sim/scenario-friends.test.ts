import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { integrationAvailable } from "../setup.js";
import { getDb, seedAccount, seedGroup, seedShadow } from "../helpers.js";
import { setupSim, resetSim, type Sim } from "./harness.js";
import { textEvent, followEvent, postbackEvent } from "./events.js";
import { lastReply, messageText } from "./fakeLine.js";

const OWNER = "U_scn_friends";
const FRIEND = "U_scn_friends_claimer";

async function ownerId(): Promise<string> {
  const db = await getDb();
  const { users } = await import("../../src/db/schema.js");
  const [u] = await db.select().from(users).where(eq(users.lineUserId, OWNER));
  return u!.id;
}

async function seedShadowWithDebt(name: string, amount: number): Promise<string> {
  const uid = await ownerId();
  const db = await getDb();
  const { transactions, debts } = await import("../../src/db/schema.js");
  const shadow = await seedShadow(uid, name);
  const account = await seedAccount(uid, `Cash-${name}`, 1000);
  const group = await seedGroup(uid, `G-${name}`);
  const [tx] = await db
    .insert(transactions)
    .values({
      groupId: group.id,
      accountId: account.id,
      amount: amount.toFixed(2),
      txDate: "2026-06-05",
      paidByUserId: uid,
      kind: "expense",
    })
    .returning();
  await db.insert(debts).values({
    transactionId: tx!.id,
    creditorId: uid,
    debtorId: shadow.id,
    amount: amount.toFixed(2),
  });
  return shadow.id;
}

describe.skipIf(!integrationAvailable)("scenario: 管理好友 → 產生綁定碼", () => {
  let sim: Sim;

  beforeAll(async () => {
    sim = await setupSim();
  });

  beforeEach(async () => {
    await resetSim();
    await sim.send(followEvent(OWNER));
    sim.replies.length = 0;
  });

  it("lists shadow friends with outstanding amounts", async () => {
    await seedShadowWithDebt("a", 180);
    await seedShadowWithDebt("老王", 320);

    await sim.send(textEvent(OWNER, "管理好友"));
    const reply = messageText(lastReply()!.messages);
    expect(reply).toContain("a");
    expect(reply).toContain("老王");
    expect(reply).toContain("180");
    expect(reply).toContain("320");
    expect(reply).toContain("friend_pin");
  });

  it("tells a user with no friends what to do", async () => {
    await sim.send(textEvent(OWNER, "好友"));
    expect(messageText(lastReply()!.messages)).toContain("還沒有");
  });

  it("generates a PIN that the friend can actually claim", async () => {
    const shadowId = await seedShadowWithDebt("a", 180);

    // Owner taps 產生綁定碼 for shadow a.
    sim.replies.length = 0;
    await sim.send(postbackEvent(OWNER, `action=friend_pin&friendId=${shadowId}`));
    const reply = messageText(lastReply()!.messages);
    const pin = /(\d{6})/.exec(reply)?.[1];
    expect(pin).toBeTruthy();
    expect(reply).toContain("綁定碼");

    // Friend claims it end-to-end.
    await sim.send(followEvent(FRIEND));
    sim.replies.length = 0;
    await sim.send(textEvent(FRIEND, pin!));
    expect(messageText(lastReply()!.messages)).toContain("認領歷史帳目");
  });

  it("rejects generating a PIN for someone else's shadow", async () => {
    const db = await getDb();
    const { users } = await import("../../src/db/schema.js");
    const [stranger] = await db
      .insert(users)
      .values({ lineUserId: "U_stranger_owner", displayName: "S" })
      .returning();
    const otherShadow = await seedShadow(stranger!.id, "x");

    sim.replies.length = 0;
    await sim.send(postbackEvent(OWNER, `action=friend_pin&friendId=${otherShadow.id}`));
    expect(messageText(lastReply()!.messages)).not.toMatch(/\d{6}/);
  });

  it("already-bound friends show as 已綁定 without a PIN button", async () => {
    const uid = await ownerId();
    const db = await getDb();
    const { users } = await import("../../src/db/schema.js");
    await db.insert(users).values({
      lineUserId: "U_bound_friend",
      displayName: "小美",
      isVirtual: false,
      createdBy: uid,
    });

    await sim.send(textEvent(OWNER, "管理好友"));
    const reply = messageText(lastReply()!.messages);
    expect(reply).toContain("小美");
    expect(reply).toContain("已綁定");
    expect(reply).not.toContain("friend_pin");
  });
});
