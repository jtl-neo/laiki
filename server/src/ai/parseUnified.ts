import type { AIProvider, ProviderImage } from "./providers/types.js";
import { parseSimpleText } from "./parseTransaction.js";
import {
  UNIFIED_JSON_SCHEMA,
  UNIFIED_SYSTEM_INSTRUCTION,
  UnifiedParseSchema,
  toUnified,
  type UnifiedParse,
} from "./unifiedSchema.js";
import { renderContextPrompt, type ParseContext } from "./buildContext.js";

/**
 * Receipt-image guidance folded into the unified prompt when images are
 * present. Mirrors the Taiwan-invoice rules from recognizeReceipt (which
 * stays alive until its call sites are cut over).
 */
const RECEIPT_SYSTEM_FRAGMENT = `

== 收據/發票圖片辨識 ==
- 統一發票字軌：英文兩碼 + 數字 8 碼（如 AB-12345678），通常在發票上方
- total_amount 抓「總計 / 合計 / 應付 / 實付 / Total」；統一編號 8 碼數字不要誤抓為金額
- 電子發票「載具」「捐贈碼」「隨機碼」可忽略
- 全形數字一律輸出阿拉伯數字；金額忽略千分位逗號與貨幣符號
- 民國年換算西元（民國年 + 1911），一律輸出 YYYY-MM-DD；殘缺或無法判讀則 null，不要猜
- description 放商家名稱與主要品項；模糊、反光、遮蔽時降 confidence 並寧可給 null`;

export type ParseUnifiedArgs = {
  text?: string;
  images?: ProviderImage[];
  context?: ParseContext;
};

/**
 * Single entry point for all AI accounting input (text and receipt
 * images). Deterministic fast path first; otherwise one LLM call with the
 * unified schema + injected user context, retried once on invalid output.
 */
export async function parseUnified(
  provider: AIProvider,
  args: ParseUnifiedArgs,
): Promise<UnifiedParse> {
  const hasImages = (args.images?.length ?? 0) > 0;
  const text = args.text?.trim() ?? "";
  if (!hasImages && text === "") {
    throw new Error("parseUnified: need text or images");
  }

  // Fast path: single-amount quick entries never hit the LLM — but never
  // when the text mentions one of the user's funds or friends; those need
  // the LLM's fund/split routing (e.g.「吞金獸消費4500」with a fund named
  // 吞金獸 must become fund_expense, not a personal expense).
  if (!hasImages && !mentionsContextName(text, args.context)) {
    const simple = parseSimpleText(text);
    if (simple) return toUnified(simple);
  }

  const systemPrompt =
    UNIFIED_SYSTEM_INSTRUCTION +
    (hasImages ? RECEIPT_SYSTEM_FRAGMENT : "") +
    renderContextPrompt(args.context);

  const userText = hasImages
    ? text || buildImageUserText(args.images!.length)
    : text;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const json = await provider.parseStructured<unknown>({
        systemPrompt,
        userText,
        schema: UNIFIED_JSON_SCHEMA,
        images: args.images,
        temperature: 0.1,
      });
      return UnifiedParseSchema.parse(json);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/**
 * True when the text contains a known fund name or friend alias (length
 * ≥ 2 to avoid noise from single-character aliases).
 */
function mentionsContextName(text: string, context?: ParseContext): boolean {
  if (!context) return false;
  const names = [...context.fundNames, ...context.aliases];
  return names.some((n) => {
    const name = n.trim();
    return name.length >= 2 && text.includes(name);
  });
}

function buildImageUserText(count: number): string {
  return count === 1
    ? "請辨識這張發票/收據，輸出統一結構化 JSON。"
    : `請辨識這 ${count} 張圖片（可能是同一張收據的多頁，或多張獨立收據）。同一筆請合併為單一結果、金額以「總計」為準；多張獨立收據請以總金額加總輸出。輸出統一結構化 JSON。`;
}
