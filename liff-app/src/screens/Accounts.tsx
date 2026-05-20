import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../liff";
import Header from "../components/Header";
import { fmtMoney, groupTypeLabel } from "../lib/format";

interface Account {
  id: string;
  name: string;
  type: string;
  balance: string;
  initialBalance: string;
  icon: string | null;
  color: string | null;
  isShared?: boolean;
}

interface Me {
  groups: { id: string; name: string; type: string }[];
}

type Tab = "accounts" | "groups";

export default function Accounts() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("accounts");
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("cash");
  const [initialBalance, setInitialBalance] = useState("0");
  const [icon, setIcon] = useState("");
  const [color, setColor] = useState("#10b981");

  const { data: accs, isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<{ accounts: Account[] }>("/v1/accounts"),
  });
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Me>("/v1/liff/me"),
  });

  const create = useMutation({
    mutationFn: () =>
      api<{ account: Account }>("/v1/accounts", {
        method: "POST",
        body: JSON.stringify({
          name,
          type,
          initialBalance: Number(initialBalance),
          icon: icon || null,
          color: color || null,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      setShowNew(false);
      setName("");
      setInitialBalance("0");
      setIcon("");
    },
  });

  return (
    <div className="pb-24">
      <Header title="帳戶 / 群組" />
      <div className="p-4 space-y-4">
        <div className="inline-flex bg-neutral-100 rounded-xl p-1 w-full">
          {(
            [
              { key: "accounts", label: `帳戶 (${accs?.accounts.length ?? 0})` },
              { key: "groups", label: `群組 (${me?.groups.length ?? 0})` },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                tab === t.key
                  ? "bg-white text-emerald-700 shadow-sm"
                  : "text-neutral-500"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "accounts" && (
          <>
            {isLoading ? (
              <div className="text-neutral-500 text-sm">載入中…</div>
            ) : (
              <ul className="space-y-2">
                {accs?.accounts.map((a) => (
                  <li
                    key={a.id}
                    onClick={() => nav(`/accounts/${a.id}`)}
                    className="card !p-3 flex items-center cursor-pointer active:scale-[0.99] transition"
                  >
                    <div
                      className="w-1 self-stretch rounded-full mr-3"
                      style={{ backgroundColor: a.color ?? "#d4d4d4" }}
                    />
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      {a.icon && <span className="text-xl">{a.icon}</span>}
                      <div className="min-w-0">
                        <div className="font-medium truncate flex items-center gap-1">
                          {a.name}
                          {a.isShared && <span className="chip">分享</span>}
                        </div>
                        <div className="text-xs text-neutral-500">{a.type}</div>
                      </div>
                    </div>
                    <div
                      className={`font-mono text-base ${
                        Number(a.balance) < 0 ? "text-red-600" : ""
                      }`}
                    >
                      {fmtMoney(Number(a.balance))}
                    </div>
                  </li>
                ))}
                {accs?.accounts.length === 0 && (
                  <li className="text-sm text-neutral-500 text-center py-12 card">
                    還沒有帳戶，點右下角 + 新增
                  </li>
                )}
              </ul>
            )}
          </>
        )}

        {tab === "groups" && (
          <ul className="space-y-2">
            {me?.groups.map((g) => (
              <Link
                key={g.id}
                to={`/group/${g.id}`}
                className="card !p-3 flex items-center justify-between active:scale-[0.99] transition"
              >
                <div>
                  <div className="font-medium">{g.name}</div>
                  <div className="text-xs text-neutral-500">
                    {groupTypeLabel(g.type)}
                  </div>
                </div>
                <span className="text-neutral-400">›</span>
              </Link>
            ))}
            {(me?.groups.length ?? 0) === 0 && (
              <li className="text-sm text-neutral-500 text-center py-12 card">
                尚未加入任何群組。將 Bot 加入 LINE 群組即可建立。
              </li>
            )}
          </ul>
        )}
      </div>

      {tab === "accounts" && (
        <button
          onClick={() => setShowNew(true)}
          className="fixed bottom-20 right-5 w-14 h-14 rounded-full bg-emerald-600 text-white text-3xl shadow-lg flex items-center justify-center z-30 active:scale-90 transition"
          aria-label="新增帳戶"
        >
          +
        </button>
      )}

      {showNew && (
        <div
          className="fixed inset-0 bg-black/40 flex items-end justify-center z-50"
          onClick={() => setShowNew(false)}
        >
          <div
            className="bg-white w-full max-w-md rounded-t-3xl p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">新增帳戶</h2>

            <div>
              <label className="field-label">名稱</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="field-input"
                placeholder="例如：中信信用卡"
              />
            </div>

            <div>
              <label className="field-label">類型</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="field-input"
              >
                <option value="cash">現金</option>
                <option value="bank">銀行</option>
                <option value="credit">信用卡</option>
                <option value="debit">簽帳卡</option>
                <option value="ewallet">電子錢包</option>
              </select>
            </div>

            <div>
              <label className="field-label">初始餘額</label>
              <input
                type="number"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                className="field-input font-mono"
              />
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="field-label">圖示</label>
                <input
                  type="text"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  className="field-input"
                  placeholder="emoji"
                />
              </div>
              <div className="w-24">
                <label className="field-label">顏色</label>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-full h-10 rounded-xl border border-neutral-200 cursor-pointer"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowNew(false)} className="btn-ghost flex-1">
                取消
              </button>
              <button
                onClick={() => create.mutate()}
                disabled={create.isPending || !name}
                className="btn-primary flex-1"
              >
                {create.isPending ? "新增中…" : "新增"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
