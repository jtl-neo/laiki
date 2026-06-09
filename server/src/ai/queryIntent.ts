/**
 * Intent classification + deterministic query parsing.
 *
 * The bot historically only recorded transactions; natural questions like
 * 「今日花費」were mis-handled as records. classifyIntent splits an incoming
 * message into record vs query so the query path can answer instead of
 * asking "how much?". parseSimpleQuery covers the common queries without an
 * LLM; ambiguous ones fall through to the LLM query parser (parseQuery).
 */

export type Intent = "record" | "query";

export type QueryMetric = "spend" | "income" | "count" | "biggest";
export type QueryPeriod =
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "all";

export type QueryParse = {
  metric: QueryMetric;
  period: QueryPeriod;
  category: string | null;
  /** Compare against the previous comparable period. */
  compare: boolean;
};

const AMOUNT_RE = /(?:NT\$|NTD|TWD|\$)?\s*\d{2,}(?:[,，]\d{3})*(?:\.\d+)?\s*(?:元|塊|圓)?/u;

// Words that signal the user is ASKING about existing data.
const QUERY_WORD_RE =
  /多少|花費|支出|花銷|開銷|消費總|總共花|共花|剩(?:多少|下)?|還(?:有|剩)多少|統計|查詢|看一下|最大一筆|最多.{0,3}一筆|怎樣|如何/u;
const QUESTION_TAIL_RE = /[?？]\s*$|嗎\s*$|呢\s*$/u;
const PERIOD_WORD_RE =
  /今天|今日|本日|昨天|昨日|這週|本週|這星期|上週|上星期|這個?月|本月|上個?月|今年|本年/u;
const SPEND_NOUN_RE = /花費|支出|花銷|開銷|收入|花了|用了|花多少|消費/u;

// Category keyword → canonical name (mirrors parseTransaction CATEGORY_RULES).
const CATEGORY_HINTS: [string, RegExp][] = [
  ["餐飲", /吃|餐|飯|早餐|午餐|晚餐|宵夜|飲料|咖啡|餐飲/u],
  ["交通", /交通|捷運|公車|高鐵|油錢|加油|計程車|停車/u],
  ["購物", /購物|買東西|衣服|蝦皮/u],
  ["娛樂", /娛樂|電影|遊戲|唱歌/u],
  ["居家", /居家|房租|水電|家用/u],
  ["醫療", /醫療|看診|藥/u],
];

/**
 * record vs query. Records are the default — a query needs a clear
 * asking signal AND must not carry a fresh amount to add. 「今日花費200」is
 * a record (adding 200), 「今日花費」is a query.
 */
export function classifyIntent(text: string): Intent {
  const t = text.normalize("NFKC").trim();
  if (!t) return "record";

  const hasAmount = AMOUNT_RE.test(t);
  const asksQuantity = /多少/u.test(t) || QUESTION_TAIL_RE.test(t);

  // Explicit「…多少」/ trailing question → query, unless it also states a
  // concrete amount to record.
  if (asksQuantity && !hasAmount) return "query";

  // 「今日花費」「本月支出」: period + spend-noun + no amount → query.
  if (PERIOD_WORD_RE.test(t) && SPEND_NOUN_RE.test(t) && !hasAmount) return "query";

  // Bare spend/stat words without amount (「花費」「支出」「統計」).
  if (QUERY_WORD_RE.test(t) && !hasAmount && t.length <= 12) return "query";

  return "record";
}

/**
 * Deterministic parse for the common queries. Returns null when the text
 * isn't a recognizable simple query (caller may try the LLM parser).
 */
export function parseSimpleQuery(text: string): QueryParse | null {
  if (classifyIntent(text) !== "query") return null;
  const t = text.normalize("NFKC").trim();

  const metric: QueryMetric = /收入|入帳|賺/u.test(t)
    ? "income"
    : /最大一筆|最多.{0,3}一筆|最高.{0,3}一筆/u.test(t)
      ? "biggest"
      : /幾筆|幾次|多少筆/u.test(t)
        ? "count"
        : "spend";

  const period: QueryPeriod = /昨天|昨日/u.test(t)
    ? "yesterday"
    : /今天|今日|本日/u.test(t)
      ? "today"
      : /上週|上星期/u.test(t)
        ? "last_month" // no last_week bucket; map weekly past to month range later
        : /這週|本週|這星期/u.test(t)
          ? "this_week"
          : /上個?月/u.test(t)
            ? "last_month"
            : /今年|本年/u.test(t)
              ? "this_year"
              : "this_month";

  let category: string | null = null;
  for (const [name, re] of CATEGORY_HINTS) {
    if (re.test(t)) {
      category = name;
      break;
    }
  }

  const compare = /比較|相比|比上|跟上.{0,2}比|環比/u.test(t);

  return { metric, period, category, compare };
}
