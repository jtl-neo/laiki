import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, isNotNull } from "drizzle-orm";
import { integrationAvailable } from "../setup.js";
import { getDb } from "../helpers.js";
import { setupSim, resetSim, type Sim } from "./harness.js";
import { textEvent, followEvent, imageEvent, postbackEvent } from "./events.js";
import { lastReply, messageText, quickReplyPostbackData } from "./fakeLine.js";

const U = "U_pipeline";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const validExpense = {
  type: "expense",
  is_complete: true,
  confidence: 0.85,
  data: { description: "全聯採買", total_amount: 320, payment_method: null, category: "購物" },
};

describe.skipIf(!integrationAvailable)("unified pipeline", () => {
  let sim: Sim;

  beforeAll(async () => {
    sim = await setupSim();
  });

  beforeEach(async () => {
    await resetSim();
    await sim.send(followEvent(U));
    sim.replies.length = 0;
  });

  // T-351: receipt images share the unified pipeline
  it("recognizes an image through parseUnified", async () => {
    sim.provider.enqueue(validExpense);
    await sim.send(imageEvent(U));
    await sleep(1800); // image batches debounce for 1.5s

    const call = sim.provider.lastCall!;
    expect(call.images).toHaveLength(1);
    expect(call.systemPrompt).toContain("統一發票");

    const db = await getDb();
    const { transactions } = await import("../../src/db/schema.js");
    const txs = await db.select().from(transactions).where(eq(transactions.source, "line_image"));
    expect(txs).toHaveLength(1);
    expect(Number(txs[0]!.amount)).toBe(320);
  });

  // T-352: invalid first output → silent retry succeeds
  it("retries once on invalid LLM output without user impact", async () => {
    sim.provider.enqueue({ garbage: true }, {
      type: "split_expense",
      is_complete: true,
      confidence: 0.9,
      data: {
        total_amount: 500,
        payment_method: "現金",
        category: "餐飲",
        my_share: 120,
        debts: [
          { name: "a", amount: 180 },
          { name: "b", amount: 200 },
        ],
      },
    });
    await sim.send(textEvent(U, "和a和b吃麥當勞我先出 現金 共500 a180 b200"));
    expect(sim.provider.calls).toHaveLength(2);
    expect(messageText(lastReply()!.messages)).toContain("confirm_entry");
  });

  // T-353: both attempts fail → friendly error + ai_records.errorMessage
  it("degrades gracefully and records the error after two failures", async () => {
    sim.provider.enqueue({ garbage: true }, new Error("bad json"));
    await sim.send(textEvent(U, "和a和b吃麥當勞我先出 共500"));

    expect(messageText(lastReply()!.messages)).toMatch(/看不懂|忙線/);

    const db = await getDb();
    const { aiRecords } = await import("../../src/db/schema.js");
    const errored = await db
      .select()
      .from(aiRecords)
      .where(isNotNull(aiRecords.errorMessage));
    expect(errored.length).toBeGreaterThan(0);
  });

  // T-354: ai_records linked to the committed transaction
  it("backfills ai_records.transactionId on commit", async () => {
    sim.provider.enqueue({
      type: "split_expense",
      is_complete: true,
      confidence: 0.9,
      data: {
        total_amount: 500,
        payment_method: "現金",
        my_share: 120,
        debts: [
          { name: "a", amount: 180 },
          { name: "b", amount: 200 },
        ],
      },
    });
    await sim.send(textEvent(U, "和a和b吃麥當勞我先出 現金 共500 a180 b200"));
    const pendingId = /pendingId=([0-9a-f-]+)/.exec(
      quickReplyPostbackData().join("|") + messageText(lastReply()!.messages),
    )?.[1];
    expect(pendingId).toBeTruthy();

    await sim.send(postbackEvent(U, `action=confirm_entry&pendingId=${pendingId}`));

    const db = await getDb();
    const { aiRecords } = await import("../../src/db/schema.js");
    const linked = await db
      .select()
      .from(aiRecords)
      .where(isNotNull(aiRecords.transactionId));
    expect(linked).toHaveLength(1);
  });
});
