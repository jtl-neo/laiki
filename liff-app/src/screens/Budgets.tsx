import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../liff";
import { fmtMoney } from "../lib/format";

interface Budget {
  id: string;
  groupId: string | null;
  category: string | null;
  monthlyLimit: string;
  spent: number;
  percent: number;
}

interface BudgetsResp {
  budgets: Budget[];
}

export default function Budgets() {
  const qc = useQueryClient();
  const [category, setCategory] = useState("");
  const [monthlyLimit, setMonthlyLimit] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["budgets"],
    queryFn: () => api<BudgetsResp>("/v1/budgets"),
  });

  const add = useMutation({
    mutationFn: () =>
      api<{ budget: Budget }>("/v1/budgets", {
        method: "POST",
        body: JSON.stringify({
          category: category.trim() || null,
          monthlyLimit: Number(monthlyLimit),
        }),
      }),
    onSuccess: () => {
      setCategory("");
      setMonthlyLimit("");
      void qc.invalidateQueries({ queryKey: ["budgets"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/v1/budgets/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["budgets"] });
    },
  });

  return (
    <div className="p-4 space-y-6 pb-24">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold">預算</h1>
        <Link to="/settings" className="text-sm text-neutral-500">設定</Link>
      </header>

      <section className="bg-white rounded-lg p-3 shadow-sm space-y-2">
        <h2 className="text-sm text-neutral-500">新增預算</h2>
        <input
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="分類 (留空 = 全部)"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <input
          className="w-full border rounded px-3 py-2 text-sm"
          type="number"
          placeholder="每月上限"
          value={monthlyLimit}
          onChange={(e) => setMonthlyLimit(e.target.value)}
        />
        <button
          type="button"
          disabled={!monthlyLimit || add.isPending}
          onClick={() => add.mutate()}
          className="w-full bg-emerald-500 text-white rounded py-2 disabled:bg-neutral-300"
        >
          {add.isPending ? "新增中…" : "新增"}
        </button>
      </section>

      {isLoading && <div className="text-neutral-500">載入中…</div>}

      <ul className="space-y-3">
        {data?.budgets.map((b) => {
          const pct = Math.min(100, Math.round(b.percent * 100));
          const over = b.percent > 1;
          const warn = b.percent > 0.8;
          const color = over ? "bg-red-500" : warn ? "bg-amber-500" : "bg-emerald-500";
          return (
            <li key={b.id} className="bg-white rounded-lg p-3 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-medium">{b.category ?? "全部分類"}</div>
                <button
                  type="button"
                  onClick={() => remove.mutate(b.id)}
                  className="text-xs text-red-500"
                >
                  刪除
                </button>
              </div>
              <div className="flex justify-between text-xs text-neutral-500 font-mono">
                <span>{fmtMoney(b.spent)}</span>
                <span>{fmtMoney(Number(b.monthlyLimit))}</span>
              </div>
              <div className="h-2 bg-neutral-100 rounded overflow-hidden">
                <div
                  className={`h-full ${color}`}
                  style={{ width: `${Math.max(2, pct)}%` }}
                />
              </div>
              <div className="text-xs text-neutral-500">{pct}%</div>
            </li>
          );
        })}
        {data?.budgets.length === 0 && (
          <li className="text-sm text-neutral-400">尚未設定預算</li>
        )}
      </ul>
    </div>
  );
}
