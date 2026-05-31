import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../liff";
import { fmtDate, fmtMoney } from "../lib/format";
import ErrorBox from "../components/ErrorBox";
import { DashboardSkeleton } from "../components/Skeleton";

interface Me {
  user: { id: string; displayName: string; pictureUrl: string | null };
  groups: { id: string; name: string; type: string }[];
  accounts: { id: string; name: string; type: string; balance: string }[];
}

interface AiUsage {
  parse_count: number;
  recognize_count: number;
  parse_quota: number | null;
  recognize_quota: number | null;
}

interface Summary {
  month: {
    start: string;
    expense: number;
    income: number;
    topCategories: { category: string; amount: number }[];
  };
  recent: {
    id: string;
    amount: string;
    category: string | null;
    txDate: string;
    kind: string;
    note: string | null;
  }[];
}

const QUICK_ACTIONS = [
  { to: "/tx/new", label: "記一筆", icon: "✍" },
  { to: "/transfer", label: "轉帳", icon: "↔" },
  { to: "/budgets", label: "預算", icon: "🎯" },
  { to: "/tx", label: "交易", icon: "📜" },
];

export default function Dashboard() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Me>("/v1/liff/me"),
  });
  const { data: sum } = useQuery({
    queryKey: ["summary"],
    queryFn: () => api<Summary>("/v1/liff/summary"),
  });
  const { data: usage } = useQuery({
    queryKey: ["ai-usage"],
    queryFn: () => api<AiUsage>("/v1/liff/ai-usage"),
  });

  if (isLoading) return <DashboardSkeleton />;
  if (error || !data)
    return (
      <div className="p-4">
        <ErrorBox onRetry={() => refetch()} error={error as Error} />
      </div>
    );

  const net = (sum?.month.income ?? 0) - (sum?.month.expense ?? 0);

  return (
    <div className="p-4 pb-24 space-y-4">
      <header className="flex items-center gap-3">
        {data.user.pictureUrl && (
          <img
            src={data.user.pictureUrl}
            alt=""
            className="w-11 h-11 rounded-full ring-2 ring-white shadow-sm"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-neutral-500">你好</div>
          <div className="font-semibold truncate">{data.user.displayName}</div>
        </div>
        <Link
          to="/settings"
          aria-label="設定"
          className="w-10 h-10 flex items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100"
        >
          ⚙
        </Link>
      </header>

      <section className="card bg-gradient-to-br from-emerald-600 to-emerald-700 text-white space-y-3 shadow-md">
        <div className="text-xs opacity-80">
          本月（自 {sum?.month.start ?? "—"}）
        </div>
        <div>
          <div className="text-xs opacity-80">支出</div>
          <div className="font-mono text-3xl font-bold">
            {fmtMoney(sum?.month.expense ?? 0)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-[11px] opacity-80">收入</div>
            <div className="font-mono">{fmtMoney(sum?.month.income ?? 0)}</div>
          </div>
          <div>
            <div className="text-[11px] opacity-80">淨</div>
            <div className={`font-mono ${net < 0 ? "text-red-200" : ""}`}>
              {fmtMoney(net)}
            </div>
          </div>
        </div>
      </section>

      <nav className="grid grid-cols-4 gap-2">
        {QUICK_ACTIONS.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="card !p-3 flex flex-col items-center gap-1 active:scale-95 transition"
          >
            <span className="text-xl">{a.icon}</span>
            <span className="text-xs text-neutral-700">{a.label}</span>
          </Link>
        ))}
      </nav>

      {usage && (
        <div className="block bg-amber-50 border border-amber-200 rounded-2xl p-3">
          <div className="text-xs text-amber-700">
            本月平台用量：解析{" "}
            {usage.parse_quota == null
              ? `${usage.parse_count} 筆（無上限）`
              : `${usage.parse_count}/${usage.parse_quota}`}{" "}
            · 辨識{" "}
            {usage.recognize_quota == null
              ? `${usage.recognize_count} 筆（無上限）`
              : `${usage.recognize_count}/${usage.recognize_quota}`}
          </div>
        </div>
      )}

      {sum && sum.month.topCategories.length > 0 && (
        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-700">本月分類</h2>
            <Link to="/overview" className="text-xs text-emerald-600">
              更多 →
            </Link>
          </div>
          {(() => {
            const max = Math.max(
              ...sum.month.topCategories.map((c) => c.amount),
              1,
            );
            return (
              <div className="space-y-2">
                {sum.month.topCategories.map((c) => {
                  const pct = Math.max(2, Math.round((c.amount / max) * 100));
                  return (
                    <div key={c.category} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-neutral-700">{c.category}</span>
                        <span className="font-mono text-neutral-900">
                          {fmtMoney(c.amount)}
                        </span>
                      </div>
                      <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </section>
      )}

      {sum && sum.recent.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-medium text-neutral-700">最近交易</h2>
            <Link to="/tx" className="text-xs text-emerald-600">
              全部 →
            </Link>
          </div>
          <ul className="card !p-0 divide-y divide-neutral-100">
            {sum.recent.map((r) => (
              <Link
                key={r.id}
                to={`/tx/${r.id}/edit?from=${encodeURIComponent("/dashboard")}`}
                className="flex items-center justify-between px-4 py-3 active:bg-neutral-50"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {r.category ?? "未分類"}
                  </div>
                  <div className="text-xs text-neutral-500 truncate">
                    {fmtDate(r.txDate)}
                    {r.note ? ` · ${r.note}` : ""}
                  </div>
                </div>
                <div
                  className={`font-mono text-sm ml-3 ${
                    r.kind === "income"
                      ? "text-emerald-600"
                      : "text-neutral-900"
                  }`}
                >
                  {r.kind === "income" ? "+" : "−"}
                  {fmtMoney(Number(r.amount))}
                </div>
              </Link>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
