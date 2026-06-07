import { describe, expect, it } from "vitest";
import type { AIProvider, ModelInfo, ParseStructuredArgs } from "./providers/types.js";
import { parseUnified } from "./parseUnified.js";

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

/** Provider returning queued outputs (or throwing queued errors), recording calls. */
function queueProvider(outputs: unknown[]): AIProvider & { calls: ParseStructuredArgs[] } {
  const calls: ParseStructuredArgs[] = [];
  return {
    calls,
    async parseStructured<T>(args: ParseStructuredArgs): Promise<T> {
      calls.push(args);
      const next = outputs.shift();
      if (next instanceof Error) throw next;
      return next as T;
    },
    async verify(): Promise<boolean> {
      return true;
    },
    async listModels(): Promise<ModelInfo[]> {
      return [];
    },
  };
}

const validSplit = {
  type: "split_expense",
  is_complete: false,
  missing_fields: ["payment_method"],
  confidence: 0.9,
  data: {
    description: "麥當勞午餐",
    total_amount: 500,
    my_share: 120,
    debts: [
      { name: "a", amount: 180 },
      { name: "b", amount: 200 },
    ],
  },
};

describe("parseUnified", () => {
  it("uses the deterministic fast path without calling the provider", async () => {
    const parsed = await parseUnified(throwingProvider, { text: "今天吃午餐200" });
    expect(parsed.type).toBe("expense");
    expect(parsed.data.total_amount).toBe(200);
    expect(parsed.confidence).toBe(0.92);
  });

  it("calls the provider for split-intent text", async () => {
    const provider = queueProvider([validSplit]);
    const parsed = await parseUnified(provider, {
      text: "和a和b吃麥當勞我先出，a吃180 b吃200 總共500",
    });
    expect(parsed.type).toBe("split_expense");
    expect(parsed.data.debts).toHaveLength(2);
    expect(provider.calls).toHaveLength(1);
  });

  // T-352: invalid first output, valid second → retry succeeds
  it("retries once on invalid output", async () => {
    const provider = queueProvider([{ garbage: true }, validSplit]);
    const parsed = await parseUnified(provider, { text: "和a分帳 共500" });
    expect(parsed.type).toBe("split_expense");
    expect(provider.calls).toHaveLength(2);
  });

  // T-353: both attempts fail → throws
  it("throws after two failed attempts", async () => {
    const provider = queueProvider([{ garbage: true }, new Error("bad json")]);
    await expect(parseUnified(provider, { text: "和a分帳 共500" })).rejects.toThrow();
    expect(provider.calls).toHaveLength(2);
  });

  it("injects context into the system prompt", async () => {
    const provider = queueProvider([validSplit]);
    await parseUnified(provider, {
      text: "和a分帳 共500",
      context: { aliases: ["a", "老王"], paymentMethods: ["富邦卡"], fundNames: [] },
    });
    const sys = provider.calls[0]!.systemPrompt;
    expect(sys).toContain("已知好友");
    expect(sys).toContain("老王");
    expect(sys).toContain("富邦卡");
  });

  // T-351: image branch shares the unified pipeline
  it("passes images and the receipt prompt fragment", async () => {
    const provider = queueProvider([
      {
        type: "expense",
        is_complete: false,
        confidence: 0.85,
        data: { description: "全聯", total_amount: 320, category: "購物" },
      },
    ]);
    const parsed = await parseUnified(provider, {
      images: [{ base64: "abc", mimeType: "image/jpeg" }],
    });
    expect(parsed.data.total_amount).toBe(320);
    const call = provider.calls[0]!;
    expect(call.images).toHaveLength(1);
    expect(call.systemPrompt).toContain("統一發票");
  });

  it("rejects calls with neither text nor images", async () => {
    await expect(parseUnified(throwingProvider, {})).rejects.toThrow();
  });

  // Fund-name mention must bypass the deterministic fast path: with a fund
  // named 吞金獸,「吞金獸消費4500」needs LLM routing to fund_expense.
  it("skips the fast path when the text mentions a known fund name", async () => {
    const provider = queueProvider([
      {
        type: "fund_expense",
        is_complete: true,
        confidence: 0.9,
        data: { description: "消費", total_amount: 4500, fund_name: "吞金獸" },
      },
    ]);
    const parsed = await parseUnified(provider, {
      text: "吞金獸消費4500",
      context: { aliases: [], paymentMethods: [], fundNames: ["吞金獸"] },
    });
    expect(parsed.type).toBe("fund_expense");
    expect(provider.calls).toHaveLength(1);
  });

  it("keeps the fast path when no context name is mentioned", async () => {
    const parsed = await parseUnified(throwingProvider, {
      text: "午餐 120 現金",
      context: { aliases: ["老王"], paymentMethods: [], fundNames: ["吞金獸"] },
    });
    expect(parsed.type).toBe("expense");
    expect(parsed.confidence).toBe(0.92);
  });
});
