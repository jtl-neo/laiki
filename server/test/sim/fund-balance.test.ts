import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { integrationAvailable } from "../setup.js";
import { getDb, seedFundGroup } from "../helpers.js";
import { setupSim, resetSim, type Sim } from "./harness.js";
import { textEvent, followEvent, postbackEvent } from "./events.js";
import { lastReply, messageText, pushTargets } from "./fakeLine.js";

const ME = "U_fundbal_me";
const C = "U_fundbal_c";

async function uid(lineUserId: string): Promise<string> {
  const db = await getDb();
  const { users } = await import("../../src/db/schema.js");
  const [u] = await db.select().from(users).where(eq(users.lineUserId, lineUserId));
  return u!.id;
}

describe.skipIf(!integrationAvailable)("fund routing + balance intents (吞金獸)", () => {
  let sim: Sim;

  beforeAll(async () => {
    sim = await setupSim();
  });

  beforeEach(async () => {
    await resetSim();
    await sim.send(followEvent(ME));
    await sim.send(followEvent(C));
    sim.replies.length = 0;
    sim.pushes.length = 0;
  });

  // The original bug:「吞金獸消費4500」landed in personal expenses.
  it("routes a fund-name expense through the LLM to fund_expense", async () => {
    const me = await uid(ME);
    const { fundAccountId } = await seedFundGroup(me, "吞金獸", 10000, [await uid(C)]);

    sim.provider.enqueue({
      type: "fund_expense",
      is_complete: true,
      confidence: 0.92,
      data: { description: "消費", total_amount: 4500, fund_name: "吞金獸" },
    });
    await sim.send(textEvent(ME, "吞金獸消費4500"));
    // Fast path must NOT swallow it: the provider was called.
    expect(sim.provider.calls).toHaveLength(1);

    const pendingId = /pendingId=([0-9a-f-]+)/.exec(messageText(lastReply()!.messages))?.[1];
    expect(pendingId).toBeTruthy();
    await sim.send(postbackEvent(ME, `action=confirm_entry&pendingId=${pendingId}`));

    const db = await getDb();
    const { accounts, transactions } = await import("../../src/db/schema.js");
    const [fund] = await db.select().from(accounts).where(eq(accounts.id, fundAccountId));
    expect(Number(fund!.balance)).toBe(5500);
    const txs = await db.select().from(transactions);
    expect(txs).toHaveLength(1);
    expect(txs[0]!.kind).toBe("fund_out");
  });

  it("answers a balance query without recording anything", async () => {
    const me = await uid(ME);
    await seedFundGroup(me, "吞金獸", 10000, []);

    await sim.send(textEvent(ME, "吞金獸目前餘額多少"));
    expect(sim.provider.calls).toHaveLength(0); // command path, no LLM
    expect(messageText(lastReply()!.messages)).toContain("10,000");

    const db = await getDb();
    const { transactions, pendingEntries } = await import("../../src/db/schema.js");
    expect(await db.select().from(transactions)).toHaveLength(0);
    expect(await db.select().from(pendingEntries)).toHaveLength(0);
  });

  it("owner sets the balance (negative allowed) via adjustment tx + push", async () => {
    const me = await uid(ME);
    const { fundAccountId } = await seedFundGroup(me, "吞金獸", 10000, [await uid(C)]);

    await sim.send(textEvent(ME, "吞金獸要更新餘額為-38867"));
    expect(sim.provider.calls).toHaveLength(0);
    expect(messageText(lastReply()!.messages)).toContain("校正");

    const db = await getDb();
    const { accounts, transactions } = await import("../../src/db/schema.js");
    const [fund] = await db.select().from(accounts).where(eq(accounts.id, fundAccountId));
    expect(Number(fund!.balance)).toBe(-38867);

    const txs = await db.select().from(transactions);
    expect(txs).toHaveLength(1);
    expect(txs[0]!.kind).toBe("fund_out");
    expect(Number(txs[0]!.amount)).toBe(48867); // 10000 → -38867
    expect(txs[0]!.category).toBe("餘額校正");

    expect(pushTargets().sort()).toEqual([ME, C].sort());
  });

  it("non-owner cannot adjust the balance", async () => {
    const me = await uid(ME);
    const cId = await uid(C);
    const { fundAccountId } = await seedFundGroup(me, "吞金獸", 10000, [cId]);

    sim.replies.length = 0;
    await sim.send(textEvent(C, "吞金獸餘額改成0"));
    expect(messageText(lastReply()!.messages)).toContain("擁有者");

    const db = await getDb();
    const { accounts } = await import("../../src/db/schema.js");
    const [fund] = await db.select().from(accounts).where(eq(accounts.id, fundAccountId));
    expect(Number(fund!.balance)).toBe(10000);
  });

  it("plain 餘額 still hits the legacy personal balance card", async () => {
    const me = await uid(ME);
    await seedFundGroup(me, "吞金獸", 10000, []);
    sim.replies.length = 0;
    await sim.send(textEvent(ME, "餘額"));
    expect(sim.provider.calls).toHaveLength(0);
    expect(sim.replies.length).toBeGreaterThan(0);
    expect(messageText(lastReply()!.messages)).not.toContain("吞金獸");
  });
});
