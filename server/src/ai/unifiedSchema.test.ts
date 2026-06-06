import { describe, expect, it } from "vitest";
import {
  UnifiedParseSchema,
  deriveMissingFields,
  validateSplitMath,
  toUnified,
  type UnifiedParse,
} from "./unifiedSchema.js";
import { parseSimpleText } from "./parseTransaction.js";

function makeParse(overrides: {
  type?: UnifiedParse["type"];
  is_complete?: boolean;
  missing_fields?: string[];
  confidence?: number;
  data?: Partial<UnifiedParse["data"]>;
}): UnifiedParse {
  return UnifiedParseSchema.parse({
    type: overrides.type ?? "expense",
    is_complete: overrides.is_complete ?? true,
    missing_fields: overrides.missing_fields ?? [],
    confidence: overrides.confidence ?? 0.9,
    data: {
      description: null,
      total_amount: 100,
      payment_method: "現金",
      payer_id: "me",
      my_share: null,
      debts: [],
      fund_name: null,
      category: null,
      tx_date: null,
      ...overrides.data,
    },
  });
}

describe("UnifiedParseSchema", () => {
  // T-101
  it("parses a valid expense with defaults applied", () => {
    const parsed = UnifiedParseSchema.parse({
      type: "expense",
      is_complete: true,
      data: { total_amount: 120, payment_method: "現金" },
    });
    expect(parsed.missing_fields).toEqual([]);
    expect(parsed.confidence).toBe(0.8);
    expect(parsed.data.debts).toEqual([]);
    expect(parsed.data.my_share).toBeNull();
  });

  // T-102
  it("parses a valid split_expense with debts and my_share", () => {
    const parsed = UnifiedParseSchema.parse({
      type: "split_expense",
      is_complete: false,
      missing_fields: ["payment_method"],
      data: {
        description: "麥當勞午餐",
        total_amount: 500,
        my_share: 120,
        debts: [
          { name: "a", amount: 180 },
          { name: "b", amount: 200 },
        ],
      },
    });
    expect(parsed.data.debts).toHaveLength(2);
    expect(parsed.data.debts[0]).toEqual({ name: "a", amount: 180 });
    expect(parsed.data.my_share).toBe(120);
  });

  // T-103
  it("parses a valid fund_expense with fund_name", () => {
    const parsed = UnifiedParseSchema.parse({
      type: "fund_expense",
      is_complete: true,
      data: { total_amount: 450, fund_name: "家裡用的東西", payer_id: "common_fund" },
    });
    expect(parsed.data.fund_name).toBe("家裡用的東西");
    expect(parsed.data.payer_id).toBe("common_fund");
  });

  // T-104
  it("rejects an unknown type", () => {
    expect(() =>
      UnifiedParseSchema.parse({ type: "loan", is_complete: true, data: {} }),
    ).toThrow();
  });

  // T-105
  it('normalizes "null" / empty strings in nullable fields to null', () => {
    const parsed = UnifiedParseSchema.parse({
      type: "expense",
      is_complete: false,
      data: { total_amount: 50, payment_method: "null", fund_name: "", category: "  " },
    });
    expect(parsed.data.payment_method).toBeNull();
    expect(parsed.data.fund_name).toBeNull();
    expect(parsed.data.category).toBeNull();
  });

  // T-106
  it("rejects out-of-range confidence", () => {
    expect(() =>
      UnifiedParseSchema.parse({
        type: "expense",
        is_complete: true,
        confidence: 1.5,
        data: { total_amount: 10 },
      }),
    ).toThrow();
    expect(() =>
      UnifiedParseSchema.parse({
        type: "expense",
        is_complete: true,
        confidence: -0.1,
        data: { total_amount: 10 },
      }),
    ).toThrow();
  });

  // T-107
  it("rejects non-numeric debt amounts", () => {
    expect(() =>
      UnifiedParseSchema.parse({
        type: "split_expense",
        is_complete: true,
        data: { total_amount: 500, debts: [{ name: "a", amount: "many" }] },
      }),
    ).toThrow();
  });

  // T-108
  it("coerces invalid tx_date formats to null", () => {
    const parsed = UnifiedParseSchema.parse({
      type: "expense",
      is_complete: true,
      data: { total_amount: 10, tx_date: "yesterday" },
    });
    expect(parsed.data.tx_date).toBeNull();
  });
});

