import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../liff";
import Header from "../components/Header";

interface Recurring {
  id: string;
  groupId: string;
  accountId: string;
  amount: string;
  kind: "expense" | "income";
  category: string | null;
  note: string | null;
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  anchorDay: number | null;
  startDate: string;
  endDate: string | null;
  nextRunDate: string;
  lastRunDate: string | null;
  active: boolean;
}

interface Account {
  id: string;
  name: string;
}
interface Group {
  id: string;
  name: string;
  type?: string;
}

const freqLabel: Record<Recurring["frequency"], string> = {
  daily: "每日",
  weekly: "每週",
  monthly: "每月",
  yearly: "每年",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Recurring() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data } = useQuery({
    queryKey: ["recurring"],
    queryFn: () => api<{ recurring: Recurring[] }>("/v1/recurring"),
  });

  const { data: meData } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ accounts: Account[]; groups: Group[] }>("/v1/liff/me"),
  });

  const personalGroups = (meData?.groups ?? []).filter((g) => g.type !== "fund");

  const [groupId, setGroupId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [frequency, setFrequency] = useState<Recurring["frequency"]>("monthly");
  const [anchorDay, setAnchorDay] = useState<string>("1");
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api<{ recurring: Recurring }>("/v1/recurring", {
        method: "POST",
        body: JSON.stringify({
          groupId,
          accountId,
          amount: Number(amount),
          kind,
          category: category || null,
          note: note || null,
          frequency,
          anchorDay:
            frequency === "monthly" || frequency === "weekly" || frequency === "yearly"
              ? Number(anchorDay)
              : null,
          startDate,
          endDate: endDate || null,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring"] });
      setShowForm(false);
      setAmount("");
      setCategory("");
      setNote("");
    },
  });

  const toggle = useMutation({
    mutationFn: (r: Recurring) =>
      api(`/v1/recurring/${r.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !r.active }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring"] }),
  });

  const runNow = useMutation({
    mutationFn: (id: string) => api(`/v1/recurring/${id}/run`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring"] }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api(`/v1/recurring/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring"] }),
  });

  const accountById = new Map((meData?.accounts ?? []).map((a) => [a.id, a.name]));
  const groupById = new Map(personalGroups.map((g) => [g.id, g.name]));

  const canSubmit = !!groupId && !!accountId && Number(amount) > 0 && !!startDate;

  return (
    <div className="pb-24">
      <Header title="定期定額" />
      <div className="p-4 space-y-3">
        {!showForm && (
          <button
            onClick={() => {
              if (personalGroups[0]) setGroupId(personalGroups[0].id);
              if (meData?.accounts[0]) setAccountId(meData.accounts[0].id);
              setShowForm(true);
            }}
            className="w-full px-4 py-2 bg-emerald-600 text-white rounded font-medium"
          >
            + 新增規律性交易
          </button>
        )}

        {showForm && (
          <div className="bg-white rounded-lg shadow p-4 space-y-3">
            <label className="block">
              <div className="text-sm text-neutral-500 mb-1">群組</div>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full p-2 border rounded bg-white"
              >
                <option value="">選擇群組</option>
                {personalGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <div className="text-sm text-neutral-500 mb-1">帳戶</div>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full p-2 border rounded bg-white"
              >
                <option value="">選擇帳戶</option>
                {(meData?.accounts ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <div className="text-sm text-neutral-500 mb-1">類型</div>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as "expense" | "income")}
                  className="w-full p-2 border rounded bg-white"
                >
                  <option value="expense">支出</option>
                  <option value="income">收入</option>
                </select>
              </label>
              <label className="block">
                <div className="text-sm text-neutral-500 mb-1">金額</div>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full p-2 border rounded"
                />
              </label>
            </div>

            <label className="block">
              <div className="text-sm text-neutral-500 mb-1">分類</div>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="例: 房租 / 訂閱"
                className="w-full p-2 border rounded"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <div className="text-sm text-neutral-500 mb-1">頻率</div>
                <select
                  value={frequency}
                  onChange={(e) =>
                    setFrequency(e.target.value as Recurring["frequency"])
                  }
                  className="w-full p-2 border rounded bg-white"
                >
                  <option value="daily">每日</option>
                  <option value="weekly">每週</option>
                  <option value="monthly">每月</option>
                  <option value="yearly">每年</option>
                </select>
              </label>
              {frequency !== "daily" && (
                <label className="block">
                  <div className="text-sm text-neutral-500 mb-1">
                    {frequency === "weekly"
                      ? "週幾 (0=日)"
                      : frequency === "monthly"
                        ? "日 (1-31)"
                        : "月份 (1-12)"}
                  </div>
                  <input
                    type="number"
                    value={anchorDay}
                    onChange={(e) => setAnchorDay(e.target.value)}
                    className="w-full p-2 border rounded"
                  />
                </label>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <div className="text-sm text-neutral-500 mb-1">開始日</div>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full p-2 border rounded"
                />
              </label>
              <label className="block">
                <div className="text-sm text-neutral-500 mb-1">結束日 (選填)</div>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full p-2 border rounded"
                />
              </label>
            </div>

            <label className="block">
              <div className="text-sm text-neutral-500 mb-1">備註</div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full p-2 border rounded"
              />
            </label>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-neutral-600 border rounded"
              >
                取消
              </button>
              <button
                onClick={() => create.mutate()}
                disabled={!canSubmit || create.isPending}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded font-medium disabled:opacity-50"
              >
                {create.isPending ? "建立中…" : "建立"}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {(data?.recurring ?? []).map((r) => (
            <div key={r.id} className="bg-white rounded-lg shadow p-3 space-y-1">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium">
                    {r.category ?? r.note ?? "未命名"}{" "}
                    <span className="text-xs text-neutral-500">
                      {r.kind === "expense" ? "支出" : "收入"}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {groupById.get(r.groupId) ?? r.groupId.slice(0, 6)} ·{" "}
                    {accountById.get(r.accountId) ?? r.accountId.slice(0, 6)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold">
                    NT${Number(r.amount).toLocaleString("zh-TW")}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {freqLabel[r.frequency]}
                    {r.anchorDay != null ? ` / ${r.anchorDay}` : ""}
                  </div>
                </div>
              </div>
              <div className="text-xs text-neutral-500">
                下次: {r.nextRunDate}
                {r.endDate ? ` · 截止 ${r.endDate}` : ""}
                {!r.active ? " · 已停用" : ""}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => runNow.mutate(r.id)}
                  className="text-xs px-2 py-1 border rounded text-emerald-600"
                >
                  立即執行
                </button>
                <button
                  onClick={() => toggle.mutate(r)}
                  className="text-xs px-2 py-1 border rounded"
                >
                  {r.active ? "停用" : "啟用"}
                </button>
                <button
                  onClick={() => {
                    if (confirm("刪除這筆規律性交易?")) del.mutate(r.id);
                  }}
                  className="text-xs px-2 py-1 border rounded text-red-600 ml-auto"
                >
                  刪除
                </button>
              </div>
            </div>
          ))}
          {data?.recurring.length === 0 && (
            <div className="text-center text-neutral-500 py-8 text-sm">
              還沒有規律性交易
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
