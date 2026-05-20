import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "../components/Header";

const API_BASE = import.meta.env.VITE_API_BASE as string;

interface ImportSummary {
  accounts: number;
  transactions: number;
  skippedTransactions: number;
  budgets: number;
}

export default function DataIO() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const exportMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/v1/liff/export`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`export ${res.status}`);
      const disp = res.headers.get("content-disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(disp);
      const filename = m?.[1] ?? `laiki-export-${new Date().toISOString().slice(0, 10)}.json`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  });

  const importMut = useMutation({
    mutationFn: async (text: string) => {
      const body = JSON.parse(text);
      const res = await fetch(`${API_BASE}/v1/liff/import`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `import ${res.status}`);
      return data.summary as ImportSummary;
    },
    onSuccess: (s) => {
      setResult(s);
      setErr(null);
      setPicked(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["trend", 6] });
    },
    onError: (e: Error) => {
      setErr(e.message);
      setResult(null);
    },
  });

  const onImport = async () => {
    if (!picked) return;
    const text = await picked.text();
    try {
      JSON.parse(text);
    } catch {
      setErr("檔案不是有效 JSON");
      return;
    }
    importMut.mutate(text);
  };

  return (
    <div className="pb-24">
      <Header title="匯入 / 匯出" back="/settings" />
      <div className="p-4 space-y-6">
        <section className="bg-white rounded-lg p-4 shadow-sm space-y-3">
          <h2 className="font-medium">匯出資料</h2>
          <p className="text-xs text-neutral-500">
            下載個人帳戶、交易、預算、推播偏好為 JSON 檔案。不包含群組分帳資料與 API 金鑰。
          </p>
          <button
            onClick={() => exportMut.mutate()}
            disabled={exportMut.isPending}
            className="w-full px-4 py-2 bg-emerald-600 text-white rounded font-medium disabled:opacity-50"
          >
            {exportMut.isPending ? "匯出中…" : "下載 JSON"}
          </button>
          {exportMut.isError && (
            <div className="text-xs text-red-600">
              匯出失敗：{(exportMut.error as Error).message}
            </div>
          )}
        </section>

        <section className="bg-white rounded-lg p-4 shadow-sm space-y-3">
          <h2 className="font-medium">匯入資料</h2>
          <p className="text-xs text-neutral-500">
            從另一個 Laiki 帳號的匯出檔還原。同名帳戶會略過；交易匯入到「我的記帳」群組。
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              setPicked(e.target.files?.[0] ?? null);
              setResult(null);
              setErr(null);
            }}
            className="block w-full text-sm"
          />
          <button
            onClick={onImport}
            disabled={!picked || importMut.isPending}
            className="w-full px-4 py-2 bg-emerald-600 text-white rounded font-medium disabled:opacity-50"
          >
            {importMut.isPending ? "匯入中…" : "確認匯入"}
          </button>
          {err && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
              {err}
            </div>
          )}
          {result && (
            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2 space-y-1">
              <div>匯入完成：</div>
              <div>· 新增帳戶 {result.accounts}</div>
              <div>· 新增交易 {result.transactions}（略過 {result.skippedTransactions}）</div>
              <div>· 新增預算 {result.budgets}</div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
