import liff from "@line/liff";

const LIFF_ID = import.meta.env.VITE_LIFF_ID as string;
const API_BASE = import.meta.env.VITE_API_BASE as string;

let initialized = false;

export async function initLiff(): Promise<void> {
  if (initialized) return;

  const BASE = "/laiki";
  const preInitUrl = new URL(window.location.href);
  const preState = preInitUrl.searchParams.get("liff.state");

  await liff.init({ liffId: LIFF_ID });
  initialized = true;

  const url = new URL(window.location.href);
  const state = preState ?? url.searchParams.get("liff.state");
  if (state) {
    if (state.startsWith("http") || state.includes("//")) {
      console.warn("[liff] ignoring suspicious liff.state (external/protocol):", state);
    } else {
      let path = state.startsWith("/") ? state : `/${state}`;
      const pathOnly = path.split("?")[0]!;
      if (!pathOnly.startsWith(BASE + "/") && pathOnly !== BASE) path = BASE + path;
      console.log("[liff] restoring state →", path);
      window.history.replaceState(null, "", path);
    }
  }

  if (!liff.isLoggedIn()) {
    liff.login();
    return;
  }

  const idToken = liff.getIDToken();
  if (idToken) {
    await fetch(`${API_BASE}/v1/liff/auth`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) throw new Error(`api ${path}: ${res.status}`);
  return (await res.json()) as T;
}

export { liff };
