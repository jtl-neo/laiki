import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../liff";
import Header from "../components/Header";
import ErrorBox from "../components/ErrorBox";
import { groupTypeLabel } from "../lib/format";

interface Group {
  id: string;
  name: string;
  type: "shared" | "fund" | "split";
  ownerUserId: string;
  lineGroupId: string | null;
}

interface MeResp {
  user: { id: string };
}

export default function Groups() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"split" | "fund">("split");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["groups"],
    queryFn: () => api<{ groups: Group[] }>("/v1/groups/"),
  });

  const { data: meData } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<MeResp>("/v1/liff/me"),
  });

  const createMut = useMutation({
    mutationFn: (input: { name: string; type: "split" | "fund" }) =>
      api<{ group: Group }>("/v1/groups/", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["groups"] });
      setCreating(false);
      setName("");
    },
  });

  if (isLoading) return <div className="p-4 text-neutral-500">載入中…</div>;
  if (!data) return <ErrorBox onRetry={() => refetch()} error={error as Error} />;

  // Hide the personal ledger (oldest shared group owned by me without a
  // LINE group id) — it is managed from 帳戶/總覽, not here.
  const myId = meData?.user.id;
  const personal = myId
    ? data.groups
        .filter((g) => g.type === "shared" && g.ownerUserId === myId && !g.lineGroupId)
        .slice(-1)[0]
    : undefined;
  const visible = data.groups.filter((g) => g.id !== personal?.id);

  return (
    <div className="pb-24">
      <Header title="群組" />
      <div className="p-4 space-y-4">
        <button
          onClick={() => setCreating(true)}
          className="w-full px-4 py-3 bg-emerald-600 text-white rounded-xl font-medium"
        >
          ＋ 新增群組
        </button>

        {visible.length === 0 && (
          <div className="text-sm text-neutral-500 text-center py-8">
            還沒有群組。建立分帳群組或共同基金開始吧！
          </div>
        )}

        <ul className="space-y-2">
          {visible.map((g) => (
            <li key={g.id}>
              <Link
                to={`/group/${g.id}`}
                className="flex items-center justify-between bg-white rounded-lg p-3 shadow-sm active:opacity-70"
              >
                <div className="font-medium">
                  {g.type === "fund" ? "🏡 " : "📚 "}
                  {g.name}
                </div>
                <span className="chip">{groupTypeLabel(g.type)}</span>
              </Link>
            </li>
          ))}
        </ul>

        {creating && (
          <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
            onClick={() => setCreating(false)}
          >
            <div
              className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold text-base">新增群組</h3>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="群組名稱（例：出遊分帳、家裡用的東西）"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setKind("split")}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm border ${
                    kind === "split"
                      ? "bg-emerald-50 border-emerald-500 text-emerald-700 font-medium"
                      : "border-neutral-200 text-neutral-600"
                  }`}
                >
                  📚 分帳群組
                </button>
                <button
                  onClick={() => setKind("fund")}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm border ${
                    kind === "fund"
                      ? "bg-emerald-50 border-emerald-500 text-emerald-700 font-medium"
                      : "border-neutral-200 text-neutral-600"
                  }`}
                >
                  🏡 共同基金
                </button>
              </div>
              <p className="text-xs text-neutral-500">
                共同基金會自動建立專屬基金池帳戶，成員消費直接從基金扣款。
              </p>
              <div className="flex gap-2">
                <button onClick={() => setCreating(false)} className="btn-ghost flex-1">
                  取消
                </button>
                <button
                  onClick={() => {
                    const v = name.trim();
                    if (v) createMut.mutate({ name: v, type: kind });
                  }}
                  disabled={createMut.isPending || !name.trim()}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  建立
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
