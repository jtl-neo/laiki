import { z } from "zod";
import type { AIProvider, JsonSchema } from "./providers/types.js";
import { nullableStr, txDateStr } from "./zodScalars.js";

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

type AmountCandidate = {
  amount: number;
  index: number;
  end: number;
  raw: string;
  explicitCurrency: boolean;
};

type AccountHintRule = {
  hint: string;
  pattern: RegExp;
};

const SIMPLE_PARSE_CONFIDENCE = 0.92;

// Split/fund-intent phrases need the LLM's unified parse (debt math, fund
// matching); the deterministic fast path must never swallow them (T-133).
const SPLIT_HINT_RE =
  /我先出|先出錢|先墊|墊付|平分|均分|AA|各付|各出|分帳|欠我|我欠|欠款|共同基金|公費|基金/iu;

// Account-to-account transfers ("從A轉到B"、"A轉B"、"轉到B"、"匯到B") carry a
// DESTINATION the single-account fast path can't represent — bail to the LLM
// so both the source and the destination are extracted.
const TRANSFER_DEST_RE = /轉到|轉入|轉去|轉進|匯到|匯入|匯去|存到|從.+到|.+轉(?:帳)?(?:到|進|入)/u;

const AMOUNT_RE =
  /(?:(?:NT\$|NTD|TWD|\$)\s*)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(元|塊|圓))?/giu;

const ABSOLUTE_DATE_RE =
  /(?:(\d{4})\s*[\/.-年]\s*)?(\d{1,2})\s*[\/.-月]\s*(\d{1,2})(?:\s*[日號])?/u;

const CATEGORY_RULES: [string, RegExp][] = [
  [
    "餐飲",
    /早餐|早午餐|午餐|晚餐|宵夜|餐飲|餐廳|便當|飲料|咖啡|手搖|珍奶|牛肉麵|火鍋|小吃|麥當勞|肯德基|星巴克|吃|餐|飯|麵|超商|7-?11|全家/u,
  ],
  ["交通", /交通|捷運|公車|火車|高鐵|台鐵|客運|計程車|uber|停車|油錢|加油|通勤/u],
  ["購物", /購物|買|衣服|鞋|包包|蝦皮|momo|pchome|博客來|全聯|家樂福|好市多|大潤發/u],
  ["娛樂", /娛樂|電影|遊戲|netflix|spotify|ktv|唱歌|酒吧|旅遊|旅行|門票/iu],
  ["教育", /教育|學費|補習|課程|書|教材/u],
  ["醫療", /醫療|看診|掛號|藥|診所|醫院|牙醫/u],
  ["居家", /居家|房租|水電|瓦斯|管理費|家具|家用品|清潔/u],
  ["通訊", /通訊|電話費|手機|網路費|電信/u],
  ["醫美", /醫美|美容|保養|美甲|按摩/u],
];

