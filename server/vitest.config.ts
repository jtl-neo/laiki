import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    globalSetup: ["test/global-setup.ts"],
    // Integration tests share a single Postgres container; serialise file
    // execution so TRUNCATE-based cleanup is safe between suites.
    pool: "forks",
    forks: { singleFork: true },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
