import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, liff } from "../liff";
import Header from "../components/Header";
import ErrorBox from "../components/ErrorBox";
import Confirm from "../components/Confirm";

interface NotificationPrefs {
  notifyWeekly: boolean;
  notifyMonthly: boolean;
  notifyNudge: boolean;
}

interface Me {
  user: { id: string; displayName: string; pictureUrl: string | null };
  byok: { keyHint: string } | null;
}

interface Row {
  to: string;
  label: string;
  hint?: string;
  emphasis?: "default" | "warn";
}

function SectionList({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-medium text-neutral-500 px-1 uppercase tracking-wide">
        {title}
      </h2>
      <ul className="card !p-0 divide-y divide-neutral-100">
        {rows.map((r) => (
          <Link
            key={r.to}
            to={r.to}
            className="flex items-center justify-between px-4 py-3 active:bg-neutral-50"
          >
            <span>{r.label}</span>
            <span
              className={`text-xs ${
                r.emphasis === "warn"
                  ? "text-amber-600 font-medium"
                  : "text-neutral-400"
              }`}
            >
              {r.hint ?? "›"}
            </span>
          </Link>
        ))}
      </ul>
    </section>
  );
}

export default function Settings() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [logoutOpen, setLogoutOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Me>("/v1/liff/me"),
  });

  const { data: notif } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<NotificationPrefs>("/v1/liff/notifications"),
  });

  const updateNotif = useMutation({
    mutationFn: (patch: Partial<NotificationPrefs>) =>
      api<NotificationPrefs>("/v1/liff/notifications", {
        method: "PUT",
        body: JSON.stringify(patch),
      }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      const prev = qc.getQueryData<NotificationPrefs>(["notifications"]);
      if (prev) qc.setQueryData(["notifications"], { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["notifications"], ctx.prev);
    },
    onSuccess: (data) => qc.setQueryData(["notifications"], data),
  });

  const logout = useMutation({
    mutationFn: () => api("/v1/liff/logout", { method: "POST" }),
    onSettled: () => {
      try {
        if (liff.isLoggedIn()) liff.logout();
      } catch {
        /* noop */
      }
      if (liff.isInClient()) liff.closeWindow();
      else nav("/onboarding");
    },
  });

  if (isLoading)
    return (
      <div className="pb-24">
        <Header title="設定" />
        <div className="p-4 text-neutral-500">載入中…</div>
      </div>
    );
  if (!data)
    return (
      <div className="pb-24">
        <Header title="設定" />
        <div className="p-4">
          <ErrorBox onRetry={() => refetch()} error={error as Error} />
        </div>
      </div>
    );

  return (
    <div className="pb-24">
      <Header title="設定" />
      <div className="p-4 space-y-6">
        <div className="card flex items-center gap-3">
          {data.user.pictureUrl && (
            <img
              src={data.user.pictureUrl}
              alt=""
              className="w-12 h-12 rounded-full ring-2 ring-white shadow-sm"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate">{data.user.displayName}</div>
            <div className="text-[11px] text-neutral-400 truncate">
              {data.user.id}
            </div>
          </div>
        </div>

        <SectionList
          title="工具"
          rows={[
            {
              to: "/apikey",
              label: "API 金鑰 (BYOK)",
              hint: data.byok ? data.byok.keyHint : "未綁定",
            },
            { to: "/budgets", label: "預算" },
            { to: "/data", label: "匯入 / 匯出" },
          ]}
        />

        <section className="space-y-2">
          <h2 className="text-xs font-medium text-neutral-500 px-1 uppercase tracking-wide">
            推播偏好
          </h2>
          <ul className="card !p-0 divide-y divide-neutral-100">
            {(
              [
                { key: "notifyWeekly", label: "AI 週報" },
                { key: "notifyMonthly", label: "每月結算" },
                { key: "notifyNudge", label: "回流提醒" },
              ] as const
            ).map(({ key, label }) => {
              const value = notif?.[key] ?? true;
              return (
                <li
                  key={key}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <span>{label}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={value}
                    aria-label={label}
                    onClick={() => updateNotif.mutate({ [key]: !value })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      value ? "bg-emerald-500" : "bg-neutral-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        value ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <SectionList
          title="關於"
          rows={[
            { to: "/help", label: "使用教學" },
            {
              to: "/terms",
              label: "使用條款與隱私",
              hint: "⚠ 必讀",
              emphasis: "warn",
            },
          ]}
        />

        <button
          onClick={() => setLogoutOpen(true)}
          disabled={logout.isPending}
          className="btn-danger w-full"
        >
          {logout.isPending ? "登出中…" : "登出"}
        </button>

        <Confirm
          open={logoutOpen}
          title="登出"
          message="登出後需重新從 LINE 開啟才能繼續使用。"
          confirmLabel="登出"
          danger
          onCancel={() => setLogoutOpen(false)}
          onConfirm={() => {
            setLogoutOpen(false);
            logout.mutate();
          }}
        />

        <ServerVersion />
      </div>
    </div>
  );
}

function ServerVersion() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["version"],
    queryFn: () => api<{ version: string }>("/version"),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
  const serverV = isLoading ? "…" : isError ? "離線" : (data?.version ?? "—");
  return (
    <div
      className="text-center text-[11px] text-neutral-400 pt-2"
      title={isError ? "無法連線伺服器" : undefined}
    >
      Laiki LIFF v{__APP_VERSION__} · Server v{serverV}
    </div>
  );
}
