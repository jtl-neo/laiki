// L4 eval: run the golden dataset against the REAL provider chain and
// measure prompt quality. Costs money and needs API keys, so it is gated
// behind LAIKI_EVAL=1 and never runs in CI (T-401~403).
//
//   LAIKI_EVAL=1 npx vitest run test/eval/
//
// Thresholds (T-403): type ≥ 95%, amount ≥ 95%, debts-exact ≥ 85%.
// Below threshold → tune the prompt (UNIFIED_SYSTEM_INSTRUCTION), not code.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EVAL = process.env.LAIKI_EVAL === "1";

type Expected = {
  type: string;
  total_amount?: number | null;
  debts?: { name: string; amount: number }[];
  my_share?: number;
  fund_name?: string;
};

type GoldenCase = { text: string; expect: Expected };

const CONTEXT = {
  aliases: ["a", "b", "c", "老王", "小美"],
  paymentMethods: ["富邦卡", "現金", "LINE Pay"],
  fundNames: ["家裡用的東西"],
};

function loadGolden(): GoldenCase[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, "golden.jsonl"), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as GoldenCase);
}

function debtsMatch(
  got: { name: string; amount: number }[],
  want: { name: string; amount: number }[],
): boolean {
  if (got.length !== want.length) return false;
  const key = (d: { name: string; amount: number }) => `${d.name}:${d.amount}`;
  const gotSet = new Set(got.map(key));
  return want.every((d) => gotSet.has(key(d)));
}

describe.skipIf(!EVAL)("L4 eval: golden dataset vs real provider", () => {
  it("meets the prompt-quality thresholds", async () => {
    const { parseUnified } = await import("../../src/ai/parseUnified.js");
    const { checkAndConsume } = await import("../../src/lib/quota.js");
    const quota = await checkAndConsume("eval", "parse");

    const cases = loadGolden();
    let typeOk = 0;
    let amountOk = 0;
    let splitTotal = 0;
    let splitOk = 0;
    const failures: string[] = [];

    for (const c of cases) {
      let parsed;
      try {
        parsed = await parseUnified(quota.provider, { text: c.text, context: CONTEXT });
      } catch (e) {
        failures.push(`PARSE FAIL: ${c.text} → ${e instanceof Error ? e.message : e}`);
        if (c.expect.debts) splitTotal++;
        continue;
      }

      const tOk = parsed.type === c.expect.type;
      if (tOk) typeOk++;
      else failures.push(`TYPE: ${c.text} → got ${parsed.type}, want ${c.expect.type}`);

      const wantAmount = c.expect.total_amount;
      const aOk =
        wantAmount === undefined ||
        (wantAmount === null
          ? parsed.data.total_amount === null
          : parsed.data.total_amount === wantAmount);
      if (aOk) amountOk++;
      else
        failures.push(
          `AMOUNT: ${c.text} → got ${parsed.data.total_amount}, want ${wantAmount}`,
        );

      if (c.expect.debts) {
        splitTotal++;
        if (debtsMatch(parsed.data.debts, c.expect.debts)) splitOk++;
        else
          failures.push(
            `DEBTS: ${c.text} → got ${JSON.stringify(parsed.data.debts)}, want ${JSON.stringify(c.expect.debts)}`,
          );
      }
    }

    const n = cases.length;
    const report = [
      `type:   ${typeOk}/${n} (${((typeOk / n) * 100).toFixed(1)}%)`,
      `amount: ${amountOk}/${n} (${((amountOk / n) * 100).toFixed(1)}%)`,
      `debts:  ${splitOk}/${splitTotal} (${splitTotal ? ((splitOk / splitTotal) * 100).toFixed(1) : "—"}%)`,
      ...failures.map((f) => `  ✗ ${f}`),
    ].join("\n");
    // vitest swallows console.log on passing tests; write the report to a
    // file (and raw stdout) so the numbers are always inspectable.
    const { writeFileSync } = await import("node:fs");
    const here = dirname(fileURLToPath(import.meta.url));
    writeFileSync(join(here, "last-report.txt"), `${report}\n`);
    process.stdout.write(`\n=== L4 EVAL REPORT ===\n${report}\n`);

    expect(typeOk / n).toBeGreaterThanOrEqual(0.95);
    expect(amountOk / n).toBeGreaterThanOrEqual(0.95);
    expect(splitTotal === 0 || splitOk / splitTotal >= 0.85).toBe(true);
  }, 600_000);
});
