import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { integrationAvailable } from "../setup.js";
import { setupSim, resetSim, type Sim } from "./harness.js";
import { textEvent, followEvent } from "./events.js";

describe.skipIf(!integrationAvailable)("sim harness smoke", () => {
  let sim: Sim;

  beforeAll(async () => {
    sim = await setupSim();
  });

  beforeEach(async () => {
    await resetSim();
  });

  it("captures the onboarding reply on follow", async () => {
    await sim.send(followEvent("U_smoke_1"));
    expect(sim.replies.length).toBeGreaterThan(0);
  });

  // T-362 seed: personal DM fast-path entry must not call the LLM.
  it("handles a simple DM expense without any LLM call", async () => {
    await sim.send(followEvent("U_smoke_2"));
    sim.replies.length = 0;

    await sim.send(textEvent("U_smoke_2", "今天吃午餐200"));
    expect(sim.provider.calls).toHaveLength(0); // fast path only
    expect(sim.replies.length).toBeGreaterThan(0);
  });

  it("throws loudly when an unexpected LLM call happens", async () => {
    await sim.send(followEvent("U_smoke_3"));
    sim.replies.length = 0;

    // Ambiguous text forces the LLM path; the queue is empty on purpose.
    await sim.send(textEvent("U_smoke_3", "午餐200晚餐300"));
    expect(sim.provider.calls.length).toBeGreaterThan(0);
    // Handler must degrade gracefully (an error/fallback reply, no crash).
    expect(sim.replies.length).toBeGreaterThan(0);
  });
});
