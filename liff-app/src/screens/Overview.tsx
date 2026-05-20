import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../liff";
import { fmtMoney, groupTypeLabel } from "../lib/format";
import Header from "../components/Header";
import ErrorBox from "../components/ErrorBox";

interface AccountRow {
  id: string;
  name: string;
  type: string;
  balance: number;
  isShared: boolean;
}

interface OverviewData {
  netWorth: number;
  assets: number;
  debts: number;
  accounts: AccountRow[];
  thisMonth: {
    start: string;
    income: number;
    expense: number;
    net: number;
    topCategories: { category: string; amount: number }[];
    byGroup: { id: string; name: string; type: string; amount: number }[];
  };
  prevMonth: { start: string; income: number; expense: number; net: number };
}

interface Trend {
  trend: { month: string; expense: number; income: number }[];
}

function deltaBadge(curr: number, prev: number): { text: string; cls: string } {
  if (prev === 0) {
    if (curr === 0) return { text: "—", cls: "text-neutral-400" };
    return { text: "新", cls: "text-emerald-600" };
  }
  const pct = Math.round(((curr - prev) / prev) * 100);
  if (pct === 0) return { text: "持平", cls: "text-neutral-500" };
  return {
    text: `${pct > 0 ? "+" : ""}${pct}%`,
    cls: pct > 0 ? "text-red-600" : "text-emerald-600",
  };
}