describe("deriveMissingFields", () => {
  // T-111
  it("flags missing total_amount on expense", () => {
    const p = makeParse({ data: { total_amount: null } });
    expect(deriveMissingFields(p)).toContain("total_amount");
  });

  // T-112
  it("flags missing payment_method on expense", () => {
    const p = makeParse({ data: { payment_method: null } });
    expect(deriveMissingFields(p)).toEqual(["payment_method"]);
  });

  // T-113
  it("flags missing debt_distribution on split_expense with no debts", () => {
    const p = makeParse({ type: "split_expense", data: { debts: [] } });
    expect(deriveMissingFields(p)).toContain("debt_distribution");
  });

  // T-114
  it("returns empty for a complete split_expense", () => {
    const p = makeParse({
      type: "split_expense",
      data: {
        total_amount: 500,
        payment_method: "富邦卡",
        my_share: 120,
        debts: [
          { name: "a", amount: 180 },
          { name: "b", amount: 200 },
        ],
      },
    });
    expect(deriveMissingFields(p)).toEqual([]);
  });

  // T-115
  it("flags missing fund_name on fund_expense", () => {
    const p = makeParse({ type: "fund_expense", data: { fund_name: null } });
    expect(deriveMissingFields(p)).toContain("fund_name");
  });

  // T-116
  it("does not require payment_method for fund_expense", () => {
    const p = makeParse({
      type: "fund_expense",
      data: { fund_name: "家裡用的東西", payment_method: null },
    });
    expect(deriveMissingFields(p)).not.toContain("payment_method");
  });

  // T-117: backend overrides an over-confident LLM
  it("still flags fields when LLM claims is_complete=true", () => {
    const p = makeParse({ is_complete: true, data: { total_amount: null } });
    expect(deriveMissingFields(p)).toContain("total_amount");
  });

  // T-118: backend overrides an under-confident LLM
  it("returns empty when all fields present despite is_complete=false", () => {
    const p = makeParse({
      is_complete: false,
      missing_fields: ["total_amount"],
      data: { total_amount: 100, payment_method: "現金" },
    });
    expect(deriveMissingFields(p)).toEqual([]);
  });
});

describe("validateSplitMath", () => {
  // T-121
  it("accepts a consistent split (500 = 120 + 180 + 200)", () => {
    const p = makeParse({
      type: "split_expense",
      data: {
        total_amount: 500,
        my_share: 120,
        debts: [
          { name: "a", amount: 180 },
          { name: "b", amount: 200 },
        ],
      },
    });
    const r = validateSplitMath(p);
    expect(r.valid).toBe(true);
    expect(r.myShare).toBe(120);
  });

  // T-122
  it("auto-fills my_share = total - sum(debts) when null", () => {
    const p = makeParse({
      type: "split_expense",
      data: {
        total_amount: 500,
        my_share: null,
        debts: [
          { name: "a", amount: 180 },
          { name: "b", amount: 200 },
        ],
      },
    });
    const r = validateSplitMath(p);
    expect(r.valid).toBe(true);
    expect(r.myShare).toBe(120);
  });

  // T-123
  it("rejects a mismatched sum and flags debt_distribution", () => {
    const p = makeParse({
      type: "split_expense",
      data: {
        total_amount: 500,
        my_share: 100,
        debts: [
          { name: "a", amount: 180 },
          { name: "b", amount: 200 },
        ],
      },
    });
    const r = validateSplitMath(p);
    expect(r.valid).toBe(false);
    expect(r.missing).toContain("debt_distribution");
  });

  // T-124
  it("rejects when auto-filled my_share is negative", () => {
    const p = makeParse({
      type: "split_expense",
      data: {
        total_amount: 300,
        my_share: null,
        debts: [
          { name: "a", amount: 180 },
          { name: "b", amount: 200 },
        ],
      },
    });
    const r = validateSplitMath(p);
    expect(r.valid).toBe(false);
  });

  // T-125
  it("tolerates float drift within ±0.01", () => {
    const p = makeParse({
      type: "split_expense",
      data: {
        total_amount: 100,
        my_share: 33.33,
        debts: [
          { name: "a", amount: 33.33 },
          { name: "b", amount: 33.34 },
        ],
      },
    });
    expect(validateSplitMath(p).valid).toBe(true);
  });

  // T-126: duplicate names merge by summing
  it("merges duplicate debt names by summing amounts", () => {
    const p = makeParse({
      type: "split_expense",
      data: {
        total_amount: 500,
        my_share: 120,
        debts: [
          { name: "a", amount: 100 },
          { name: "a", amount: 80 },
          { name: "b", amount: 200 },
        ],
      },
    });
    const r = validateSplitMath(p);
    expect(r.valid).toBe(true);
    expect(r.debts).toEqual([
      { name: "a", amount: 180 },
      { name: "b", amount: 200 },
    ]);
  });

  it("treats non-split types as valid passthrough", () => {
    const p = makeParse({ type: "expense" });
    expect(validateSplitMath(p).valid).toBe(true);
  });
});

describe("toUnified", () => {
  // T-132
  it("maps a parseSimpleText result into a unified expense", () => {
    const simple = parseSimpleText("今天吃午餐200 現金", new Date("2026-06-02T12:00:00.000Z"));
    expect(simple).not.toBeNull();
    const unified = toUnified(simple!);
    expect(unified.type).toBe("expense");
    expect(unified.data.total_amount).toBe(200);
    expect(unified.data.payment_method).toBe("現金");
    expect(unified.data.category).toBe("餐飲");
    expect(unified.data.tx_date).toBe("2026-06-02");
    expect(unified.data.payer_id).toBe("me");
    expect(unified.confidence).toBe(0.92);
    expect(unified.is_complete).toBe(true);
    expect(unified.missing_fields).toEqual([]);
  });

  it("maps income kind and computes missing payment_method", () => {
    const simple = parseSimpleText("收到薪水 50000");
    expect(simple).not.toBeNull();
    const unified = toUnified(simple!);
    expect(unified.type).toBe("income");
    expect(unified.is_complete).toBe(false);
    expect(unified.missing_fields).toContain("payment_method");
  });
});
