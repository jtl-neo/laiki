import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { webhook } from "@line/bot-sdk";
import { integrationAvailable } from "../setup.js";
import { setupSim, resetSim, type Sim } from "./harness.js";
import { followEvent, textEvent } from "./events.js";

const U = "U_group_silence";

function groupTextEvent(lineUserId: string, groupId: string, text: string): webhook.Event {
  return {
    type: "message",
    mode: "active",
    timestamp: Date.now(),
    source: { type: "group", groupId, userId: lineUserId },
    webhookEventId: "evt_g1",
    deliveryContext: { isRedelivery: false },
    replyToken: "reply_g1",
    message: { id: "m_g1", type: "text", text, quoteToken: "q_g1" },
  } as webhook.Event;
}

function joinEvent(groupId: string): webhook.Event {
  return {
    type: "join",
    mode: "active",
    timestamp: Date.now(),
    source: { type: "group", groupId },
    webhookEventId: "evt_g2",
    deliveryContext: { isRedelivery: false },
    replyToken: "reply_g2",
  } as webhook.Event;
}

describe.skipIf(!integrationAvailable)("1對1 only: group events are silent", () => {
  let sim: Sim;

  beforeAll(async () => {
    sim = await setupSim();
  });

  beforeEach(async () => {
    await resetSim();
    await sim.send(followEvent(U));
    sim.replies.length = 0;
  });

  it("never replies to group text, even when the bot is mentioned", async () => {
    await sim.send(groupTextEvent(U, "G_test", "@bot 午餐 500 平分"));
    expect(sim.replies).toHaveLength(0);
    expect(sim.provider.calls).toHaveLength(0); // no LLM either
  });

  it("never replies on join", async () => {
    await sim.send(joinEvent("G_test"));
    expect(sim.replies).toHaveLength(0);
  });

  it("DM flow keeps working", async () => {
    await sim.send(textEvent(U, "午餐 120 現金"));
    expect(sim.replies.length).toBeGreaterThan(0);
  });
});
