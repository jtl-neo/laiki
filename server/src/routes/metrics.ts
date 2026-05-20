import { Hono } from "hono";

const counters = new Map<string, number>();

const KNOWN = [
  "parse_total",
  "recognize_total",
  "parse_errors",
  "recognize_errors",
  "settle_total",
  "webhook_total",
  "api_5xx",
] as const;

for (const k of KNOWN) counters.set(k, 0);

export function incr(name: string, n = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + n);
}

export function getAll(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of counters) out[k] = v;
  return out;
}

const app = new Hono();

app.get("/", (c) => {
  const lines: string[] = [];
  for (const [name, value] of counters) {
    lines.push(`# TYPE ${name} counter`);
    lines.push(`${name} ${value}`);
  }
  return c.text(lines.join("\n") + "\n", 200, {
    "content-type": "text/plain; version=0.0.4",
  });
});

export default app;
