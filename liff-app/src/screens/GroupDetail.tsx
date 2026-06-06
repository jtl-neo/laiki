import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../liff";
import ErrorBox from "../components/ErrorBox";
import Header from "../components/Header";
import Confirm from "../components/Confirm";

interface Member {
  userId: string;
  displayName: string | null;
  role: string;
}

interface Group {
  id: string;
  name: string;
  type: string;
  currency: string;
  ownerUserId: string;
}

interface MeResp {
  user: { id: string };
}

interface Balance {
  userId: string;
  displayName: string | null;
  net: number | string;
}

interface Transfer {
  fromUserId: string;
  fromName: string | null;
  toUserId: string;
  toName: string | null;
  amount: number;
}

export default function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [showSettle, setShowSettle] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const { data: groupData, isLoading, error, refetch } = useQuery({
    queryKey: ["group", groupId, "detail"],
    queryFn: () => api<{ group: Group; members: Member[] }>(`/v1/groups/${groupId}`),
    enabled: !!groupId,
  });

  const { data: meData } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<MeResp>("/v1/liff/me"),
  });

  const renameMut = useMutation({
    mutationFn: (name: string) =>
      api<{ group: Group }>(`/v1/groups/${groupId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group", groupId, "detail"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      setEditing(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api<{ ok: boolean }>(`/v1/groups/${groupId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["groups"] });
      nav("/groups", { replace: true });
    },
  });

  const leaveMut = useMutation({
    mutationFn: () =>
      api<{ ok: boolean }>(`/v1/groups/${groupId}/leave`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["groups"] });
      nav("/groups", { replace: true });
    },
  });

  const { data: balData } = useQuery({
    queryKey: ["group", groupId, "balances"],
    queryFn: () => api<{ balances: Balance[] }>(`/v1/groups/${groupId}/balances`),
    enabled: !!groupId,
  });

  const { data: settleData, refetch: refetchSettle } = useQuery({
    queryKey: ["group", groupId, "settle"],
    queryFn: () => api<{ transfers: Transfer[] }>(`/v1/groups/${groupId}/settle`),
    enabled: false,
  });

  const onSettle = async () => {
    await refetchSettle();
    setShowSettle(true);
  };

  if (isLoading) return <div className="p-4 text-neutral-500">載入中…</div>;
  if (!groupData) return <ErrorBox onRetry={() => refetch()} error={error as Error} />;

  const isOwner = !!meData && groupData.group.ownerUserId === meData.user.id;

  return (
    <div className="pb-24">
      <Header title={groupData.group.name} />
      <div className="p-4 space-y-6">
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <input
              className="flex-1 border rounded px-2 py-1 text-sm"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              autoFocus
            />
            <button
              onClick={() => {
                const v = nameDraft.trim();
                if (v && v !== groupData.group.name) renameMut.mutate(v);
                else setEditing(false);
              }}
              disabled={renameMut.isPending}
              className="px-3 py-1 bg-emerald-600 text-white rounded text-sm font-medium disabled:opacity-50"
            >
              儲存
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-3 py-1 bg-neutral-200 rounded text-sm"
            >
              取消
            </button>
          </>
        ) : (
          <>
            <div className="text-base font-medium flex-1">{groupData.group.name}</div>
            {isOwner && (
              <button
                aria-label="編輯群組名稱"
                onClick={() => {
                  setNameDraft(groupData.group.name);
                  setEditing(true);
                }}
                className="text-neutral-500 hover:text-neutral-800 text-sm px-2"
              >
                ✎
              </button>
            )}
          </>
        )}
      </div>
      <div className="text-xs text-neutral-500">{groupData.group.type}</div>

      <section>
        <h2 className="text-sm text-neutral-500 mb-2">成員</h2>
        <ul className="space-y-2">
          {groupData.members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between bg-white rounded-lg p-3 shadow-sm"
            >
              <div className="font-medium">{m.displayName ?? "(未命名)"}</div>
              <div className="text-xs text-neutral-500">{m.role}</div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-sm text-neutral-500 mb-2">餘額</h2>
        <ul className="space-y-2">
          {balData?.balances.map((b) => {
            const net = Number(b.net);
            return (
              <li
                key={b.userId}
                className="flex items-center justify-between bg-white rounded-lg p-3 shadow-sm"
              >
                <div className="font-medium">{b.displayName ?? "(未命名)"}</div>
                <div
                  className={`font-mono ${
                    net > 0 ? "text-emerald-600" : net < 0 ? "text-red-600" : "text-neutral-500"
                  }`}
                >
                  {net >= 0 ? "+" : ""}
                  {net.toLocaleString("zh-TW")}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid grid-cols-3 gap-2">
        <Link
          to={`/group/${groupId}/tx`}
          className="px-3 py-2 bg-white border rounded text-center text-sm"
        >
          交易列表
        </Link>
        <button
          onClick={() => nav(`/group/${groupId}/tx/new`)}
          className="px-3 py-2 bg-emerald-600 text-white rounded text-sm font-medium"
        >
          新增交易
        </button>
        <button
          onClick={onSettle}
          className="px-3 py-2 bg-indigo-600 text-white rounded text-sm font-medium"
        >
          結算
        </button>
      </div>

      <section className="pt-2">
        {isOwner ? (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={deleteMut.isPending}
            className="w-full px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            刪除群組
          </button>
        ) : (
          <button
            onClick={() => setConfirmLeave(true)}
            disabled={leaveMut.isPending}
            className="w-full px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            離開群組
          </button>
        )}
        {(deleteMut.isError || leaveMut.isError) && (
          <p className="text-xs text-red-600 mt-2">操作失敗，請稍後再試。</p>
        )}
      </section>

      <Confirm
        open={confirmDelete}
        title="刪除群組？"
        message={`「${groupData.group.name}」與其所有交易紀錄將永久刪除${
          groupData.group.type === "fund" ? "，基金池帳戶也會一併移除" : ""
        }。此操作無法復原。`}
        confirmLabel="永久刪除"
        danger
        onConfirm={() => {
          setConfirmDelete(false);
          deleteMut.mutate();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
      <Confirm
        open={confirmLeave}
        title="離開群組？"
        message={`離開「${groupData.group.name}」後將看不到群組內容，需由擁有者重新加入。`}
        confirmLabel="離開"
        danger
        onConfirm={() => {
          setConfirmLeave(false);
          leaveMut.mutate();
        }}
        onCancel={() => setConfirmLeave(false)}
      />

      {showSettle && (
        <div
          className="fixed inset-0 bg-black/40 flex items-end justify-center z-50"
          onClick={() => setShowSettle(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-2xl p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-lg">最少轉帳建議</h3>
            {settleData?.transfers.length === 0 && (
              <div className="text-neutral-500 text-sm">已結清</div>
            )}
            <ul className="space-y-2">
              {settleData?.transfers.map((t, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between bg-neutral-50 rounded-lg p-3"
                >
                  <div className="text-sm">
                    <span className="font-medium">{t.fromName ?? "?"}</span>
                    <span className="mx-2 text-neutral-400">→</span>
                    <span className="font-medium">{t.toName ?? "?"}</span>
                  </div>
                  <div className="font-mono">
                    NT${Number(t.amount).toLocaleString("zh-TW")}
                  </div>
                </li>
              ))}
            </ul>
            <button
              onClick={() => setShowSettle(false)}
              className="w-full px-4 py-2 bg-neutral-200 rounded font-medium"
            >
              關閉
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
