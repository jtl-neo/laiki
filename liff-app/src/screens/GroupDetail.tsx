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

interface Friend {
  userId: string;
  displayName: string | null;
  isVirtual: boolean;
  outstanding: number;
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
  const [showAddMember, setShowAddMember] = useState(false);
  const [newFriendName, setNewFriendName] = useState("");
  const [pinInfo, setPinInfo] = useState<{ name: string; pin: string } | null>(null);

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

  const { data: friendsData } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api<{ friends: Friend[] }>("/v1/liff/friends"),
    enabled: showAddMember,
  });

  const addMemberMut = useMutation({
    mutationFn: (targetUserId: string) =>
      api<{ member: unknown }>(`/v1/groups/${groupId}/members`, {
        method: "POST",
        body: JSON.stringify({ userId: targetUserId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group", groupId, "detail"] }),
  });

  const removeMemberMut = useMutation({
    mutationFn: (targetUserId: string) =>
      api<{ ok: boolean }>(`/v1/groups/${groupId}/members/${targetUserId}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group", groupId, "detail"] }),
  });

  const createFriendMut = useMutation({
    mutationFn: (friendName: string) =>
      api<{ friend: Friend }>("/v1/liff/friends", {
        method: "POST",
        body: JSON.stringify({ name: friendName }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["friends"] });
      setNewFriendName("");
    },
  });

  const pinMut = useMutation({
    mutationFn: (friend: Friend) =>
      api<{ pin: string }>(`/v1/liff/friends/${friend.userId}/pin`, { method: "POST" }).then(
        (r) => ({ name: friend.displayName ?? "好友", pin: r.pin }),
      ),
    onSuccess: (info) => setPinInfo(info),
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
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm text-neutral-500">成員</h2>
          {isOwner && (
            <button
              onClick={() => setShowAddMember(true)}
              className="text-sm text-emerald-600 font-medium"
            >
              ＋ 新增成員
            </button>
          )}
        </div>
        <ul className="space-y-2">
          {groupData.members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between bg-white rounded-lg p-3 shadow-sm"
            >
              <div className="font-medium">{m.displayName ?? "(未命名)"}</div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-neutral-500">
                  {m.role === "owner" ? "擁有者" : "成員"}
                </div>
                {isOwner && m.role !== "owner" && (
                  <button
                    onClick={() => removeMemberMut.mutate(m.userId)}
                    disabled={removeMemberMut.isPending}
                    className="text-xs text-red-500 px-2 py-1 border border-red-200 rounded disabled:opacity-50"
                  >
                    移除
                  </button>
                )}
              </div>
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

      {showAddMember && (
        <div
          className="fixed inset-0 bg-black/40 flex items-end justify-center z-50"
          onClick={() => setShowAddMember(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-2xl p-4 space-y-3 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-lg">新增成員</h3>
            <p className="text-xs text-neutral-500">
              從你的好友清單挑選。還沒綁定的好友可先加入記帳，再用邀請碼讓對方認領。
            </p>
            {(() => {
              const memberIds = new Set(groupData.members.map((m) => m.userId));
              const candidates = (friendsData?.friends ?? []).filter(
                (f) => !memberIds.has(f.userId),
              );
              if (candidates.length === 0) {
                return (
                  <div className="text-sm text-neutral-500 py-2">
                    沒有可加入的好友了。在下方輸入名字直接建立。
                  </div>
                );
              }
              return (
                <ul className="space-y-2">
                  {candidates.map((f) => (
                    <li
                      key={f.userId}
                      className="flex items-center justify-between bg-neutral-50 rounded-lg p-3"
                    >
                      <div className="text-sm font-medium">
                        {f.displayName ?? "好友"}
                        {f.isVirtual && (
                          <span className="ml-1 text-xs text-amber-600">未綁定</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {f.isVirtual && (
                          <button
                            onClick={() => pinMut.mutate(f)}
                            disabled={pinMut.isPending}
                            className="text-xs px-2 py-1.5 border border-neutral-300 rounded disabled:opacity-50"
                          >
                            邀請碼
                          </button>
                        )}
                        <button
                          onClick={() => addMemberMut.mutate(f.userId)}
                          disabled={addMemberMut.isPending}
                          className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded font-medium disabled:opacity-50"
                        >
                          加入
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              );
            })()}
            <div className="flex gap-2 pt-1">
              <input
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
                placeholder="輸入名字建立新好友（例：小明）"
                value={newFriendName}
                onChange={(e) => setNewFriendName(e.target.value)}
              />
              <button
                onClick={() => {
                  const v = newFriendName.trim();
                  if (v) createFriendMut.mutate(v);
                }}
                disabled={createFriendMut.isPending || !newFriendName.trim()}
                className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                建立
              </button>
            </div>
            <button
              onClick={() => setShowAddMember(false)}
              className="w-full px-4 py-2 bg-neutral-200 rounded font-medium"
            >
              完成
            </button>
          </div>
        </div>
      )}

      {pinInfo && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4"
          onClick={() => setPinInfo(null)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-3 shadow-xl text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-base">{pinInfo.name} 的綁定邀請碼</h3>
            <div className="text-3xl font-mono font-bold tracking-widest text-emerald-600">
              {pinInfo.pin}
            </div>
            <p className="text-xs text-neutral-500">
              請對方加入 Laiki 官方帳號，直接在聊天室輸入這組數字，即可認領過去的帳目。24
              小時內有效。
            </p>
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(
                  `加入 Laiki 記帳機器人，輸入綁定碼 ${pinInfo.pin} 就能看到我們的分帳紀錄！`,
                );
                setPinInfo(null);
              }}
              className="w-full px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium"
            >
              複製邀請訊息
            </button>
            <button
              onClick={() => setPinInfo(null)}
              className="w-full px-4 py-2 bg-neutral-200 rounded-lg font-medium"
            >
              關閉
            </button>
          </div>
        </div>
      )}

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
