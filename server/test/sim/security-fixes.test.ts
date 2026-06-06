import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { integrationAvailable } from "../setup.js";
import { getDb, seedAccount, seedFundGroup, seedShadow } from "../helpers.js";
import { setupSim, resetSim, type Sim } from "./harness.js";
import { textEvent, followEvent, postbackEvent } from "./events.js";
import { lastReply, messageText } from "./fakeLine.js";

const OWNER = "U_sec_owner";
const ATTACKER = "U_sec_attacker";

async function uid(lineUserId: string): Promise<string> {
  const db = await getDb();
  const { users } = await import("../../src/db/schema.js");
  const [u] = await db.select().from(users).where(eq(users.lineUserId, lineUserId));
  return u!.id;
}

const splitParse = {
  type: "split_expense",
  is_complete: true,
  confidence: 0.9,
  data: {
    description: "麥當勞",
    total_amount: 500,
    payment_method: "現金",
    category: "餐飲",
    my_share: 120,
    debts: [
      { name: "a", amount: 180 },
      { name: "b", amount: 200 },
    ],
  },
};

describe.skipIf(!integrationAvailable)("security/integrity fixes", () => {
  let sim: Sim;

  beforeAll(async () => {
    sim = await setupSim();
  });

  beforeEach(async () => {
    await resetSim();
    await sim.send(followEvent(OWNER));
    await sim.send(followEvent(ATTACKER));
    sim.replies.length = 0;
  });

  it("rejects LLM output with negative debt amounts (schema)", async () => {
    const { UnifiedParseSchema } = await import("../../src/ai/unifiedSchema.js");
    expect(() =>
      UnifiedParseSchema.parse({
        type: "split_expense",
        is_complete: true,
        data: { total_amount: 500, debts: [{ name: "a", amount: -180 }] },
      }),
    ).toThrow();
  });

  it("commitPending aborts on corrupt debt amounts instead of writing splits", async () => {
    const { upsertPending, commitPending } = await import("../../src/lib/pendingEntry.js");
    const ownerId = await uid(OWNER);
    const account = await seedAccount(ownerId, "Cash", 1000);
    const { seedGroup } = await import("../helpers.js");
    const group = await seedGroup(ownerId);
    const shadow = await seedShadow(ownerId, "a");

    const pending = await upsertPending({
      userId: ownerId,
      groupId: group.id,
      lineGroupId: null,
      mode: "group_split",
      step: "confirm",
      draft: {
        amount: 500,
        kind: "expense",
        category: "餐飲",
        accountId: account.id,
        accountHint: null,
        note: null,
        txDate: null,
        participantUserIds: [ownerId, shadow.id],
        confidence: 0.9,
        participantsConfirmed: true,
        categoryResolved: true,
        debts: [{ userId: shadow.id, amount: -180 }], // corrupt
      },
    });
    const result = await commitPending(pending.id);
    expect("error" in result).toBe(true);

    const db = await getDb();
    const { transactions, transactionSplits } = await import("../../src/db/schema.js");
    expect(await db.select().from(transactions)).toHaveLength(0);
    expect(await db.select().from(transactionSplits)).toHaveLength(0);
  });

  it("blocks another user from mutating a DM pending", async () => {
    const ownerId = await uid(OWNER);
    await seedAccount(ownerId, "現金", 0);
    sim.provider.enqueue(splitParse);
    await sim.send(textEvent(OWNER, "和a和b吃麥當勞我先出 現金 a180 b200 共500"));
    const pendingId = /pendingId=([0-9a-f-]+)/.exec(
      JSON.stringify(lastReply()!.messages),
    )?.[1];
    expect(pendingId).toBeTruthy();

    sim.replies.length = 0;
    await sim.send(postbackEvent(ATTACKER, `action=confirm_entry&pendingId=${pendingId}`));
    expect(messageText(lastReply()!.messages)).toContain("不是你的");

    const db = await getDb();
    const { transactions } = await import("../../src/db/schema.js");
    expect(await db.select().from(transactions)).toHaveLength(0);
  });

  it("rejects pick_fund for a fund the owner does not belong to", async () => {
    const ownerId = await uid(OWNER);
    const attackerId = await uid(ATTACKER);
    // Fund belongs to the ATTACKER only.
    const foreign = await seedFundGroup(attackerId, "別人的基金", 9999);

    sim.provider.enqueue({
      type: "fund_expense",
      is_complete: false,
      missing_fields: ["fund_name"],
      confidence: 0.9,
      data: { description: "東西", total_amount: 450, fund_name: null },
    });
    // Owner needs at least one fund so need_fund renders a picker.
    await seedFundGroup(ownerId, "我的基金", 1000);
    await sim.send(textEvent(OWNER, "用基金買東西 450"));
    const pendingId = /pendingId=([0-9a-f-]+)/.exec(
      JSON.stringify(lastReply()!.messages),
    )?.[1];
    expect(pendingId).toBeTruthy();

    sim.replies.length = 0;
    await sim.send(
      postbackEvent(OWNER, `action=pick_fund&pendingId=${pendingId}&groupId=${foreign.groupId}`),
    );
    expect(messageText(lastReply()!.messages)).toContain("基金無效");
  });

  it("regenerating a PIN invalidates the previous one", async () => {
    const { generateBindingCode, claimBindingCode } = await import(
      "../../src/lib/shadowAccount.js"
    );
    const ownerId = await uid(OWNER);
    const shadow = await seedShadow(ownerId, "a");

    const first = await generateBindingCode(shadow.id, ownerId);
    const second = await generateBindingCode(shadow.id, ownerId);
    expect(first).not.toBe(second);

    expect(await claimBindingCode(first, "U_sec_new", "x")).toMatchObject({
      ok: false,
      error: "not_found",
    });
    expect(await claimBindingCode(second, "U_sec_new", "x")).toMatchObject({ ok: true });
  });
});
