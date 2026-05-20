import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../liff";
import Header from "../components/Header";

type Provider = "gemini" | "openai" | "anthropic" | "ollama";

interface KeyEntry {
  provider: Provider;
  keyHint: string;
  model?: string | null;
  endpoint?: string | null;
  verifiedAt: string;
}

interface KeysResponse {
  keys: KeyEntry[];
  defaultProvider?: Provider | null;
}

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: "gemini", label: "Gemini" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "ollama", label: "Ollama" },
];

interface ModelInfo {
  id: string;
  label?: string;
  supportsVision?: boolean;
}

export default function ApiKey() {
  const qc = useQueryClient();
  const [provider, setProvider] = useState<Provider>("gemini");
  const [key, setKey] = useState("");
  const [endpoint, setEndpoint] = useState("http://host.docker.internal:11434");
  const [model, setModel] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    reply?: string;
    error?: string;
    model?: string | null;
  } | null>(null);

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const body: Record<string, unknown> = { provider };
      if (provider === "ollama") {
        body.endpoint = endpoint || "http://host.docker.internal:11434";
        if (key) body.key = key;
        if (model) body.model = model;
      } else {
        if (key) body.key = key;
        if (model) body.model = model;
      }
      const res = await api<{
        ok: boolean;
        reply?: string;
        error?: string;
        model?: string | null;
      }>("/v1/apikey/test", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setTestResult(res);
    } catch (e) {
      setTestResult({
        ok: false,
        error: e instanceof Error ? e.message : "測試失敗",
      });
    } finally {
      setTesting(false);
    }
  }

  async function fetchModels(opts: { silent?: boolean } = {}) {
    const silent = opts.silent === true;
    if (!silent) {
      setLoadingModels(true);
      setMsg(null);
    }
    try {
      const body: Record<string, unknown> = { provider };
      if (provider === "ollama") {
        body.endpoint = endpoint || "http://host.docker.internal:11434";
        if (key) body.key = key;
      } else if (key) {
        body.key = key;
      }
      const res = await api<{ models: ModelInfo[] }>("/v1/apikey/models", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setModels(res.models);
      if (!silent && res.models.length === 0) {
        setMsg({ kind: "err", text: "未取得任何模型" });
      }
    } catch (e) {
      if (!silent) {
        setMsg({ kind: "err", text: "取得模型失敗，確認 key/endpoint" });
        setModels([]);
      }
    } finally {
      if (!silent) setLoadingModels(false);
    }
  }

  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    const canAuto = provider === "ollama" || key.trim().length >= 10;
    if (!canAuto) return;
    autoTimer.current = setTimeout(() => {
      fetchModels({ silent: true });
    }, 600);
    setTestResult(null);
    return () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, key, endpoint]);

  useEffect(() => {
    setTestResult(null);
  }, [model]);

  const { data, isLoading } = useQuery({
    queryKey: ["apikey"],
    queryFn: async () => {
      try {
        return await api<KeysResponse>("/v1/apikey");
      } catch {
        return { keys: [], defaultProvider: null } as KeysResponse;
      }
    },
  });

  const keys = data?.keys ?? [];
  const defaultProvider = data?.defaultProvider ?? null;

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { provider };
      if (provider === "ollama") {
        body.key = key || "ollama";
        body.endpoint = endpoint || "http://host.docker.internal:11434";
        body.model = model || "llama3.2";
      } else {
        body.key = key;
        if (model) body.model = model;
      }
      return api("/v1/apikey", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      setMsg({ kind: "ok", text: "已驗證並儲存" });
      setKey("");
      setModel("");
      qc.invalidateQueries({ queryKey: ["apikey"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: () => setMsg({ kind: "err", text: "驗證失敗,請確認設定" }),
  });

  const remove = useMutation({
    mutationFn: (p: Provider) =>
      api(`/v1/apikey/${p}`, { method: "DELETE" }),
    onSuccess: () => {
      setMsg({ kind: "ok", text: "已解除綁定" });
      qc.invalidateQueries({ queryKey: ["apikey"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: () => setMsg({ kind: "err", text: "解除失敗" }),
  });

  const setDefault = useMutation({
    mutationFn: (p: Provider) =>
      api("/v1/apikey/default", {
        method: "PUT",
        body: JSON.stringify({ provider: p }),
      }),
    onSuccess: () => {
      setMsg({ kind: "ok", text: "已設為預設" });
      qc.invalidateQueries({ queryKey: ["apikey"] });
    },
    onError: () => setMsg({ kind: "err", text: "設定失敗" }),
  });

  if (isLoading) return <div className="p-4 text-neutral-500">載入中…</div>;

  const isOllama = provider === "ollama";
  const canSubmit = isOllama ? true : !!key.trim();

  return (
    <div className="pb-24">
      <Header title="API 金鑰" />
      <div className="p-4 space-y-4">

      <section className="bg-white rounded-lg p-3 shadow-sm space-y-2">
        <div className="text-sm text-neutral-500">目前綁定</div>
        {keys.length === 0 ? (
          <div className="text-neutral-400">尚未綁定,使用平台額度</div>
        ) : (
          <ul className="space-y-2">
            {keys.map((k) => (
              <li
                key={k.provider}
                className="flex items-center justify-between gap-2 border rounded p-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium flex items-center gap-2">
                    <span>{k.provider}</span>
                    {defaultProvider === k.provider && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 rounded px-1.5 py-0.5">
                        預設
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-xs truncate">{k.keyHint}</div>
                  {k.model && (
                    <div className="text-xs text-neutral-500">
                      model: {k.model}
                    </div>
                  )}
                  {k.endpoint && (
                    <div className="text-xs text-neutral-500 truncate">
                      {k.endpoint}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => remove.mutate(k.provider)}
                  className="text-xs text-red-600 border border-red-300 rounded px-2 py-1"
                >
                  解除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {keys.length > 1 && (
        <label className="block">
          <div className="text-sm text-neutral-500 mb-1">預設提供者</div>
          <select
            value={defaultProvider ?? ""}
            onChange={(e) => setDefault.mutate(e.target.value as Provider)}
            className="w-full p-2 border rounded bg-white"
          >
            <option value="">未設定</option>
            {keys.map((k) => (
              <option key={k.provider} value={k.provider}>
                {k.provider}
              </option>
            ))}
          </select>
        </label>
      )}

      <section className="space-y-3 bg-white rounded-lg p-3 shadow-sm">
        <div className="text-sm text-neutral-500">新增 / 替換金鑰</div>

        <label className="block">
          <div className="text-xs text-neutral-500 mb-1">提供者</div>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            className="w-full p-2 border rounded bg-white"
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {isOllama && (
          <label className="block">
            <div className="text-xs text-neutral-500 mb-1">Endpoint</div>
            <input
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="http://host.docker.internal:11434"
              className="w-full p-2 border rounded font-mono text-sm"
            />
          </label>
        )}

        <label className="block">
          <div className="text-xs text-neutral-500 mb-1">
            API Key{isOllama ? "（選填）" : ""}
          </div>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={isOllama ? "ollama 或留空" : "sk-..."}
            className="w-full p-2 border rounded font-mono"
          />
        </label>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="text-xs text-neutral-500">
              Model{isOllama ? "" : "（選填）"}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fetchModels()}
                disabled={loadingModels || (!isOllama && !key.trim())}
                className="text-xs text-blue-600 disabled:opacity-40"
              >
                {loadingModels ? "載入中…" : "取得模型列表"}
              </button>
              <button
                type="button"
                onClick={() => testConnection()}
                disabled={testing || (!isOllama && !key.trim())}
                className="text-xs text-blue-600 disabled:opacity-40"
              >
                {testing ? "測試中…" : "測試連線"}
              </button>
            </div>
          </div>
          {models.length > 0 ? (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full p-2 border rounded bg-white text-sm"
            >
              <option value="">（預設）</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label ?? m.id}{m.supportsVision ? " · vision" : ""}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={isOllama ? "llama3.2" : "gpt-4o-mini / gemini-1.5-flash …"}
              className="w-full p-2 border rounded font-mono text-sm"
            />
          )}
        </div>

        {testResult && (
          testResult.ok ? (
            <div className="border border-emerald-400 bg-emerald-50 rounded p-2 text-sm space-y-1">
              <div>🤖 {testResult.reply}</div>
              {testResult.model && (
                <div className="text-xs text-neutral-500">model: {testResult.model}</div>
              )}
            </div>
          ) : (
            <div className="border border-red-400 bg-red-50 rounded p-2 text-sm text-red-700">
              {testResult.error ?? "測試失敗"}
            </div>
          )
        )}

        {msg && (
          <div
            className={`text-sm ${
              msg.kind === "ok" ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {msg.text}
          </div>
        )}

        <button
          onClick={() => save.mutate()}
          disabled={save.isPending || !canSubmit}
          className="w-full px-4 py-2 bg-emerald-600 text-white rounded font-medium disabled:opacity-50"
        >
          {save.isPending ? "驗證中…" : "儲存"}
        </button>
      </section>
      </div>
    </div>
  );
}
