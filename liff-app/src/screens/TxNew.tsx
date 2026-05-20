import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "../liff";
import SplitEditor from "./SplitEditor";
import Header from "../components/Header";

interface Account {
  id: string;
  name: string;
  type: string;
}

interface Group {
  id: string;
  name: string;
}

interface GroupDetail {
  group: {
    id: string;
    type?: string;
    defaultSplit?: "equal" | "custom";
    fundAccountId?: string | null;
  };
  members: { userId: string; displayName: string }[];
}

interface Split {
  userId: string;
  amount: number;
}

function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function TxNew() {
  const { groupId: groupIdParam } = useParams<{ groupId?: string }>();
  const [searchParams] = useSearchParams();
  const prefillText = searchParams.get("text") ?? "";
  const prefillAmount = searchParams.get("amount") ?? "";
  const prefillCategory = searchParams.get("category") ?? "";
  const from = searchParams.get("from");
  const nav = useNavigate();
  const qc = useQueryClient();

  const [continuous, setContinuous] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const { data: meData } = useQuery({
    queryKey: ["me"],
    queryFn: () =>
      api<{ accounts: Account[]; groups: Group[] }>("/v1/liff/me"),
  });

  const [groupId, setGroupId] = useState(groupIdParam ?? "");
  const [amount, setAmount] = useState(
    prefillAmount && !Number.isNaN(Number(prefillAmount)) ? prefillAmount : "",
  );
  const [txDate, setTxDate] = useState(today());
  const [category, setCategory] = useState(prefillCategory);
  const [accountId, setAccountId] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [note, setNote] = useState(prefillText);
  const [splits, setSplits] = useState<Split[]>([]);

  const { data: groupDetail } = useQuery({
    queryKey: ["group", groupId, "detail"],
    queryFn: async () => {
      try {
        return await api<GroupDetail>(`/v1/groups/${groupId}`);
      } catch {
        return null;
      }
    },
    enabled: !!groupId,
  });

  const isShared = groupDetail?.group?.type === "shared";
  const isFund = groupDetail?.group?.type === "fund";
  const fundAccountId = groupDetail?.group?.fundAccountId ?? null;

  useEffect(() => {
    if (isFund && fundAccountId) setAccountId(fundAccountId);
  }, [isFund, fundAccountId]);

  const members = useMemo(
    () => groupDetail?.members ?? [],
    [groupDetail?.members],
  );
  const defaultMethod = groupDetail?.group?.defaultSplit ?? "equal";

  useEffect(() => {
    if (!isShared || members.length === 0) {
      setSplits([]);
      return;
    }
    const total = Number(amount) || 0;
    if (defaultMethod === "equal") {
      const each = Math.floor((total * 100) / members.length) / 100;
      const next = members.map((m) => ({ userId: m.userId, amount: each }));
      const sum = next.reduce((s, r) => s + r.amount, 0);
      const diff = Math.round((total - sum) * 100) / 100;
      if (next.length > 0) {
        const last = next[next.length - 1]!;
        last.amount = Math.round((last.amount + diff) * 100) / 100;
      }
      setSplits(next);
    } else {
      setSplits((prev) =>
        members.map(
          (m) =>
            prev.find((p) => p.userId === m.userId) ?? {
              userId: m.userId,
              amount: 0,
            },
        ),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isShared, members, amount, defaultMethod]);

  const create = useMutation({
    mutationFn: () =>
      api<{ tx: { id: string } }>("/v1/transactions", {
        method: "POST",
        body: JSON.stringify({
          groupId,
          accountId,
          amount: Number(amount),
          txDate,
          category: category || null,
          kind: isFund ? (kind === "income" ? "fund_in" : "fund_out") : kind,
          note: note || null,
          ...(isShared && splits.length > 0 ? { splits } : {}),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions", groupId] });
      qc.invalidateQueries({ queryKey: ["group", groupId, "balances"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      if (continuous) {
        setAmount("");
        setCategory("");
        setNote("");
        setToast("✓ 已新增, 繼續記下一筆");
        setTimeout(() => setToast(null), 1500);
      } else {
        nav(`/group/${groupId}/tx`);
      }
    },
  });

  const canSubmit =
    !!groupId && !!accountId && !!amount && Number(amount) > 0 && !!txDate;

  return (
    <div className="pb-24">
      <Header title="新增交易" back={from ? decodeURIComponent(from) : undefined} />
      <div className="p-4 space-y-4">

      {!groupIdParam && (
        <label className="block">
          <div className="text-sm text-neutral-500 mb-1">群組</div>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="w-full p-2 border rounded bg-white"
          >
            <option value="">請選擇</option>
            {meData?.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block">
        <div className="text-sm text-neutral-500 mb-1">類型</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setKind("expense")}
            className={`flex-1 py-2 rounded font-medium ${
              kind === "expense"
                ? "bg-neutral-900 text-white"
                : "bg-white border text-neutral-600"
            }`}
          >
            支出
          </button>
          <button
            type="button"
            onClick={() => setKind("income")}
            className={`flex-1 py-2 rounded font-medium ${
              kind === "income"
                ? "bg-emerald-600 text-white"
                : "bg-white border text-neutral-600"
            }`}
          >
            收入
          </button>
        </div>
      </label>

      <label className="block">
        <div className="text-sm text-neutral-500 mb-1">金額</div>
        <input
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full p-2 border rounded"
          placeholder="0"
        />
      </label>

      <label className="block">
        <div className="text-sm text-neutral-500 mb-1">日期</div>
        <input
          type="date"
          value={txDate}
          onChange={(e) => setTxDate(e.target.value)}
          className="w-full p-2 border rounded"
        />
      </label>

      <label className="block">
        <div className="text-sm text-neutral-500 mb-1">分類</div>
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full p-2 border rounded"
          placeholder="餐飲、交通…"
        />
      </label>

      {isShared && members.length > 0 && (
        <section className="space-y-2">
          <div className="text-sm text-neutral-500">分帳</div>
          <SplitEditor
            members={members}
            total={Number(amount) || 0}
            value={splits}
            onChange={setSplits}
            method={defaultMethod}
          />
        </section>
      )}

      {!isFund && (
        <label className="block">
          <div className="text-sm text-neutral-500 mb-1">帳戶</div>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full p-2 border rounded bg-white"
          >
            <option value="">請選擇</option>
            {meData?.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {isFund && (
        <div className="text-xs text-neutral-500">
          基金模式：自動使用「共同基金 池」帳戶
        </div>
      )}

      <label className="block">
        <div className="text-sm text-neutral-500 mb-1">備註</div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full p-2 border rounded"
          rows={3}
        />
      </label>

      {create.isError && (
        <div className="text-sm text-red-600">儲存失敗，請重試</div>
      )}

      <label className="flex items-center gap-2 text-sm text-neutral-600">
        <input
          type="checkbox"
          checked={continuous}
          onChange={(e) => setContinuous(e.target.checked)}
          className="w-4 h-4"
        />
        儲存後繼續新增
      </label>

      <div className="flex gap-2 pt-2">
        <button
          onClick={() => nav(-1)}
          className="px-4 py-2 border rounded"
        >
          取消
        </button>
        <button
          onClick={() => create.mutate()}
          disabled={!canSubmit || create.isPending}
          className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded font-medium disabled:opacity-50"
        >
          {create.isPending ? "儲存中…" : "儲存"}
        </button>
      </div>
      </div>
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-neutral-800 text-white px-4 py-2 rounded-full shadow-lg z-40">
          {toast}
        </div>
      )}
    </div>
  );
}
