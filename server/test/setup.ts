// Per-worker setup. Runs before any test file in the worker is loaded.
//
// Reads the DB URL chosen by global-setup.ts and sets process.env.DATABASE_URL
// so subsequent dynamic imports of `src/db/client.ts` connect to the test DB.
// Migrations have already been applied by global-setup.ts.
//
// Exposes `integrationAvailable` which integration suites consult via
// `describe.skipIf(!integrationAvailable)`.
import { readFileSync, existsSync } from "node:fs";

function resolveDbUrl(): string | null {
  if (process.env.DATABASE_URL_TEST) return process.env.DATABASE_URL_TEST;
  const file = process.env.LAIKI_TEST_DB_URL_FILE;
  if (!file || !existsSync(file)) return null;
  const url = readFileSync(file, "utf8").trim();
  return url || null;
}

const url = resolveDbUrl();
export const integrationAvailable = !!url;

if (url) {
  process.env.DATABASE_URL = url;
}
// Defaults for modules that read env at import time.
process.env.APIKEY_ENC_KEY ??=
  "0000000000000000000000000000000000000000000000000000000000000000";
process.env.NODE_ENV ??= "test";
