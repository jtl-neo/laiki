import { describe, expect, it } from "vitest";
import { minTransfers } from "./settle.js";

describe("minTransfers", () => {
  it("returns [] for empty balances", () => {
    expect(minTransfers([])).toEqual([]);
  });

  it("settles a simple 2-user balance with a single transfer", () => {
    const result = minTransfers([
      { userId: "A", net: 100 },
      { userId: "B", net: -100 },
    ]);
    expect(result).toEqual([{ from: "B", to: "A", amount: 100 }]);
  });

  it("settles 3 users with uneven balances using 2 transfers", () => {
    const result = minTransfers([
      { userId: "A", net: 60 },
      { userId: "B", net: -20 },
      { userId: "C", net: -40 },
    ]);
    expect(result).toHaveLength(2);
    // Sum of transfers to A equals 60.
    const toA = result.filter((t) => t.to === "A").reduce((s, t) => s + t.amount, 0);
    expect(toA).toBe(60);
    // All amounts are positive.
    for (const t of result) expect(t.amount).toBeGreaterThan(0);
  });

  it("skips noise within epsilon tolerance", () => {
    const result = minTransfers([
      { userId: "A", net: 0.001 },
      { userId: "B", net: -0.001 },
    ]);
    expect(result).toEqual([]);
  });

  it("returns rounded (2-decimal) amounts only", () => {
    const result = minTransfers([
      { userId: "A", net: 33.333 },
      { userId: "B", net: -33.333 },
    ]);
    for (const t of result) {
      expect(Math.round(t.amount * 100) / 100).toBe(t.amount);
    }
  });
});
