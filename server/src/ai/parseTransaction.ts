import { z } from "zod";
import type { AIProvider, JsonSchema } from "./providers/types.js";

const nullableStr = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    if (t === "" || t.toLowerCase() === "null" || t.toLowerCase() === "undefined") return null;
    return t;
  },
  z.string().nullable().optional(),
);

const txDateStr = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    if (t === "" || t.toLowerCase() === "null" || t.toLowerCase() === "undefined") return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
  },
  z.string().nullable().optional(),
);

export const ParseResultSchema = z.object({
  amount: z.number().positive(),
  kind: z.enum(["expense", "income", "transfer"]).default("expense"),
  category: nullableStr,
  account_hint: nullableStr,
  group_hint: nullableStr,
  transfer_to_account_hint: nullableStr,
  note: nullableStr,
  tx_date: txDateStr,
  confidence: z.number().min(0).max(1).default(0.8),
});

export type ParseResult = z.infer<typeof ParseResultSchema>;

const RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    amount: { type: "number", description: "金額，正數" },
    kind: {
      type: "string",
      enum: ["expense", "income", "transfer"],
      description: "expense=支出（預設）, income=收入, transfer=轉帳",
    },
    category: { type: "string", description: "分類，例如 餐飲 / 交通 / 娛樂" },
    account_hint: { type: "string", description: "使用者提到的付款帳戶名稱片段" },
    transfer_to_account_hint: { type: "string", description: "若是轉帳，轉入帳戶名稱片段" },
    group_hint: { type: "string", description: "群組名稱片段，例如 家用 / 出國" },
    note: { type: "string", description: "備註" },
    tx_date: { type: "string", description: "YYYY-MM-DD；若使用者沒指定則 null" },
    confidence: { type: "number", description: "0-1 的信心分數" },
  },
  required: ["amount", "kind", "confidence"],
};

const SYSTEM_INSTRUCTION = `你是台灣記帳助理。將使用者一行中文記帳訊息轉成結構化 JSON。
規則：
- amount：純數字，去除單位（NT$、元、塊、$）
- kind 預設 expense；含「收到 / 入帳 / 薪水」→ income；含「轉 / 提款」→ transfer
- category：用台灣家庭常見分類（餐飲、交通、購物、娛樂、教育、醫療、居家、其他）
- account_hint：抓使用者帳戶關鍵字（如「LINE Pay」「現金」「玉山」「信用卡」），若無寫 null
- tx_date：使用者沒指定就 null（不要猜今天）
- confidence：明確完整給 0.9 以上；模糊 0.5；幾乎猜的 0.3 以下`;

export async function parseText(provider: AIProvider, text: string): Promise<ParseResult> {
  const json = await provider.parseStructured<unknown>({
    systemPrompt: SYSTEM_INSTRUCTION,
    userText: text,
    schema: RESPONSE_SCHEMA,
    temperature: 0.1,
  });
  return ParseResultSchema.parse(json);
}
