import type { Context, MiddlewareHandler } from "hono";

interface Bucket {
  count: number;
  resetAt: number;
}

interface Options {
  windowMs: number;
  max: number;
  keyFn: (c: Context) => string | null;
}

export function makeRateLimit({ windowMs, max, keyFn }: Options): MiddlewareHandler {
  const buckets = new Map<string, Bucket>();
  return async (c, next) => {
    const key = keyFn(c);
    if (!key) return next();

    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.count += 1;

    // Opportunistic GC: drop expired entries when map grows large
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) {
        if (v.resetAt <= now) buckets.delete(k);
      }
    }

    if (b.count > max) {
      const retryAfter = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: "rate_limited" }, 429);
    }
    return next();
  };
}

export function webhookKey(c: Context): string | null {
  const sig = c.req.header("x-line-signature");
  if (!sig) return null;
  return `webhook:${sig.slice(0, 16)}`;
}

export function apiKey(c: Context): string | null {
  const cookie = c.req.header("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)sid=([^;]+)/);
  if (m && m[1]) return `api:sid:${m[1]}`;
  const xff = c.req.header("x-forwarded-for");
  if (xff) return `api:ip:${xff.split(",")[0]!.trim()}`;
  return `api:ip:unknown`;
}
