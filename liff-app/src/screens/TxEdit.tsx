import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, liff } from "../liff";
import SplitEditor from "./SplitEditor";
import Header from "../components/Header";

interface Split {
  userId: string;
  amount: number;
  displayName?: string;
}

interface Tx {
  id: string;
  amount: string;
  txDate: string;
  category: string | null;
  note: string | null;
  accountId: string;
  groupId: string;
  kind: string;
  splits?: Split[] | null;
}

interface GroupDetail {
  group: { id: string; type?: string };
  members: { userId: string; displayName: string }[];
}

interface Account {
  id: string;
  name: string;
  type: string;
}

export default function TxEdit() {
  const { txId } = useParams<{ txId: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const from = searchParams.get("from");

  const goBack = () => {
    if (from) nav(decodeURIComponent(from));
    else nav(-1);
  };

  const { data: txData } = useQuery({
    queryKey: ["tx", txId],
    queryFn: () => api<{ tx: Tx }>(`/v1/transactions/${txId}`),
    enabled: !!txId,
  });

  const { data: meData } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ accounts: Account[] }>("/v1/liff/me"),
  });

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [accountId, setAccountId] = useState("");
  const [txDate, setTxDate] = useState("");
  const [splits, setSplits] = useState<Split[]>([]);

  const groupId = txData?.tx.groupId;
  const hasSplits = !!(txData?.tx.splits && txData.tx.splits.length > 0);

  const { data: groupDetail } = useQuery({
    queryKey: ["group", groupId, "detail"],
    queryFn: async () => {
      try {
        return await api<GroupDetail>(`/v1/groups/${groupId}`);
      } catch {
        return null;
      }
    },
    enabled: !!groupId && hasSplits,
  });

  useEffect(() => {
    if (txData?.tx) {
      setAmount(txData.tx.amount);
      setCategory(txData.tx.category ?? "");
      setNote(txData.tx.note ?? "");
      setAccountId(txData.tx.accountId);
      setTxDate(txData.tx.txDate);
      if (txData.tx.splits) {
        setSplits(
          txData.tx.splits.map((s) => ({
            userId: s.userId,
            amount: Number(s.amount),
          })),
        );
      }
    }
  }, [txData]);

  const save = useMutation({
    mutationFn: () =>
      api<{ tx: Tx }>(`/v1/transactions/${txId}`, {
        method: "PATCH",
        body: JSON.stringify({
          amount: Number(amount),
          category: category || null,
          note: note || null,
          accountId,
          txDate,
          ...(hasSplits && splits.length > 0 ? { splits } : {}),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      if (liff.isInClient() && !from) liff.closeWindow();
      else goBack();
    },
  });

  const del = useMutation({
    mutationFn: () => api(`/v1/transactions/${txId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      if (liff.isInClient() && !from) liff.closeWindow();
      else goBack();
    },
  });

  if (!txData) return <div className="p-4 text-neutral-500">載入中…</div>;

  return (
    <div className="pb-24">
      <Header title="編輯交易" back={from ? decodeURIComponent(from) : undefined} />
      <div className="p-4 space-y-4">

      <label className="block">
        <div className="text-sm text-neutral-500 mb-1">金額</div>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full p-2 border rounded"
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
        <div className="text-sm text-neutral-500 mb-1">帳戶</div>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="w-full p-2 border rounded bg-white"
        >
          {meData?.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <div className="text-sm text-neutral-500 mb-1">分類</div>
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full p-2 border rounded"
        />
      </label>

      {hasSplits && (
        <section className="space-y-2">
          <div className="text-sm text-neutral-500">分帳</div>
          {groupDetail?.members && groupDetail.members.length > 0 ? (
            <SplitEditor
              members={groupDetail.members}
              total={Number(amount) || 0}
              value={splits}
              onChange={setSplits}
              method="custom"
            />
          ) : (
            <ul className="space-y-1">
              {splits.map((s) => (
                <li
                  key={s.userId}
                  className="flex justify-between bg-white rounded-lg p-2 shadow-sm text-sm"
                >
                  <span className="font-mono text-xs truncate">{s.userId}</span>
                  <span className="font-mono">
                    NT${s.amount.toLocaleString("zh-TW")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
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

      <div className="flex gap-2 pt-2">
        <button
          onClick={() => del.mutate()}
          className="px-4 py-2 text-red-600 border border-red-300 rounded"
        >
          刪除
        </button>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded font-medium"
        >
          {save.isPending ? "儲存中…" : "儲存"}
        </button>
      </div>
      </div>
    </div>
  );
}
