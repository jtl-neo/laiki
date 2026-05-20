import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { api } from "../liff";
import { fmtDate } from "../lib/format";
import Header from "../components/Header";

interface Tx {
  id: string;
  amount: string;
  txDate: string;
  category: string | null;
  note: string | null;
  accountId: string;
  groupId: string;
  kind: string;
  paidByUserId: string;
}

export default function TxList() {
  const { groupId } = useParams<{ groupId: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const pressTimer = useRef<number | null>(null);

  const personal = !groupId;
  const { data, isLoading } = useQuery({
    queryKey: ["transactions", groupId ?? "all"],
    queryFn: () =>
      api<{ transactions: Tx[] }>(
        groupId ? `/v1/transactions?groupId=${groupId}` : `/v1/transactions`,
      ),
  });

  const delMany = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      await Promise.all(
        ids.map((id) => api(`/v1/transactions/${id}`, { method: "DELETE" })),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      if (groupId) qc.invalidateQueries({ queryKey: ["group", groupId, "balances"] });
      setSelected(new Set());
      setSelectMode(false);
    },
  });

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    if (next.size === 0) setSelectMode(false);
  };

  const onPressStart = (id: string) => {
    pressTimer.current = window.setTimeout(() => {
      setSelectMode(true);
      const next = new Set(selected);
      next.add(id);
      setSelected(next);
    }, 500);
  };

  const onPressEnd = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const onRowClick = (tx: Tx) => {
    if (selectMode) {
      toggle(tx.id);
    } else {
      nav(
        `/tx/${tx.id}/edit?from=${encodeURIComponent(
          groupId ? `/group/${groupId}/tx` : "/tx",
        )}`,
      );
    }
  };

  if (isLoading) return <div className="p-4 text-neutral-500">載入中…</div>;

  return (
    <div className="pb-24">
      <Header
        title={personal ? "全部交易" : "交易明細"}
        back={personal ? "/dashboard" : `/group/${groupId}`}
      />
      <div className="p-4 space-y-3">
      <div className="flex items-center justify-end">
        <button
          onClick={() =>
            nav(personal ? "/tx/new" : `/group/${groupId}/tx/new`)
          }
          className="px-3 py-1 bg-emerald-600 text-white rounded text-sm"
        >
          + 新增
        </button>
      </div>

      <ul className="space-y-2">
        {data?.transactions.map((tx) => {
          const isSel = selected.has(tx.id);
          return (
            <li
              key={tx.id}
              onClick={() => onRowClick(tx)}
              onTouchStart={() => onPressStart(tx.id)}
              onTouchEnd={onPressEnd}
              onMouseDown={() => onPressStart(tx.id)}
              onMouseUp={onPressEnd}
              onMouseLeave={onPressEnd}
              className={`bg-white rounded-lg p-3 shadow-sm flex items-center justify-between ${
                isSel ? "ring-2 ring-emerald-500" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500">{fmtDate(tx.txDate)}</span>
                  {tx.category && (
                    <span className="text-xs bg-neutral-100 px-2 py-0.5 rounded">
                      {tx.category}
                    </span>
                  )}
                </div>
                {tx.note && (
                  <div className="text-sm text-neutral-600 truncate">{tx.note}</div>
                )}
              </div>
              <div
                className={`font-mono ml-3 ${
                  tx.kind === "income" || tx.kind === "fund_in"
                    ? "text-emerald-600"
                    : "text-neutral-900"
                }`}
              >
                {tx.kind === "income" || tx.kind === "fund_in" ? "+" : "-"}
                {Number(tx.amount).toLocaleString("zh-TW")}
              </div>
            </li>
          );
        })}
        {data?.transactions.length === 0 && (
          <li className="text-neutral-500 text-sm p-4 text-center">尚無交易</li>
        )}
      </ul>

      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-16 inset-x-0 bg-white border-t shadow-lg p-3 flex items-center justify-between z-30">
          <div className="text-sm text-neutral-600">已選 {selected.size}</div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setSelected(new Set());
                setSelectMode(false);
              }}
              className="px-3 py-2 text-sm border rounded"
            >
              取消
            </button>
            <button
              onClick={() => delMany.mutate()}
              disabled={delMany.isPending}
              className="px-3 py-2 text-sm bg-red-600 text-white rounded"
            >
              {delMany.isPending ? "刪除中…" : "刪除"}
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
