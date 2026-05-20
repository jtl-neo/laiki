import { describe, expect, it } from "vitest";
import { ParseResultSchema } from "./parseTransaction.js";

describe("ParseResultSchema", () => {
  it("parses a valid result with defaults applied", () => {
    const parsed = ParseResultSchema.parse({ amount: 100, confidence: 0.9 });
    expect(parsed.amount).toBe(100);
    expect(parsed.kind).toBe("expense");
    expect(parsed.confidence).toBe(0.9);
  });

  it("accepts all optional fields populated", () => {
    const parsed = ParseResultSchema.parse({
      amount: 50,
      kind: "income",
      category: "薪水",
      account_hint: "玉山",
      group_hint: null,
      note: "月薪",
      tx_date: "2026-05-01",
      confidence: 0.95,
    });
    expect(parsed.kind).toBe("income");
    expect(parsed.tx_date).toBe("2026-05-01");
  });

  it("throws when amount is missing", () => {
    expect(() => ParseResultSchema.parse({ confidence: 0.5 })).toThrow();
  });

  it("throws when amount is negative", () => {
    expect(() => ParseResultSchema.parse({ amount: -10, confidence: 0.5 })).toThrow();
  });

  it("throws when kind is invalid", () => {
    expect(() =>
      ParseResultSchema.parse({ amount: 10, kind: "wat", confidence: 0.5 }),
    ).toThrow();
  });

  it("accepts tx_date null", () => {
    const parsed = ParseResultSchema.parse({
      amount: 10,
      confidence: 0.5,
      tx_date: null,
    });
    expect(parsed.tx_date).toBeNull();
  });
});
