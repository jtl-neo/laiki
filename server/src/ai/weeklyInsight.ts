import { z } from "zod";
import type { AIProvider, JsonSchema } from "./providers/types.js";

export const WeeklyInsightSchema = z.object({
  summary: z.string(),
  topCategory: z.string().nullable().optional(),
  topCategoryAmount: z.number().nullable().optional(),
  comparedLastWeek: z.string().nullable().optional(),
  tips: z.array(z.string()).default([]),
});

export type WeeklyInsight = z.infer<typeof WeeklyInsightSchema>;

export interface InsightData {
  summary: string;
  topCategory?: string;
  topCategoryAmount?: number;
  comparedLastWeek?: string;
  tips: string[];
}

const RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    summary: { type: "string", description: "本週花費自然語句摘要" },
    topCategory: { type: "string", description: "花費最多的分類" },
    topCategoryAmount: { type: "number", description: "該分類金額" },
    comparedLastWeek: { type: "string", description: "與上週比較的描述" },
    tips: {
      type: "array",
      description: "1-3 條省錢或建議",
      items: { type: "string" },
    },
  },
  required: ["summary", "tips"],
};

const SYSTEM_INSTRUCTION = `你是台灣家庭記帳分析助理。依據彙整好的本週統計，產生中文摘要與 1-3 條實用建議。
- summary：用 2-3 句溫和友善口吻描述本週花費
- topCategory / topCategoryAmount：照傳入資料填入
- comparedLastWeek：根據傳入比較字串描述
- tips：條列建議，每條一句，台灣口語`;

type Tx = { amount: number; category: string | null; txDate: string; kind: string };

function aggregate(txs: Tx[]) {
  const expenses = txs.filter((t) => t.kind === "expense");
  const total = expenses.reduce((s, t) => s + t.amount, 0);
  const byCat = new Map<string, number>();
  for (const t of expenses) {
    const k = t.category ?? "其他";
    byCat.set(k, (byCat.get(k) ?? 0) + t.amount);
  }
  let topCategory: string | null = null;
  let topCategoryAmount = 0;
  for (const [k, v] of byCat) {
    if (v > topCategoryAmount) {
      topCategory = k;
      topCategoryAmount = v;
    }
  }

  const dates = expenses.map((t) => t.txDate).sort();
  const cutoff = dates.length > 0 ? dates[dates.length - 1] : null;
  let thisWeekTotal = 0;
  let lastWeekTotal = 0;
  if (cutoff) {
    const cutoffDate = new Date(cutoff);
    const sevenDaysAgo = new Date(cutoffDate);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    for (const t of expenses) {
      const d = new Date(t.txDate);
      if (d > sevenDaysAgo) thisWeekTotal += t.amount;
      else lastWeekTotal += t.amount;
    }
  } else {
    thisWeekTotal = total;
  }

  return {
    total,
    count: expenses.length,
    topCategory,
    topCategoryAmount,
    byCategory: Object.fromEntries(byCat),
    thisWeekTotal,
    lastWeekTotal,
  };
}

export async function weeklyInsight(provider: AIProvider, txs: Tx[]): Promise<WeeklyInsight> {
  const stats = aggregate(txs);

  const diff = stats.thisWeekTotal - stats.lastWeekTotal;
  const comparedDesc =
    stats.lastWeekTotal === 0
      ? "沒有上週資料可比較"
      : diff > 0
        ? `比上週多花 ${diff.toFixed(0)} 元`
        : `比上週少花 ${(-diff).toFixed(0)} 元`;

  const userText = `本週統計：
- 總支出：${stats.total.toFixed(0)} 元
- 筆數：${stats.count}
- 最高分類：${stats.topCategory ?? "無"}（${stats.topCategoryAmount.toFixed(0)} 元）
- 各分類：${JSON.stringify(stats.byCategory)}
- 本週/上週金額：${stats.thisWeekTotal.toFixed(0)} / ${stats.lastWeekTotal.toFixed(0)}
- 比較：${comparedDesc}
請依此產生 JSON 摘要。`;

  const json = await provider.parseStructured<unknown>({
    systemPrompt: SYSTEM_INSTRUCTION,
    userText,
    schema: RESPONSE_SCHEMA,
    temperature: 0.4,
  });
  const parsed = WeeklyInsightSchema.parse(json);
  return {
    ...parsed,
    topCategory: stats.topCategory ?? parsed.topCategory ?? null,
    topCategoryAmount: stats.topCategoryAmount || (parsed.topCategoryAmount ?? 0),
    comparedLastWeek: parsed.comparedLastWeek ?? comparedDesc,
  };
}
