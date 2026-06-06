import { z } from "zod";
import type { JsonSchema } from "./providers/types.js";
import { nullableStr, txDateStr } from "./zodScalars.js";
import type { ParseResult } from "./parseTransaction.js";

/**
 * Unified discriminated parse schema — one shape for every accounting
 * intent (personal expense, split bill, shared fund), for both text and
 * receipt-image input. The LLM reports its own view of completeness, but
 * the backend recomputes missing fields (deriveMissingFields) and re-checks
 * the split math (validateSplitMath); the backend result is authoritative.
 */

export type TxType = "expense" | "income" | "transfer" | "split_expense" | "fund_expense";

export type MissingField =
  | "total_amount"
  | "payment_method"
  | "debt_distribution"
  | "fund_name";

export const DebtItemSchema = z.object({
  name: z.string().min(1),
  // LLM output is untrusted: a negative/zero debt must die at validation,
  // never reach validateSplitMath or the debts table.
  amount: z.number().positive(),
});
export type DebtItem = z.infer<typeof DebtItemSchema>;

export const UnifiedParseSchema = z.object({
  type: z.enum(["expense", "income", "transfer", "split_expense", "fund_expense"]),
  is_complete: z.boolean(),
  missing_fields: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.8),
  data: z.object({
    description: nullableStr,
    total_amount: z.number().nullable().default(null),
    payment_method: nullableStr,
    payer_id: nullableStr, // "me" | "common_fund" | alias
    my_share: z.number().nullable().default(null),
    debts: z.array(DebtItemSchema).default([]),
    fund_name: nullableStr,
    category: nullableStr,
    tx_date: txDateStr,
  }),
});

export type UnifiedParse = z.infer<typeof UnifiedParseSchema>;

/** JSON Schema handed to the provider (forced structured output). */
export const UNIFIED_JSON_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: ["expense", "income", "transfer", "split_expense", "fund_expense"],
      description:
        "expense=個人支出(預設), income=收入, transfer=轉帳, split_expense=多人分帳(我先墊錢), fund_expense=共同基金支出",
    },
    is_complete: { type: "boolean", description: "資訊是否齊全可直接記帳" },
    missing_fields: {
      type: "array",
      items: {
        type: "string",
        enum: ["total_amount", "payment_method", "debt_distribution", "fund_name"],
      },
      description: "缺漏欄位清單；is_complete=true 時為空陣列",
    },
    confidence: { type: "number", description: "0-1 信心分數" },
    data: {
      type: "object",
      properties: {
        description: { type: "string", description: "消費品項與場景描述" },
        total_amount: { type: "number", description: "總金額，正數；未知寫 null" },
        payment_method: {
          type: "string",
          description: "付款方式名稱，盡量對應「已知付款方式」清單；未提及寫 null",
        },
        payer_id: {
          type: "string",
          description: '誰先付錢："me"(預設) 或 "common_fund"(基金支付)',
        },
        my_share: { type: "number", description: "分帳時我自己分攤的金額；可由總額減去他人欠款算出" },
        debts: {
          type: "array",
          description: "分帳時其他人各自應付的金額",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "對方稱呼，盡量對應「已知好友」清單" },
              amount: { type: "number", description: "對方應付金額" },
            },
            required: ["name", "amount"],
          },
        },
        fund_name: { type: "string", description: "基金支出時的基金名稱，對應「已知基金」清單" },
        category: { type: "string", description: "分類：餐飲/交通/購物/娛樂/教育/醫療/居家/通訊/其他" },
        tx_date: { type: "string", description: "YYYY-MM-DD；使用者沒指定寫 null" },
      },
      required: ["total_amount"],
    },
  },
  required: ["type", "is_complete", "data"],
};