const ACCOUNT_HINT_RULES: AccountHintRule[] = [
  { hint: "LINE Pay", pattern: /line\s*pay|linepay/iu },
  { hint: "悠遊付", pattern: /悠遊付/u },
  { hint: "悠遊卡", pattern: /悠遊卡/u },
  { hint: "一卡通", pattern: /一卡通/u },
  { hint: "街口", pattern: /街口/u },
  { hint: "信用卡", pattern: /信用卡|刷卡/u },
  { hint: "現金", pattern: /現金|錢包/u },
  { hint: "玉山", pattern: /玉山/u },
  { hint: "中信", pattern: /中信|中國信託/u },
  { hint: "台新", pattern: /台新/u },
  { hint: "國泰", pattern: /國泰/u },
  { hint: "富邦", pattern: /富邦/u },
  { hint: "永豐", pattern: /永豐/u },
  { hint: "元大", pattern: /元大/u },
  { hint: "郵局", pattern: /郵局/u },
  { hint: "銀行", pattern: /銀行/u },
];

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
- 描述和金額可能沒有空格，例如「今天吃午餐200」代表午餐、金額 200
- confidence：明確完整給 0.9 以上；模糊 0.5；幾乎猜的 0.3 以下`;

export async function parseText(provider: AIProvider, text: string): Promise<ParseResult> {
  const simple = parseSimpleText(text);
  if (simple) return simple;

  const json = await provider.parseStructured<unknown>({
    systemPrompt: SYSTEM_INSTRUCTION,
    userText: text,
    schema: RESPONSE_SCHEMA,
    temperature: 0.1,
  });
  return ParseResultSchema.parse(json);
}

/**
 * Deterministic parser for high-confidence quick-entry messages.
 * It intentionally accepts only one clear amount; ambiguous inputs still go to
 * the configured LLM provider.
 */
export function parseSimpleText(text: string, now = new Date()): ParseResult | null {
  const normalized = normalizeUserText(text);
  if (!normalized) return null;
  if (SPLIT_HINT_RE.test(normalized)) return null;
  // Only bail for transfer DESTINATION phrasing, not every "轉" (提款/轉帳
  // without a target still take the fast path).
  if (/轉|匯|提款|提領/u.test(normalized) && TRANSFER_DEST_RE.test(normalized)) {
    return null;
  }

  const amount = pickAmountCandidate(normalized);
  if (!amount) return null;

  const kind = inferKind(normalized);
  const txDate = inferDate(normalized, now);
  const category = inferCategory(normalized, kind);
  const accountHint = inferAccountHint(normalized);
  const note = buildNote(normalized, amount);

  return ParseResultSchema.parse({
    amount: amount.amount,
    kind,
    category,
    account_hint: accountHint,
    group_hint: null,
    transfer_to_account_hint: null,
    note,
    tx_date: txDate,
    confidence: SIMPLE_PARSE_CONFIDENCE,
  });
}

function normalizeUserText(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function pickAmountCandidate(text: string): AmountCandidate | null {
  const candidates = [...amountCandidates(text)].filter((c) => !looksLikeDatePart(text, c));
  const explicit = candidates.filter((c) => c.explicitCurrency);
  const usable = explicit.length > 0 ? explicit : candidates;
  if (usable.length !== 1) return null;
  return usable[0] ?? null;
}

function* amountCandidates(text: string): Generator<AmountCandidate> {
  AMOUNT_RE.lastIndex = 0;
  for (const match of text.matchAll(AMOUNT_RE)) {
    const raw = match[0];
    const num = match[1];
    if (!num || match.index === undefined) continue;
    const amount = Number(num.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    yield {
      amount,
      index: match.index,
      end: match.index + raw.length,
      raw,
      explicitCurrency: /NT\$|NTD|TWD|\$|元|塊|圓/iu.test(raw),
    };
  }
}

function looksLikeDatePart(text: string, candidate: AmountCandidate): boolean {
  const before = text.slice(Math.max(0, candidate.index - 2), candidate.index);
  const after = text.slice(candidate.end, candidate.end + 2);
  if (/[\/.\-年月日號]\s*$/u.test(before)) return true;
  if (/^\s*[\/.\-年月日號]/u.test(after)) return true;

  const digits = candidate.raw.replace(/\D/g, "");
  return digits.length === 8 && /^20\d{6}$/.test(digits);
}

function inferKind(text: string): ParseResult["kind"] {
  if (/轉帳|轉入|轉出|轉到|轉給|提款|提領/u.test(text)) return "transfer";
  if (/收入|收到|入帳|薪水|薪資|薪轉|獎金|退款|退費|報銷|利息|股息|存入/u.test(text)) {
    return "income";
  }
  return "expense";
}

function inferDate(text: string, now: Date): string | null {
  if (/前天/u.test(text)) return shiftDate(now, -2);
  if (/昨天|昨日/u.test(text)) return shiftDate(now, -1);
  if (/今天|今日/u.test(text)) return shiftDate(now, 0);
  if (/明天|明日/u.test(text)) return shiftDate(now, 1);

  const match = text.match(ABSOLUTE_DATE_RE);
  if (!match) return null;

  const year = match[1] ? Number(match[1]) : now.getUTCFullYear();
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidYmd(year, month, day)) return null;
  return ymd(new Date(Date.UTC(year, month - 1, day)));
}

function shiftDate(date: Date, days: number): string {
  const shifted = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return ymd(shifted);
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function inferCategory(text: string, kind: ParseResult["kind"]): string | null {
  if (kind === "income" && /薪水|薪資|薪轉/u.test(text)) return "薪水";
  if (kind === "transfer") return null;

  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(text)) return category;
  }
  return "其他";
}

function inferAccountHint(text: string): string | null {
  return ACCOUNT_HINT_RULES.find((rule) => rule.pattern.test(text))?.hint ?? null;
}

function buildNote(text: string, amount: AmountCandidate): string | null {
  const withoutAmount = text.slice(0, amount.index) + text.slice(amount.end);
  const accountCleaned = ACCOUNT_HINT_RULES.reduce(
    (current, rule) => current.replace(rule.pattern, " "),
    withoutAmount,
  );
  const note = accountCleaned
    .replace(ABSOLUTE_DATE_RE, " ")
    .replace(/今天|今日|昨天|昨日|前天|明天|明日/gu, " ")
    .replace(/記帳|支出|花了?|花費|消費|付了?|付款|刷卡|買了?|買|吃了?|吃|繳了?|繳|收到|收入|入帳|薪水|薪資|薪轉|獎金|退款|退費|報銷|轉帳|轉入|轉出|轉到|轉給|提款|提領|平分|均分|AA/giu, " ")
    .replace(/[，,。.!！?？:：;；、]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return note.length > 0 ? note : null;
}