export default function Overview() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["overview"],
    queryFn: () => api<OverviewData>("/v1/liff/overview"),
  });
  const { data: trend } = useQuery({
    queryKey: ["trend", 6],
    queryFn: () => api<Trend>("/v1/liff/trend?months=6"),
  });

  if (isLoading)
    return (
      <div className="pb-24">
        <Header title="總覽" />
        <div className="p-4 text-neutral-500">載入中…</div>
      </div>
    );
  if (error || !data)
    return (
      <div className="pb-24">
        <Header title="總覽" />
        <div className="p-4">
          <ErrorBox onRetry={() => refetch()} error={error as Error} />
        </div>
      </div>
    );

  const expDelta = deltaBadge(data.thisMonth.expense, data.prevMonth.expense);
  const incDelta = deltaBadge(data.thisMonth.income, data.prevMonth.income);
  const catMax = Math.max(...data.thisMonth.topCategories.map((c) => c.amount), 1);
  const groupMax = Math.max(...data.thisMonth.byGroup.map((g) => g.amount), 1);
  const trendHasData =
    !!trend && trend.trend.some((t) => t.expense > 0 || t.income > 0);

  return (
    <div className="pb-24">
      <Header title="總覽" />
      <div className="p-4 space-y-4">
        <section className="card space-y-3">
          <div className="text-xs text-neutral-500">淨資產</div>
          <div
            className={`font-mono text-3xl font-bold ${
              data.netWorth >= 0 ? "text-neutral-900" : "text-red-600"
            }`}
          >
            {fmtMoney(data.netWorth)}
          </div>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="rounded-xl bg-emerald-50 p-3">
              <div className="text-[11px] text-emerald-700">資產</div>
              <div className="font-mono text-emerald-700 font-semibold">
                {fmtMoney(data.assets)}
              </div>
            </div>
            <div className="rounded-xl bg-red-50 p-3">
              <div className="text-[11px] text-red-700">負債</div>
              <div className="font-mono text-red-700 font-semibold">
                {fmtMoney(data.debts)}
              </div>
            </div>
          </div>
        </section>

        <section className="card space-y-3">
          <div className="text-sm font-medium text-neutral-700">
            本月 vs 上月
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-[11px] text-neutral-500">支出</div>
              <div className="font-mono text-base text-red-600 font-semibold">
                {fmtMoney(data.thisMonth.expense)}
              </div>
              <div className={`text-[10px] ${expDelta.cls}`}>{expDelta.text}</div>
            </div>
            <div>
              <div className="text-[11px] text-neutral-500">收入</div>
              <div className="font-mono text-base text-emerald-600 font-semibold">
                {fmtMoney(data.thisMonth.income)}
              </div>
              <div className={`text-[10px] ${incDelta.cls}`}>{incDelta.text}</div>
            </div>
            <div>
              <div className="text-[11px] text-neutral-500">淨</div>
              <div
                className={`font-mono text-base font-semibold ${
                  data.thisMonth.net >= 0 ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {fmtMoney(data.thisMonth.net)}
              </div>
            </div>
          </div>
        </section>

        {trendHasData && (
          <section className="card space-y-3">
            <div className="text-sm font-medium text-neutral-700">
              月度趨勢（近 6 個月）
            </div>
            {(() => {
              const max = Math.max(
                ...trend!.trend.flatMap((t) => [t.expense, t.income]),
                1,
              );
              return (
                <>
                  <div className="flex items-end gap-2" style={{ height: 180 }}>
                    {trend!.trend.map((t) => {
                      const ePct = Math.round((t.expense / max) * 100);
                      const iPct = Math.round((t.income / max) * 100);
                      return (
                        <div
                          key={t.month}
                          className="flex-1 flex flex-col items-center gap-1"
                        >
                          <div className="flex-1 w-full flex items-end justify-center gap-0.5">
                            <div
                              className="w-1/2 bg-red-400 rounded-t-md"
                              style={{ height: `${ePct}%` }}
                              title={`支出 ${fmtMoney(t.expense)}`}
                            />
                            <div
                              className="w-1/2 bg-emerald-400 rounded-t-md"
                              style={{ height: `${iPct}%` }}
                              title={`收入 ${fmtMoney(t.income)}`}
                            />
                          </div>
                          <div className="text-[10px] text-neutral-500">
                            {t.month.slice(5)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-neutral-500">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-red-400 rounded-sm" /> 支出
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-emerald-400 rounded-sm" /> 收入
                    </span>
                  </div>
                </>
              );
            })()}
          </section>
        )}

        {data.thisMonth.topCategories.length > 0 && (
          <section className="card space-y-3">
            <div className="text-sm font-medium text-neutral-700">分類支出</div>
            <div className="space-y-2">
              {data.thisMonth.topCategories.map((c) => {
                const pct = Math.max(2, Math.round((c.amount / catMax) * 100));
                return (
                  <div key={c.category} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-700">{c.category}</span>
                      <span className="font-mono">{fmtMoney(c.amount)}</span>
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
          </section>
        )}

        {data.thisMonth.byGroup.length > 0 && (
          <section className="card space-y-3">
            <div className="text-sm font-medium text-neutral-700">群組分佈</div>
            <div className="space-y-2">
              {data.thisMonth.byGroup.map((g) => {
                const pct = Math.max(2, Math.round((g.amount / groupMax) * 100));
                return (
                  <Link
                    key={g.id}
                    to={`/group/${g.id}`}
                    className="block space-y-1 active:opacity-70"
                  >
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-700">
                        {g.name}{" "}
                        <span className="chip ml-1">
                          {groupTypeLabel(g.type)}
                        </span>
                      </span>
                      <span className="font-mono">{fmtMoney(g.amount)}</span>
                    </div>
                    <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <section className="card space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-neutral-700">帳戶分佈</div>
            <Link to="/accounts" className="text-xs text-emerald-600">
              管理 →
            </Link>
          </div>
          <ul className="divide-y divide-neutral-100 -mx-2">
            {data.accounts.map((a) => (
              <Link
                key={a.id}
                to={`/accounts/${a.id}`}
                className="flex items-center justify-between px-2 py-2.5 active:bg-neutral-50 rounded-lg"
              >
                <div className="text-sm flex items-center gap-2">
                  <span>{a.name}</span>
                  {a.isShared && <span className="chip">分享</span>}
                  <span className="chip">{a.type}</span>
                </div>
                <span
                  className={`font-mono text-sm ${
                    a.balance < 0 ? "text-red-600" : ""
                  }`}
                >
                  {fmtMoney(a.balance)}
                </span>
              </Link>
            ))}
            {data.accounts.length === 0 && (
              <li className="text-sm text-neutral-400 text-center py-4">
                尚無帳戶
              </li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