export const UNIFIED_SYSTEM_INSTRUCTION = `你是台灣記帳助理。將使用者的記帳訊息（一句中文或一張收據）轉成統一結構化 JSON。

type 判斷：
- 含「我先出/先墊/平分/AA/各付/欠/代買/代付/幫某人買…要還」等「別人欠我錢」語意 → split_expense
- 注意：只是描述「和/跟某人一起吃飯、出去玩」而完全沒有墊付、欠款、分攤語意 → 一般 expense，不是 split_expense
- 含「共同基金/公費/基金」且是支出 → fund_expense
- 含「收到/入帳/薪水」→ income；含「轉帳/提款」→ transfer
- 其他 → expense

分帳數學（split_expense）：
- 你必須自己算數學：my_share = total_amount − Σ(debts.amount)
- 例：「總共500，a吃180，b吃200」→ my_share=120, debts=[{a,180},{b,200}]
- 「平分」→ 總額除以人數（含我），餘數歸我

欄位規則：
- total_amount：純數字，去除單位（NT$、元、塊）；未知寫 null 並列入 missing_fields
- payment_method：對應「已知付款方式」清單的名稱；使用者沒提就 null 並列入 missing_fields（fund_expense 不需要）
- debts[].name：盡量用「已知好友」清單中的稱呼；清單沒有就照使用者的稱呼
- fund_name：fund_expense 必填，對應「已知基金」清單；對不上就 null 並列入 missing_fields
- category：台灣家庭常見分類（餐飲、交通、購物、娛樂、教育、醫療、居家、通訊、其他）
- tx_date：使用者沒指定就 null（不要猜今天）
- 描述和金額可能沒有空格，例如「今天吃午餐200」代表午餐、金額 200
- is_complete：上述必要欄位齊全才是 true
- confidence：明確完整 0.9 以上；模糊 0.5；幾乎用猜的 0.3 以下`;

const MATH_TOLERANCE = 0.01;

/**
 * Backend recomputation of missing fields — authoritative over the LLM's
 * own is_complete / missing_fields claims (TEST_PLAN T-117/T-118).
 */
export function deriveMissingFields(parse: UnifiedParse): MissingField[] {
  const missing: MissingField[] = [];
  const d = parse.data;

  if (d.total_amount === null || d.total_amount <= 0) missing.push("total_amount");
  if (parse.type !== "fund_expense" && d.payment_method == null) missing.push("payment_method");
  if (parse.type === "split_expense" && d.debts.length === 0) missing.push("debt_distribution");
  if (parse.type === "fund_expense" && d.fund_name == null) missing.push("fund_name");

  return missing;
}

export type SplitMathResult = {
  valid: boolean;
  /** my_share after auto-fill (total − Σdebts when the LLM left it null). */
  myShare: number | null;
  /** Debts with duplicate names merged by summing (same alias = same person). */
  debts: DebtItem[];
  missing: MissingField[];
};

/**
 * Re-check the LLM's split arithmetic: my_share + Σdebts must equal
 * total_amount within ±0.01. Auto-fills my_share when omitted; merges
 * duplicate debt names (one alias = one person) before checking.
 */
export function validateSplitMath(parse: UnifiedParse): SplitMathResult {
  const d = parse.data;
  if (parse.type !== "split_expense") {
    return { valid: true, myShare: d.my_share, debts: d.debts, missing: [] };
  }
  if (d.total_amount === null || d.total_amount <= 0) {
    return { valid: false, myShare: d.my_share, debts: d.debts, missing: ["total_amount"] };
  }
  if (d.debts.length === 0) {
    return { valid: false, myShare: d.my_share, debts: [], missing: ["debt_distribution"] };
  }

  // Merge duplicate names (T-126): same alias within one parse is one person.
  const merged: DebtItem[] = [];
  const byName = new Map<string, DebtItem>();
  for (const debt of d.debts) {
    const existing = byName.get(debt.name);
    if (existing) {
      existing.amount = round2(existing.amount + debt.amount);
    } else {
      const copy = { ...debt };
      byName.set(debt.name, copy);
      merged.push(copy);
    }
  }

  const debtSum = merged.reduce((sum, debt) => sum + debt.amount, 0);
  const myShare = d.my_share ?? round2(d.total_amount - debtSum);

  if (myShare < -MATH_TOLERANCE) {
    return { valid: false, myShare, debts: merged, missing: ["debt_distribution"] };
  }
  if (Math.abs(myShare + debtSum - d.total_amount) > MATH_TOLERANCE) {
    return { valid: false, myShare, debts: merged, missing: ["debt_distribution"] };
  }
  return { valid: true, myShare: round2(myShare), debts: merged, missing: [] };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Map a deterministic parseSimpleText result into the unified shape.
 * Fast path stays alive: single-amount quick entries never hit the LLM.
 */
export function toUnified(simple: ParseResult): UnifiedParse {
  const parse: UnifiedParse = {
    type: simple.kind,
    is_complete: false,
    missing_fields: [],
    confidence: simple.confidence,
    data: {
      description: simple.note ?? null,
      total_amount: simple.amount,
      payment_method: simple.account_hint ?? null,
      payer_id: "me",
      my_share: null,
      debts: [],
      fund_name: null,
      category: simple.category ?? null,
      tx_date: simple.tx_date ?? null,
    },
  };
  const missing = deriveMissingFields(parse);
  parse.missing_fields = missing;
  parse.is_complete = missing.length === 0;
  return parse;
}
