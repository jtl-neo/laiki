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

export const RecognizeResultSchema = z.object({
  amount: z.number().positive(),
  tx_date: txDateStr,
  category: nullableStr,
  merchant: nullableStr,
  items: z
    .array(
      z.object({
        name: z.string(),
        amount: z.number().optional(),
        qty: z.number().optional(),
      }),
    )
    .optional(),
  confidence: z.number().min(0).max(1).default(0.8),
  account_hint: nullableStr,
  note: nullableStr,
});

export type RecognizeResult = z.infer<typeof RecognizeResultSchema>;

const RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    amount: { type: "number", description: "總金額，正數" },
    tx_date: { type: "string", description: "YYYY-MM-DD；無法判讀則 null" },
    category: { type: "string", description: "分類，例如 餐飲 / 交通 / 購物" },
    merchant: { type: "string", description: "商家名稱" },
    items: {
      type: "array",
      description: "品項列表（可選）",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          amount: { type: "number" },
          qty: { type: "number" },
        },
        required: ["name"],
      },
    },
    confidence: { type: "number", description: "0-1 信心分數" },
    account_hint: { type: "string", description: "付款方式（信用卡/現金/LINE Pay 等）" },
    note: { type: "string", description: "備註" },
  },
  required: ["amount", "confidence"],
};

const SYSTEM_INSTRUCTION = `你是台灣記帳助理，負責辨識發票或收據圖片。

== 台灣發票格式參考 ==
- 統一發票字軌：英文兩碼 + 數字 8 碼，例如 AB-12345678（字軌通常在發票上方）
- 總計金額一般位於發票下方，標示為「總計」「合計」「應付」「實付」「Total」等
- 統一編號 8 碼數字（買方/賣方），不要誤抓為金額或發票號碼
- 電子發票常見「載具」「捐贈碼」「隨機碼」字樣可忽略

== 多語與字元處理 ==
- 商家名稱可能中英文混合（例如「星巴克 Starbucks」），保留原樣
- 數字可能是阿拉伯數字 (123) 或全形數字 (１２３)，一律輸出阿拉伯數字
- 金額忽略千分位逗號與貨幣符號（NT$, $, TWD, 元）

== 日期 ==
- 可能為民國年（例：114/05/19、114-05-19、中華民國114年5月19日）或西元（2026-05-19、2026/05/19）
- 民國年換算西元：民國年 + 1911 = 西元年（例：114 → 2025）
- 一律輸出 YYYY-MM-DD；若日期欄位殘缺或無法判讀則 null，不要猜

== 信心評估 ==
- 清晰完整、欄位齊全：confidence ≥ 0.9
- 部分模糊但主要欄位可讀：0.5–0.7
- 嚴重模糊、反光、遮蔽、傾斜難辨：≤ 0.3，並寧可給 null/降信心，不要亂猜數字或日期

== 欄位規則 ==
- amount：抓取「總計 / 應付 / 總金額 / Total」純數字（正數）
- category：台灣家庭常見分類（餐飲、交通、購物、娛樂、教育、醫療、居家、其他）
- merchant：商家名稱
- items：條列品項（可選），有就抓
- account_hint：付款方式（信用卡 / 現金 / LINE Pay / 悠遊卡 等）若可判讀`;

export type RecognizeImage = { base64: string; mimeType: string };

export async function recognizeReceipt(
  provider: AIProvider,
  images: RecognizeImage[],
): Promise<RecognizeResult> {
  if (!images.length) throw new Error("recognizeReceipt: images empty");
  const userText =
    images.length === 1
      ? "請辨識這張發票/收據，輸出結構化 JSON。"
      : `請辨識這 ${images.length} 張圖片（可能是同一張收據的多頁/多角度，或多張獨立收據）。若為同一筆收據，請合併為單一結果；金額以「總計」為準，items 取各頁聯集。若為多張獨立收據，請以總金額加總輸出。輸出結構化 JSON。`;
  const json = await provider.parseStructured<unknown>({
    systemPrompt: SYSTEM_INSTRUCTION,
    userText,
    schema: RESPONSE_SCHEMA,
    images: images.map((i) => ({ base64: i.base64, mimeType: i.mimeType })),
    temperature: 0.1,
  });
  return RecognizeResultSchema.parse(json);
}
