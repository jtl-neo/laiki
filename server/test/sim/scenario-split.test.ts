import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { integrationAvailable } from "../setup.js";
import { getDb, seedAccount } from "../helpers.js";
import { setupSim, resetSim, type Sim } from "./harness.js";
import { textEvent, followEvent, postbackEvent } from "./events.js";
import { lastReply, messageText, flexAltTexts } from "./fakeLine.js";

const U = "U_scn_split";

const mcdonalds = (overrides: { payment?: string | null } = {}) => ({
  type: "split_expense",
  is_complete: overrides.payment ? true : false,
  missing_fields: overrides.payment ? [] : ["payment_method"],
  confidence: 0.92,
  data: {
    description: "麥當勞午餐",
    total_amount: 500,
    payment_method: overrides.payment ?? null,
    payer_id: "me",
    my_share: 120,
    debts: [
      { name: "a", amount: 180 },
      { name: "b", amount: 200 },
    ],
    fund_name: null,
    category: "餐飲",
    tx_date: null,
  },
});

async function myUserId(): Promise<string> {
  const db = await getDb();
  const { users } = await import("../../src/db/schema.js");
  const [u] = await db.select().from(users).where(eq(users.lineUserId, U));
  return u!.id;
}

function pendingIdFromReplies(): string {
  const all = JSON.stringify(lastReply()!.messages);
  const m = /pendingId=([0-9a-f-]+)/.exec(all);
  if (!m) throw new Error("no pendingId in reply");
  return m[1]!;
}

describe.skipIf(!integrationAvailable)("scenario: 範例一 複雜多人分帳", () => {
  let sim: Sim;

  beforeAll(async () => {
    sim = await setupSim();
  });

  beforeEach(async () => {
    await resetSim();
    await sim.send(followEvent(U));
    sim.replies.length = 0;
  });

  // T-301 + T-302: full happy path
  it("creates shadows, debts and the split-success card", async () => {
    const uid = await myUserId();
    const fubon = await seedAccount(uid, "富邦卡", 0);

    // 1. Split text with no payment method → bot asks for the account.
    sim.provider.enqueue(mcdonalds());
    await sim.send(textEvent(U, "今天午餐和a和b吃麥當勞，我先出錢，a吃180 b吃200 總共500"));
    expect(messageText(lastReply()!.messages)).toContain("pick_account");
    const pendingId = pendingIdFromReplies();

    // 2. Pick 富邦卡 → confirm card with per-person amounts.
    sim.replies.length = 0;
    await sim.send(postbackEvent(U, `action=pick_account&pendingId=${pendingId}&accountId=${fubon.id}`));
    const confirmJson = messageText(lastReply()!.messages);
    expect(confirmJson).toContain("confirm_entry");
    expect(confirmJson).toContain("180");
    expect(confirmJson).toContain("200");

    // 3. Confirm → DB state + Bento card.
    sim.replies.length = 0;
    await sim.send(postbackEvent(U, `action=confirm_entry&pendingId=${pendingId}`));

    const db = await getDb();
    const { users, debts, transactions, accounts } = await import("../../src/db/schema.js");
    const shadows = await db.select().from(users).where(eq(users.isVirtual, true));
    expect(shadows.map((s) => s.displayName).sort()).toEqual(["a", "b"]);
    expect(shadows.every((s) => s.createdBy === uid && s.lineUserId === null)).toBe(true);

    const debtRows = await db.select().from(debts).where(eq(debts.creditorId, uid));
    expect(debtRows).toHaveLength(2);
    expect(debtRows.map((d) => Number(d.amount)).sort()).toEqual([180, 200]);
    expect(debtRows.every((d) => d.status === "PENDING")).toBe(true);

    const txs = await db.select().from(transactions);
    expect(txs).toHaveLength(1);
    expect(Number(txs[0]!.amount)).toBe(500);
    expect(txs[0]!.accountId).toBe(fubon.id);

    const [acct] = await db.select().from(accounts).where(eq(accounts.id, fubon.id));
    expect(Number(acct!.balance)).toBe(-500); // expense debits the card

    expect(flexAltTexts().join("|")).toContain("分帳成功");
    expect(messageText(lastReply()!.messages)).toContain("未綁定");
  });

  // T-303: an already-bound friend is reused, no duplicate shadow
  it("reuses a bound friend named a and only creates shadow b", async () => {
    const uid = await myUserId();
    await seedAccount(uid, "富邦卡", 0);
    const db = await getDb();
    const { users, debts } = await import("../../src/db/schema.js");
    const [friendA] = await db
      .insert(users)
      .values({ lineUserId: "U_real_friend_a", displayName: "a", isVirtual: false, createdBy: uid })
      .returning();

    sim.provider.enqueue(mcdonalds({ payment: "富邦卡" }));
    await sim.send(textEvent(U, "和a和b吃麥當勞我先出 富邦卡 a180 b200 共500"));
    const pendingId = pendingIdFromReplies();
    await sim.send(postbackEvent(U, `action=confirm_entry&pendingId=${pendingId}`));

    const virtuals = await db.select().from(users).where(eq(users.isVirtual, true));
    expect(virtuals.map((v) => v.displayName)).toEqual(["b"]);

    const aDebts = await db.select().from(debts).where(eq(debts.debtorId, friendA!.id));
    expect(aDebts).toHaveLength(1);
    expect(Number(aDebts[0]!.amount)).toBe(180);
  });

  // T-304: bad math → re-ask, nothing committed
  it("asks again instead of committing when the math is wrong", async () => {
    const uid = await myUserId();
    await seedAccount(uid, "富邦卡", 0);
    sim.provider.enqueue({
      ...mcdonalds({ payment: "富邦卡" }),
      data: { ...mcdonalds({ payment: "富邦卡" }).data, my_share: 100 }, // 100+180+200 ≠ 500
    });
    await sim.send(textEvent(U, "和a和b吃麥當勞我先出 富邦卡 共500"));
    expect(messageText(lastReply()!.messages)).toContain("分帳金額對不上");

    const db = await getDb();
    const { transactions } = await import("../../src/db/schema.js");
    expect(await db.select().from(transactions)).toHaveLength(0);
  });

  // T-305: cancel leaves zero residue
  it("cancel mid-flow leaves no shadows, debts or transactions", async () => {
    const uid = await myUserId();
    await seedAccount(uid, "富邦卡", 0);
    sim.provider.enqueue(mcdonalds());
    await sim.send(textEvent(U, "和a和b吃麥當勞我先出 a180 b200 共500"));
    const pendingId = pendingIdFromReplies();

    await sim.send(postbackEvent(U, `action=cancel_entry&pendingId=${pendingId}`));

    const db = await getDb();
    const { users, debts, transactions, pendingEntries } = await import("../../src/db/schema.js");
    expect(await db.select().from(users).where(eq(users.isVirtual, true))).toHaveLength(0);
    expect(await db.select().from(debts)).toHaveLength(0);
    expect(await db.select().from(transactions)).toHaveLength(0);
    expect(await db.select().from(pendingEntries)).toHaveLength(0);
  });
});
