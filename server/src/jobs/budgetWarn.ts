import { sql } from "../db/client.js";
import { lineClient } from "../line/client.js";
import { logger } from "../lib/logger.js";

interface BudgetRow {
  id: string;
  user_id: string;
  line_user_id: string;
  group_id: string | null;
  category: string | null;
  monthly_limit: string;
  spent: string;
}

const warned = new Set<string>();

function currentMonthKey(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function firstOfMonth(): string {
  return `${currentMonthKey()}-01`;
}

export async function runBudgetWarn(): Promise<void> {
  const start = firstOfMonth();
  const monthKey = currentMonthKey();

  const rows = await sql<BudgetRow[]>`
    SELECT b.id, b.user_id, u.line_user_id, b.group_id, b.category, b.monthly_limit,
           COALESCE((
             SELECT SUM(t.amount)
             FROM transactions t
             WHERE t.paid_by_user_id = b.user_id
               AND t.kind = 'expense'
               AND t.tx_date >= ${start}::date
               AND (b.group_id IS NULL OR t.group_id = b.group_id)
               AND (b.category IS NULL OR t.category = b.category)
           ), 0) AS spent
    FROM budgets b
    JOIN users u ON u.id = b.user_id
  `;

  for (const row of rows) {
    const limit = Number(row.monthly_limit);
    const spent = Number(row.spent);
    if (limit <= 0) continue;
    const ratio = spent / limit;
    if (ratio <= 0.8) continue;

    const key = `${row.user_id}:${row.id}:${monthKey}`;
    if (warned.has(key)) continue;

    const pct = Math.round(ratio * 100);
    const label = row.category ?? "全部";
    const text = `⚠️ 預算提醒：${label} 已使用 ${pct}%（${spent.toFixed(0)} / ${limit.toFixed(0)}）`;

    try {
      await lineClient().pushMessage({
        to: row.line_user_id,
        messages: [{ type: "text", text }],
      });
      warned.add(key);
    } catch (err) {
      logger.error({ err }, `[budgetWarn] user=${row.line_user_id} failed`);
    }
  }
}
