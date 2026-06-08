import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../liff";
import Header from "../components/Header";
import ErrorBox from "../components/ErrorBox";
import Confirm from "../components/Confirm";
import { fmtMoney } from "../lib/format";

interface Friend {
  userId: string;
  displayName: string | null;
  isVirtual: boolean;
  outstanding: number;
}

interface Debt {
  id: string;
  amount: number;
  note: string | null;
  txDate: string | null;
}

export default function Friends() {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [pin, setPin] = useState<{ name: string; code: string } | null>(null);
  const [confirmSettle, setConfirmSettle] = useState<Friend | null>(null);
  const [newName, setNewName] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api<{ friends: Friend[] }>("/v1/liff/friends"),
  });

  const createMut = useMutation({
    mutationFn: (name: string) =>
      api<{ friend: Friend }>("/v1/liff/friends", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["friends"] });
      setNewName("");
    },
  });

  const settleMut = useMutation({
    mutationFn: (friendId: string) =>
      api<{ settled: number }>(`/v1/liff/friends/${friendId}/settle`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["friends"] });
      qc.invalidateQueries({ queryKey: ["friend-debts"] });
      setConfirmSettle(null);
    },
  });

  const pinMut = useMutation({
    mutationFn: (f: Friend) =>
      api<{ pin: string }>(`/v1/liff/friends/${f.userId}/pin`, { method: "POST" }).then((r) => ({
        name: f.displayName ?? "好友",
        code: r.pin,
      })),
    onSuccess: (info) => setPin(info),
  });

  if (isLoading) return <div className="p-4 text-neutral-500">載入中…</div>;
  if (!data) return <ErrorBox onRetry={() => refetch()} error={error as Error} />;

  const friends = [...data.friends].sort((a, b) => b.outstanding - a.outstanding);
  const totalOwed = friends.reduce((s, f) => s + Math.max(0, f.outstanding), 0);

  return (
    <div className="pb-24">
      <Header title="好友 / 待收款" />
      <div className="p-4 space-y-4">
        <div className="bg-emerald-600 text-white rounded-2xl p-4">
          <div className="text-xs opacity-90">總待收款</div>
          <div className="text-3xl font-bold font-mono mt-1">{fmtMoney(totalOwed)}</div>
          <div className="text-xs opacity-90 mt-1">{friends.length} 位好友</div>
        </div>

        {friends.length === 0 && (
          <div className="text-sm text-neutral-500 text-center py-6">
            還沒有好友。記一筆分帳（例：「和小明吃飯我先出500」）就會自動建立。
          </div>
        )}

        <ul className="space-y-2">
          {friends.map((f) => (
            <li key={f.userId} className="bg-white rounded-xl shadow-sm overflow-hidden">
              <button
                className="w-full flex items-center justify-between p-3 active:bg-neutral-50"
                onClick={() => setOpenId(openId === f.userId ? null : f.userId)}
              >
                <div className="font-medium text-left">
                  {f.displayName ?? "好友"}
                  {f.isVirtual && <span className="ml-1 text-xs text-amber-600">未綁定</span>}
                </div>
                <div
                  className={`font-mono text-sm ${
                    f.outstanding > 0 ? "text-red-600" : "text-neutral-400"
                  }`}
                >
                  {f.outstanding > 0 ? `欠 ${fmtMoney(f.outstanding)}` : "已結清"}
                </div>
              </button>
              {openId === f.userId && <FriendDetail friend={f} />}
            </li>
          ))}
        </ul>

        <div className="flex gap-2 pt-2">
          <input
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
            placeholder="新增好友名字（例：小明）"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            onClick={() => {
              const v = newName.trim();
              if (v) createMut.mutate(v);
            }}
            disabled={createMut.isPending || !newName.trim()}
            className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            建立
          </button>
        </div>
      </div>

      {pin && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4"
          onClick={() => setPin(null)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-3 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-base">{pin.name} 的綁定邀請碼</h3>
            <div className="text-3xl font-mono font-bold tracking-widest text-emerald-600">
              {pin.code}
            </div>
            <p className="text-xs text-neutral-500">
              請對方加入 Laiki 官方帳號，輸入這組數字即可認領歷史帳目。24 小時內有效。
            </p>
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(
                  `加入 Laiki 記帳機器人，輸入綁定碼 ${pin.code} 就能看到我們的分帳紀錄！`,
                );
                setPin(null);
              }}
              className="w-full px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium"
            >
              複製邀請訊息
            </button>
            <button
              onClick={() => setPin(null)}
              className="w-full px-4 py-2 bg-neutral-200 rounded-lg font-medium"
            >
              關閉
            </button>
          </div>
        </div>
      )}

      <Confirm
        open={!!confirmSettle}
        title="標記已收款？"
        message={
          confirmSettle
            ? `將 ${confirmSettle.displayName ?? "好友"} 的 ${fmtMoney(
                confirmSettle.outstanding,
              )} 全部標記為已結清。`
            : ""
        }
        confirmLabel="已收到"
        onConfirm={() => confirmSettle && settleMut.mutate(confirmSettle.userId)}
        onCancel={() => setConfirmSettle(null)}
      />

      {/* Per-friend action bar rendered inside the expanded row uses these. */}
      <FriendActions
        onSettle={(f) => setConfirmSettle(f)}
        onPin={(f) => pinMut.mutate(f)}
        registry={{ openId, friends }}
      />
    </div>
  );
}

/** Expanded debt breakdown for one friend. */
function FriendDetail({ friend }: { friend: Friend }) {
  const { data } = useQuery({
    queryKey: ["friend-debts", friend.userId],
    queryFn: () =>
      api<{ debts: Debt[]; total: number }>(`/v1/liff/friends/${friend.userId}/debts`),
  });
  return (
    <div className="border-t bg-neutral-50 px-3 py-2">
      {!data ? (
        <div className="text-xs text-neutral-400 py-1">載入中…</div>
      ) : data.debts.length === 0 ? (
        <div className="text-xs text-neutral-400 py-1">目前沒有未結款項</div>
      ) : (
        <ul className="space-y-1">
          {data.debts.map((d) => (
            <li key={d.id} className="flex justify-between text-xs text-neutral-600">
              <span>
                {(d.txDate ?? "").slice(5).replace("-", "/")} {d.note ?? "分帳"}
              </span>
              <span className="font-mono text-red-600">{fmtMoney(d.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Action buttons for the currently-open friend. Kept separate so the
 * settle/pin handlers live next to the modals at the page root.
 */
function FriendActions({
  onSettle,
  onPin,
  registry,
}: {
  onSettle: (f: Friend) => void;
  onPin: (f: Friend) => void;
  registry: { openId: string | null; friends: Friend[] };
}) {
  const f = registry.friends.find((x) => x.userId === registry.openId);
  if (!f) return null;
  return (
    <div className="fixed bottom-16 left-0 right-0 px-4 z-30">
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-lg border p-2 flex gap-2">
        {f.isVirtual && (
          <button
            onClick={() => onPin(f)}
            className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm"
          >
            邀請綁定
          </button>
        )}
        <button
          onClick={() => onSettle(f)}
          disabled={f.outstanding <= 0}
          className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium disabled:opacity-40"
        >
          標記已收款
        </button>
      </div>
    </div>
  );
}
