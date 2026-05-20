import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../liff";
import Header from "../components/Header";

interface Account {
  id: string;
  name: string;
  type: string;
  balance: string;
}

interface Group {
  id: string;
  name: string;
}

export default function Transfer() {
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data: accData } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<{ accounts: Account[] }>("/v1/accounts"),
  });

  const { data: groupData } = useQuery({
    queryKey: ["groups"],
    queryFn: () => api<{ groups: Group[] }>("/v1/groups"),
  });

  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [txDate, setTxDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [groupId, setGroupId] = useState("");
  const [note, setNote] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (accData?.accounts && accData.accounts.length >= 2 && !fromAccountId) {
      setFromAccountId(accData.accounts[0]!.id);
      setToAccountId(accData.accounts[1]!.id);
    }
  }, [accData, fromAccountId]);

  useEffect(() => {
    if (groupData?.groups && groupData.groups.length > 0 && !groupId) {
      setGroupId(groupData.groups[0]!.id);
    }
  }, [groupData, groupId]);

  const transfer = useMutation({
    mutationFn: () =>
      api("/v1/transfers", {
        method: "POST",
        body: JSON.stringify({
          fromAccountId,
          toAccountId,
          amount: Number(amount),
          txDate,
          note: note || null,
          groupId,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      setToast("轉帳成功");
      setTimeout(() => nav("/dashboard"), 800);
    },
    onError: () => {
      setToast("轉帳失敗");
      setTimeout(() => setToast(null), 1500);
    },
  });

  const canSubmit =
    fromAccountId &&
    toAccountId &&
    fromAccountId !== toAccountId &&
    Number(amount) > 0 &&
    groupId &&
    !transfer.isPending;

  return (
    <div className="pb-24">
      <Header title="轉帳" />
      <div className="p-4 space-y-4">

      <label className="block">
        <div className="text-sm text-neutral-500 mb-1">從</div>
        <select
          value={fromAccountId}
          onChange={(e) => setFromAccountId(e.target.value)}
          className="w-full p-2 border rounded bg-white"
        >
          <option value="">選擇帳戶</option>
          {accData?.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} (NT${Number(a.balance).toLocaleString("zh-TW")})
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <div className="text-sm text-neutral-500 mb-1">到</div>
        <select
          value={toAccountId}
          onChange={(e) => setToAccountId(e.target.value)}
          className="w-full p-2 border rounded bg-white"
        >
          <option value="">選擇帳戶</option>
          {accData?.accounts
            .filter((a) => a.id !== fromAccountId)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} (NT${Number(a.balance).toLocaleString("zh-TW")})
              </option>
            ))}
        </select>
      </label>

      <label className="block">
        <div className="text-sm text-neutral-500 mb-1">金額</div>
        <input
          type="number"
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
        <div className="text-sm text-neutral-500 mb-1">群組</div>
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="w-full p-2 border rounded bg-white"
        >
          <option value="">選擇群組</option>
          {groupData?.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <div className="text-sm text-neutral-500 mb-1">備註</div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full p-2 border rounded"
          rows={2}
        />
      </label>

      <button
        onClick={() => transfer.mutate()}
        disabled={!canSubmit}
        className="w-full px-4 py-2 bg-emerald-600 text-white rounded font-medium disabled:opacity-50"
      >
        {transfer.isPending ? "處理中…" : "確認轉帳"}
      </button>

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-neutral-800 text-white px-4 py-2 rounded-full shadow-lg z-40">
          {toast}
        </div>
      )}
      </div>
    </div>
  );
}
