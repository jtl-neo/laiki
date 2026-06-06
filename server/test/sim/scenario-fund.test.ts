import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { integrationAvailable } from "../setup.js";
import { getDb, seedFundGroup, seedShadow } from "../helpers.js";
import { setupSim, resetSim, type Sim } from "./harness.js";
import { textEvent, followEvent, postbackEvent } from "./events.js";
import { lastReply, messageText, pushes, pushTargets, quickReplyLabels } from "./fakeLine.js";

const ME = "U_scn_fund_me";
const C = "U_scn_fund_c";
const D = "U_scn_fund_d";

const fundParse = (fundName: string | null = "家裡用的東西") => ({
  type: "fund_expense",
  is_complete: fundName ? true : false,
  missing_fields: fundName ? [] : ["fund_name"],
  confidence: 0.93,
  data: {
    description: "衛生紙和洗衣精",
    total_amount: 450,
    payment_method: null,
    payer_id: "common_fund",
    my_share: null,
    debts: [],
    fund_name: fundName,
    category: "居家",
    tx_date: null,
  },
});

async function uid(lineUserId: string): Promise<string> {
  const db = await getDb();
  const { users } = await import("../../src/db/schema.js");
  const [u] = await db.select().from(users).where(eq(users.lineUserId, lineUserId));
  return u!.id;
}

function pendingIdFromReplies(): string {
  const m = /pendingId=([0-9a-f-]+)/.exec(JSON.stringify(lastReply()!.messages));
  if (!m) throw new Error("no pendingId in reply");
  return m[1]!;
}

describe.skipIf(!integrationAvailable)("scenario: 範例三 共同基金扣款", () => {
  let sim: Sim;

  beforeAll(async () => {
    sim = await setupSim();
  });

  beforeEach(async () => {
    await resetSim();
    await sim.send(followEvent(ME));
    await sim.send(followEvent(C));
    await sim.send(followEvent(D));
    sim.replies.length = 0;
    pushes.length = 0;
  });

  // T-321: deduct + push to all three bound members
  it("deducts the fund and pushes the change card to all members", async () => {
    const me = await uid(ME);
    const { fundAccountId } = await seedFundGroup(me, "家裡用的東西", 5000, [
      await uid(C),
      await uid(D),
    ]);

    sim.provider.enqueue(fundParse());
    await sim.send(textEvent(ME, "用共同基金買了家裡用的衛生紙和洗衣精 450 元"));
    const pendingId = pendingIdFromReplies();
    await sim.send(postbackEvent(ME, `action=confirm_entry&pendingId=${pendingId}`));

    const db = await getDb();
    const { accounts, transactions } = await import("../../src/db/schema.js");
    const [fund] = await db.select().from(accounts).where(eq(accounts.id, fundAccountId));
    expect(Number(fund!.balance)).toBe(4550);

    const txs = await db.select().from(transactions);
    expect(txs).toHaveLength(1);
    expect(txs[0]!.kind).toBe("fund_out");

    const targets = pushTargets();
    expect(targets.sort()).toEqual([ME, C, D].sort());
    const card = JSON.stringify(pushes[0]!.messages);
    expect(card).toContain("4,550");
    expect(card).toContain("家裡用的東西");
  });

  // T-322: shadow members are skipped in the fan-out
  it("skips shadow members in the push fan-out", async () => {
    const me = await uid(ME);
    const shadowE = await seedShadow(me, "e");
    await seedFundGroup(me, "家裡用的東西", 5000, [await uid(C), shadowE.id]);

    sim.provider.enqueue(fundParse());
    await sim.send(textEvent(ME, "用共同基金買衛生紙 450"));
    const pendingId = pendingIdFromReplies();
    await sim.send(postbackEvent(ME, `action=confirm_entry&pendingId=${pendingId}`));

    const targets = pushTargets();
    expect(targets.sort()).toEqual([ME, C].sort()); // no shadow push
  });

  // T-323: insufficient balance → warn but record (locked decision)
  it("records into a negative balance with a warning on the card", async () => {
    const me = await uid(ME);
    const { fundAccountId } = await seedFundGroup(me, "家裡用的東西", 100, [await uid(C)]);

    sim.provider.enqueue(fundParse());
    await sim.send(textEvent(ME, "用共同基金買衛生紙 450"));
    const pendingId = pendingIdFromReplies();
    await sim.send(postbackEvent(ME, `action=confirm_entry&pendingId=${pendingId}`));

    const db = await getDb();
    const { accounts, transactions } = await import("../../src/db/schema.js");
    const [fund] = await db.select().from(accounts).where(eq(accounts.id, fundAccountId));
    expect(Number(fund!.balance)).toBe(-350);
    expect(await db.select().from(transactions)).toHaveLength(1);

    const card = JSON.stringify(pushes[0]!.messages);
    expect(card).toContain("餘額不足");
  });

  // T-324: unmatched fund name → fund picker
  it("asks which fund when the name does not match", async () => {
    const me = await uid(ME);
    await seedFundGroup(me, "家裡用的東西", 5000, [await uid(C)]);
    await seedFundGroup(me, "出遊基金", 3000, [await uid(C)]);

    sim.provider.enqueue(fundParse("不存在的基金"));
    await sim.send(textEvent(ME, "用基金買東西 450"));

    const labels = quickReplyLabels();
    expect(labels.join("|")).toContain("家裡用的東西");
    expect(labels.join("|")).toContain("出遊基金");

    // Picking one resolves and reaches confirm.
    const pendingId = pendingIdFromReplies();
    const db = await getDb();
    const { groups } = await import("../../src/db/schema.js");
    const [fund] = await db.select().from(groups).where(eq(groups.name, "家裡用的東西"));
    sim.replies.length = 0;
    await sim.send(postbackEvent(ME, `action=pick_fund&pendingId=${pendingId}&groupId=${fund!.id}`));
    expect(messageText(lastReply()!.messages)).toContain("confirm_entry");
  });
});
