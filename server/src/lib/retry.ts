export interface RetryOptions {
  maxRetries?: number;
  baseMs?: number;
  retryOnStatus?: number[];
}

function getStatus(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const e = err as Record<string, unknown>;
  if (typeof e.status === "number") return e.status as number;
  const msg = typeof e.message === "string" ? (e.message as string) : "";
  const m = msg.match(/status:\s*(\d{3})/);
  return m ? Number(m[1]) : null;
}

export async function retry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const max = opts.maxRetries ?? 2;
  const base = opts.baseMs ?? 800;
  const codes = opts.retryOnStatus ?? [429, 500, 502, 503, 504];

  let lastErr: unknown;
  for (let attempt = 0; attempt <= max; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = getStatus(err);
      if (attempt === max || (status !== null && !codes.includes(status))) throw err;
      const delay = base * Math.pow(2, attempt) + Math.random() * 200;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
