import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import webhookLine from "./routes/webhook/line.js";
import liffAuth from "./routes/liff/auth.js";
import liffMe from "./routes/liff/me.js";
import liffSummary from "./routes/liff/summary.js";
import liffContacts from "./routes/liff/contacts.js";
import liffSettings from "./routes/liff/settings.js";
import liffUsage from "./routes/liff/usage.js";
import liffTrend from "./routes/liff/trend.js";
import liffData from "./routes/liff/data.js";
import liffOverview from "./routes/liff/overview.js";
import aiParse from "./routes/ai/parse.js";
import aiRecognize from "./routes/ai/recognize.js";
import aiInsights from "./routes/ai/insights.js";
import transactions from "./routes/transactions.js";
import accounts from "./routes/accounts.js";
import transfers from "./routes/transfers.js";
import groups from "./routes/groups.js";
import balances from "./routes/balances.js";
import settle from "./routes/settle.js";
import budgets from "./routes/budgets.js";
import recurring from "./routes/recurring.js";
import metrics from "./routes/metrics.js";
import { startJobs } from "./jobs/index.js";
import { makeRateLimit, webhookKey, apiKey } from "./lib/rateLimit.js";

const app = new Hono<{ Variables: { reqId: string } }>();

app.use("*", async (c, next) => {
  const reqId = c.req.header("x-request-id") ?? crypto.randomUUID();
  c.set("reqId", reqId);
  c.header("x-request-id", reqId);
  await next();
});

app.use("*", logger());

app.use(
  "/webhook/line",
  makeRateLimit({ windowMs: 60_000, max: 60, keyFn: webhookKey }),
);

app.use(
  "/api/*",
  makeRateLimit({
    windowMs: 60_000,
    max: 120,
    keyFn: (c) => (c.req.path === "/api/health" ? null : apiKey(c)),
  }),
);

const allowed = (process.env.ALLOWED_ORIGINS ?? "https://liff.line.me")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  "/api/*",
  cors({
    origin: (origin) => (allowed.includes(origin) ? origin : null),
    credentials: true,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["content-type"],
  }),
);

// Docker runs `node dist/index.js` directly, so npm_package_version is
// absent there — keep the literal in sync with package.json.
const VERSION = process.env.npm_package_version ?? "0.2.0";
app.get("/api/health", (c) => c.json({ ok: true, version: VERSION }));
app.get("/api/version", (c) => c.json({ version: VERSION }));

app.route("/webhook/line", webhookLine);
app.route("/api/v1/liff", liffAuth);
app.route("/api/v1/liff", liffMe);
app.route("/api/v1/liff", liffSummary);
app.route("/api/v1/liff", liffContacts);
app.route("/api/v1/liff/notifications", liffSettings);
app.route("/api/v1/liff", liffUsage);
app.route("/api/v1/liff", liffTrend);
app.route("/api/v1/liff", liffData);
app.route("/api/v1/liff", liffOverview);
app.route("/api/v1/ai", aiParse);
app.route("/api/v1/ai/recognize", aiRecognize);
app.route("/api/v1/groups/insights", aiInsights);
app.route("/api/v1/transactions", transactions);
app.route("/api/v1/accounts", accounts);
app.route("/api/v1/transfers", transfers);
app.route("/api/v1/groups", groups);
app.route("/api/v1/groups", balances);
app.route("/api/v1/groups", settle);
app.route("/api/v1/budgets", budgets);
app.route("/api/v1/recurring", recurring);
app.route("/metrics", metrics);

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port });
console.log(`laiki-server listening on :${port}`);
startJobs();
