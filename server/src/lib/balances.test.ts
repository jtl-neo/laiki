// computeBalances depends on the database (drizzle queries against postgres).
// A meaningful unit test would require mocking the entire db module or running
// an integration test against a real Postgres instance. Skipping pure-unit
// coverage here; covered by integration tests instead.
import { describe, it } from "vitest";

describe.skip("computeBalances (requires DB)", () => {
  it("is covered by integration tests", () => {});
});
