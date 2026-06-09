import type { messagingApi } from "@line/bot-sdk";
import type { QueryResult } from "../../lib/queryEngine.js";

function money(n: number): string {
  return `NT$${Math.round(n).toLocaleString("zh-TW")}`;
}

const METRIC_NOUN: Record<QueryResult["metric"], string> = {
  spend: "支出",
  income: "收入",
  count: "筆數",
  biggest: "最大一筆",
};

/** Natural-language query answer card (今日花費 / 餐飲花多少 / 環比 …). */
export function buildQueryResultFlex(r: QueryResult): messagingApi.FlexMessage {
  const title = `${r.periodLabel}${r.category ? `・${r.category}` : ""}${METRIC_NOUN[r.metric]}`;

  // biggest: show the single transaction.
  if (r.metric === "biggest") {
    const b = r.biggest;
    const body: messagingApi.FlexComponent[] = b
      ? [
          kv("品項", b.note ?? b.category ?? "—"),
          kv("分類", b.category ?? "未分類"),
          kv("日期", b.txDate.slice(5).replace("-", "/")),
        ]
      : [{ type: "text", text: "這段期間沒有支出。", size: "sm", color: "#8C8C8C" }];
    return card(title, b ? money(b.amount) : "—", body);
  }

  const headline = r.metric === "count" ? `${r.txCount} 筆` : money(r.total);

  const body: messagingApi.FlexComponent[] = [];
  if (r.prevTotal !== null) {
    const diff = r.total - r.prevTotal;
    const pct = r.prevTotal > 0 ? Math.round((diff / r.prevTotal) * 100) : null;
    body.push(
      kv(
        "對比上期",
        `${money(r.prevTotal)}（${diff >= 0 ? "+" : ""}${money(diff)}${pct !== null ? ` / ${diff >= 0 ? "+" : ""}${pct}%` : ""}）`,
      ),
    );
  }
  if (r.topCategories.length > 0 && !r.category) {
    body.push({ type: "text", text: "分類前幾名", size: "xs", color: "#8C8C8C", weight: "bold", margin: "md" });
    for (const c of r.topCategories) {
      body.push(kv(c.category, money(c.amount)));
    }
  }
  body.push(kv("筆數", `${r.txCount} 筆`));

  return card(title, headline, body);
}

function card(
  title: string,
  headline: string,
  body: messagingApi.FlexComponent[],
): messagingApi.FlexMessage {
  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: `📊 ${title}`, weight: "bold", color: "#1D7FB4", size: "sm" },
        { type: "text", text: headline, weight: "bold", size: "xxl", margin: "md" },
      ],
    },
    body: { type: "box", layout: "vertical", spacing: "sm", contents: body },
  };
  return { type: "flex", altText: `${title} ${headline}`, contents: bubble };
}

function kv(k: string, v: string): messagingApi.FlexBox {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: k, size: "sm", color: "#8C8C8C", flex: 4, wrap: true },
      { type: "text", text: v, size: "sm", flex: 5, align: "end", wrap: true },
    ],
  };
}
