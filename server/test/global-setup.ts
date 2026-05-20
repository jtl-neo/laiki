// Global setup for vitest integration tests.
//
// Starts a Postgres testcontainer once for the whole run, runs drizzle
// migrations once, and exposes the resulting DATABASE_URL to all workers via
// a tempfile path stored in env var LAIKI_TEST_DB_URL_FILE.
//
// Per-worker `setup.ts` reads that file and sets process.env.DATABASE_URL
// BEFORE any application module that reads DATABASE_URL at import time
// (src/db/client.ts) is loaded.
//
// Fallbacks (in order):
//   1. DATABASE_URL_TEST already provided -> use it as-is.
//   2. LAIKI_SKIP_INTEGRATION=1 -> skip; suites mark themselves skipped.
//   3. Docker/testcontainers unavailable -> skip gracefully.
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export default async function globalSetup(): Promise<() => Promise<void>> {
  const dir = mkdtempSync(join(tmpdir(), "laiki-itest-"));
  const file = join(dir, "db.url");
  process.env.LAIKI_TEST_DB_URL_FILE = file;

  let url: string | null = null;
  let container: { stop: () => Promise<unknown> } | null = null;

  if (process.env.DATABASE_URL_TEST) {
    url = process.env.DATABASE_URL_TEST;
  } else if (process.env.LAIKI_SKIP_INTEGRATION === "1") {
    url = null;
  } else {
    try {
      const { PostgreSqlContainer } = await import("@testcontainers/postgresql");
      const started = await new PostgreSqlContainer("postgres:16-alpine")
        .withDatabase("laiki_test")
        .withUsername("test")
        .withPassword("test")
        .start();
      url = started.getConnectionUri();
      container = started;
      // eslint-disable-next-line no-console
      console.log(`[itest] postgres container ready`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[itest] integration container unavailable, suites will skip: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  if (url) {
    // Run migrations exactly once.
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const postgres = (await import("postgres")).default;
    const sql = postgres(url, { max: 1 });
    const d = drizzle(sql);
    await migrate(d, { migrationsFolder: "./drizzle" });
    await sql.end();
  }

  writeFileSync(file, url ?? "");

  return async () => {
    if (container) {
      try {
        await container.stop();
      } catch {
        /* ignore */
      }
    }
  };
}
