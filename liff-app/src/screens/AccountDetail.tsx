import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../liff";
import { fmtDate, fmtMoney } from "../lib/format";
import ErrorBox from "../components/ErrorBox";
import Header from "../components/Header";

interface Account {
  id: string;
  name: string;
  type: string;
  last4: string | null;
  balance: string;
  initialBalance: string;
  icon: string | null;
  color: string | null;
}

const ACCOUNT_TYPES = ["cash", "debit", "credit", "bank", "ewallet"] as const;

interface Tx {
  id: string;
  amount: string;
  txDate: string;
  category: string | null;
  note: string | null;
  kind: string;
}

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("cash");
  const [last4, setLast4] = useState("");
  const [icon, setIcon] = useState("");
  const [color, setColor] = useState("");
  const [showAdjust, setShowAdjust] = useState(false);
  const [newBalanceInput, setNewBalanceInput] = useState("");
  const [adjustNote, setAdjustNote] = useState("");

  const { data: acc, error, refetch } = useQuery({
    queryKey: ["account", id],
    queryFn: () => api<{ account: Account; isOwner: boolean }>(`/v1/accounts/${id}`),
    enabled: !!id,
  });

  const { data: members, refetch: refetchMembers } = useQuery({
    queryKey: ["account", id, "members"],
    queryFn: () =>
      api<{
        owner: { id: string; displayName: string | null; pictureUrl: string | null };
        members: { userId: string; role: string; displayName: string | null; pictureUrl: string | null }[];
      }>(`/v1/accounts/${id}/members`),
    enabled: !!id,
  });

  const { data: contactsData } = useQuery({
    queryKey: ["contacts"],
    queryFn: () =>
      api<{
        contacts: {
          id: string;
          displayName: string | null;
          pictureUrl: string | null;
          viaGroups?: string[];
        }[];
      }>("/v1/liff/contacts"),
  });

  const [showShare, setShowShare] = useState(false);
  const addMember = useMutation({
    mutationFn: (uid: string) =>
      api(`/v1/accounts/${id}/members`, {
        method: "POST",
        body: JSON.stringify({ userId: uid }),
      }),
    onSuccess: () => {
      refetchMembers();
      setShowShare(false);
    },
  });
  const removeMember = useMutation({
    mutationFn: (uid: string) =>
      api(`/v1/accounts/${id}/members/${uid}`, { method: "DELETE" }),
    onSuccess: () => refetchMembers(),
  });

  const { data: txs } = useQuery({
    queryKey: ["account", id, "transactions"],
    queryFn: () =>
      api<{ transactions: Tx[] }>(`/v1/accounts/${id}/transactions`),
    enabled: !!id,
  });

  useEffect(() => {
    if (acc?.account) {
      setName(acc.account.name);
      setType(acc.account.type);
      setLast4(acc.account.last4 ?? "");
      setIcon(acc.account.icon ?? "");
      setColor(acc.account.color ?? "");
    }
  }, [acc]);

  const save = useMutation({
    mutationFn: () =>
      api<{ account: Account }>(`/v1/accounts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          type,
          last4: last4 || null,
          icon: icon || null,
          color: color || null,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account", id] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      setEditing(false);
    },
  });

  const adjust = useMutation({
    mutationFn: (payload: { newBalance: number; note?: string }) =>
      api(`/v1/accounts/${id}/adjust`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account", id] });
      qc.invalidateQueries({ queryKey: ["account", id, "transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      setShowAdjust(false);
      setNewBalanceInput("");
      setAdjustNote("");
    },
  });

  const archive = useMutation({
    mutationFn: () => api(`/v1/accounts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      nav("/accounts");
    },
  });

  if (error) return <ErrorBox onRetry={() => refetch()} error={error as Error} />;
  if (!acc) return <div className="p-4 text-neutral-500">載入中…</div>;
  const a = acc.account;
  const lastTxDate = txs?.transactions.reduce<Date | null>((acc, t) => {
    const d = new Date(t.txDate);
    return !acc || d > acc ? d : acc;
  }, null);
  const daysAgo = lastTxDate
    ? Math.floor((Date.now() - lastTxDate.getTime()) / 86400000)
    : null;

  return (
    <div className="pb-24">
      <Header title={a.name} />
      <div className="p-4 space-y-6">

      <section
        className="bg-white rounded-lg p-4 shadow-sm border-l-4 space-y-2"
        style={{ borderLeftColor: color || a.color || "#d4d4d4" }}
      >
        {editing ? (
          <div className="space-y-2">
            <label className="block text-xs text-neutral-500">名稱</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 border rounded"
            />
            <label className="block text-xs text-neutral-500">類型</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full p-2 border rounded"
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <label className="block text-xs text-neutral-500">末四碼</label>
            <input
              type="text"
              value={last4}
              maxLength={4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
              className="w-full p-2 border rounded"
              placeholder="(選填)"
            />
            <label className="block text-xs text-neutral-500">圖示 (Emoji)</label>
            <input
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="例如 💳"
            />
            <label className="block text-xs text-neutral-500">顏色</label>
            <input
              type="color"
              value={color || "#10b981"}
              onChange={(e) => setColor(e.target.value)}
              className="w-full h-10 p-1 border rounded"
            />
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => save.mutate()}
                disabled={save.isPending}
                className="flex-1 py-2 bg-emerald-600 text-white rounded font-medium disabled:opacity-50"
              >
                {save.isPending ? "儲存中…" : "儲存"}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setName(a.name);
                  setType(a.type);
                  setLast4(a.last4 ?? "");
                  setIcon(a.icon ?? "");
                  setColor(a.color ?? "");
                }}
                className="px-4 py-2 bg-neutral-200 rounded"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              {a.icon && <span className="text-2xl">{a.icon}</span>}
              <h1 className="text-xl font-bold flex-1">{a.name}</h1>
              {acc.isOwner && (
                <button
                  onClick={() => setEditing(true)}
                  className="px-3 py-1 text-sm text-emerald-600 border border-emerald-300 rounded"
                >
                  編輯
                </button>
              )}
              {!acc.isOwner && (
                <span className="text-xs text-neutral-500 bg-neutral-100 px-2 py-1 rounded">分享</span>
              )}
            </div>
            <div className="text-xs text-neutral-500">
              {a.type}
              {a.last4 ? ` · 末四碼 ${a.last4}` : ""}
            </div>
            <div className="font-mono text-3xl">
              {fmtMoney(Number(a.balance))}
            </div>
            <div className="text-xs text-neutral-500">
              初始 {fmtMoney(Number(a.initialBalance))}
            </div>
            {daysAgo !== null && (
              <div className="text-xs text-neutral-500">
                最後使用 {daysAgo === 0 ? "今天" : `${daysAgo} 天前`}
              </div>
            )}
            {acc.isOwner && (
              <button
                onClick={() => {
                  setNewBalanceInput(a.balance);
                  setShowAdjust(true);
                }}
                className="text-sm text-emerald-600 underline"
              >
                調整餘額
              </button>
            )}
          </>
        )}
      </section>

      {showAdjust && (
        <div
          className="fixed inset-0 bg-black/40 flex items-end justify-center z-50"
          onClick={() => setShowAdjust(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-2xl p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-lg">調整餘額</h3>
            <p className="text-xs text-neutral-500">
              目前 {fmtMoney(Number(a.balance))}。輸入正確金額，差額會記為「餘額調整」交易，可在下方紀錄中查閱。
            </p>
            <label className="block text-xs text-neutral-500">新餘額</label>
            <input
              type="number"
              inputMode="decimal"
              value={newBalanceInput}
              onChange={(e) => setNewBalanceInput(e.target.value)}
              className="w-full p-2 border rounded font-mono"
            />
            <label className="block text-xs text-neutral-500">備註 (選填)</label>
            <input
              type="text"
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
              placeholder="例如：對帳差異"
              className="w-full p-2 border rounded"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const v = Number(newBalanceInput);
                  if (!Number.isFinite(v)) return;
                  adjust.mutate({ newBalance: v, note: adjustNote || undefined });
                }}
                disabled={adjust.isPending || newBalanceInput === ""}
                className="flex-1 py-2 bg-emerald-600 text-white rounded font-medium disabled:opacity-50"
              >
                {adjust.isPending ? "套用中…" : "套用"}
              </button>
              <button
                onClick={() => setShowAdjust(false)}
                className="px-4 py-2 bg-neutral-200 rounded"
              >
                取消
              </button>
            </div>
            {adjust.isError && (
              <div className="text-xs text-red-600">
                {(adjust.error as Error).message}
              </div>
            )}
          </div>
        </div>
      )}

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm text-neutral-500">分享給</h2>
          {acc.isOwner && (
            <button
              onClick={() => setShowShare(true)}
              className="text-xs text-emerald-600"
            >
              + 加入
            </button>
          )}
        </div>
        <ul className="space-y-2">
          {members?.owner && (
            <li className="flex items-center gap-3 bg-white rounded-lg p-3 shadow-sm">
              {members.owner.pictureUrl && (
                <img src={members.owner.pictureUrl} alt="" className="w-8 h-8 rounded-full" />
              )}
              <div className="flex-1">
                <div className="text-sm font-medium">{members.owner.displayName ?? "(未命名)"}</div>
                <div className="text-xs text-neutral-500">擁有者</div>
              </div>
            </li>
          )}
          {members?.members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 bg-white rounded-lg p-3 shadow-sm">
              {m.pictureUrl && <img src={m.pictureUrl} alt="" className="w-8 h-8 rounded-full" />}
              <div className="flex-1">
                <div className="text-sm font-medium">{m.displayName ?? "(未命名)"}</div>
                <div className="text-xs text-neutral-500">編輯者</div>
              </div>
              {acc.isOwner && (
                <button
                  onClick={() => {
                    if (confirm("移除此成員的存取?")) removeMember.mutate(m.userId);
                  }}
                  className="text-xs text-red-600"
                >
                  移除
                </button>
              )}
            </li>
          ))}
          {members && members.members.length === 0 && !acc.isOwner && (
            <li className="text-xs text-neutral-500 px-1">尚未分享給其他人</li>
          )}
        </ul>
      </section>

      {showShare && contactsData && (
        <div
          className="fixed inset-0 bg-black/40 flex items-end justify-center z-50"
          onClick={() => setShowShare(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-2xl p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-lg">選擇要分享給誰</h3>
            {contactsData.contacts.length === 0 && (
              <div className="text-sm text-neutral-500">尚無聯絡人。先加入群組或共用群組。</div>
            )}
            <ul className="space-y-1 max-h-80 overflow-y-auto">
              {contactsData.contacts.map((c) => {
                const already = members?.members.some((m) => m.userId === c.id);
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => !already && addMember.mutate(c.id)}
                      disabled={already || addMember.isPending}
                      className="w-full flex items-center gap-3 p-3 bg-neutral-50 rounded-lg disabled:opacity-50"
                    >
                      {c.pictureUrl && (
                        <img src={c.pictureUrl} alt="" className="w-8 h-8 rounded-full" />
                      )}
                      <div className="flex-1 text-left text-sm">
                        <div>{c.displayName ?? "(未命名)"}</div>
                        {c.viaGroups && c.viaGroups.length > 0 && (
                          <div className="text-xs text-neutral-500">
                            (同 {c.viaGroups.join("/")})
                          </div>
                        )}
                      </div>
                      {already && <span className="text-xs text-neutral-400">已分享</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              onClick={() => setShowShare(false)}
              className="w-full px-4 py-2 bg-neutral-200 rounded font-medium"
            >
              關閉
            </button>
          </div>
        </div>
      )}

      <section>
        <h2 className="text-sm text-neutral-500 mb-2">交易紀錄</h2>
        <ul className="space-y-2">
          {txs?.transactions.map((t) => (
            <li
              key={t.id}
              onClick={() => nav(`/tx/${t.id}/edit?from=${encodeURIComponent(`/accounts/${id}`)}`)}
              className="flex items-center justify-between bg-white rounded-lg p-3 shadow-sm cursor-pointer"
            >
              <div>
                <div className="font-medium">{t.category ?? t.kind}</div>
                <div className="text-xs text-neutral-500">
                  {fmtDate(t.txDate)}
                  {t.note ? ` · ${t.note}` : ""}
                </div>
              </div>
              <div
                className={`font-mono ${
                  Number(t.amount) < 0 ? "text-red-600" : "text-emerald-600"
                }`}
              >
                {fmtMoney(Number(t.amount))}
              </div>
            </li>
          ))}
          {txs && txs.transactions.length === 0 && (
            <li className="text-sm text-neutral-500 text-center py-8">
              還沒有交易
            </li>
          )}
        </ul>
      </section>

      {acc.isOwner && (
        <div className="pt-4">
          <button
            onClick={() => {
              if (confirm("確定要封存此帳戶?")) archive.mutate();
            }}
            disabled={archive.isPending}
            className="w-full px-4 py-2 text-red-600 border border-red-300 rounded"
          >
            {archive.isPending ? "封存中…" : "封存帳戶"}
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
