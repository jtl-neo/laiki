import { describe, expect, it } from "vitest";
import type { AIProvider, ModelInfo, ParseStructuredArgs } from "./providers/types.js";
import { ParseResultSchema, parseSimpleText, parseText } from "./parseTransaction.js";

const throwingProvider: AIProvider = {
  async parseStructured(): Promise<never> {
    throw new Error("provider should not be called");
  },
  async verify(): Promise<boolean> {
    return false;
  },
  async listModels(): Promise<ModelInfo[]> {
    return [];
  },
};

function providerReturning(output: unknown): AIProvider {
  return {
    async parseStructured<T>(_args: ParseStructuredArgs): Promise<T> {
      return output as T;
    },
    async verify(): Promise<boolean> {
      return true;
    },
    async listModels(): Promise<ModelInfo[]> {
      return [];
    },
  };
}

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

describe("parseSimpleText", () => {
  it("parses amount attached to a Chinese lunch note", () => {
    const parsed = parseSimpleText("今天吃午餐200", new Date("2026-06-02T12:00:00.000Z"));
    expect(parsed).toMatchObject({
      amount: 200,
      kind: "expense",
      category: "餐飲",
      account_hint: null,
      note: "午餐",
      tx_date: "2026-06-02",
      confidence: 0.92,
    });
  });

  it("extracts the actual amount instead of date fragments", () => {
    const parsed = parseSimpleText("6/2 午餐 200 現金", new Date("2026-06-02T12:00:00.000Z"));
    expect(parsed).toMatchObject({
      amount: 200,
      category: "餐飲",
      account_hint: "現金",
      note: "午餐",
      tx_date: "2026-06-02",
    });
  });

  it("leaves ambiguous multi-amount input for the provider", () => {
    expect(parseSimpleText("午餐200晚餐300")).toBeNull();
  });

  // T-133: split/fund-intent phrases must go to the LLM, never the fast path.
  it("bails on split-intent input (我先出)", () => {
    expect(parseSimpleText("和a和b吃麥當勞我先出500")).toBeNull();
  });

  it("bails on split-intent input (平分)", () => {
    expect(parseSimpleText("跟同事吃午餐600平分")).toBeNull();
  });

  it("bails on debt phrasing (欠)", () => {
    expect(parseSimpleText("a欠我180")).toBeNull();
  });

  it("bails on fund phrasing (共同基金)", () => {
    expect(parseSimpleText("用共同基金買衛生紙450")).toBeNull();
  });

  // Account-to-account transfers need the LLM to capture the destination.
  it("bails on account-to-account transfer (從A到B)", () => {
    expect(parseSimpleText("轉帳 215 從現金到 LINE Pay")).toBeNull();
  });

  it("bails on 轉到 phrasing", () => {
    expect(parseSimpleText("現金轉到街口 500")).toBeNull();
  });

  it("keeps simple 提款 on the fast path (no destination)", () => {
    expect(parseSimpleText("提款 3000")).not.toBeNull();
  });
});

describe("parseText", () => {
  it("uses the local parser before calling the provider for simple text", async () => {
    const parsed = await parseText(throwingProvider, "今天吃午餐200");
    expect(parsed.amount).toBe(200);
    expect(parsed.category).toBe("餐飲");
  });

  it("falls back to the provider when local parsing is ambiguous", async () => {
    const parsed = await parseText(
      providerReturning({ amount: 300, category: "餐飲", confidence: 0.9 }),
      "午餐200晚餐300",
    );
    expect(parsed.amount).toBe(300);
    expect(parsed.kind).toBe("expense");
  });
});
