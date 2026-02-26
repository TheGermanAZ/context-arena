/**
 * Generate a combined one-day benchmark report from:
 *  - LongMemEval slice artifact
 *  - Memory-to-action micro-benchmark artifact
 *
 * Usage:
 *   bun src/analysis/one-day-report.ts
 *   bun src/analysis/one-day-report.ts --long=results/longmemeval-slice-123.json --micro=results/memory-action-micro-456.json
 */

import { readdirSync } from "fs";
import { basename } from "path";

interface LongSummary {
  strategyName: string;
  sampleSize: number;
  correct: number;
  accuracy: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgMemoryOverheadTokens: number;
  avgLatencyMs: number;
  totalEstimatedCostUsd: number;
}

interface LongOutput {
  benchmark: string;
  sampledAt: string;
  sampleSize: number;
  mode: string;
  strategies: LongSummary[];
  notes: string[];
}

interface MicroResult {
  strategyName: string;
  passed: boolean;
  matchedChecks: number;
  totalChecks: number;
  inputTokens: number;
  outputTokens: number;
  memoryOverheadTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
}

interface MicroOutput {
  benchmark: string;
  sampledAt: string;
  scenario: {
    name: string;
    description: string;
    requiredCheckCount: number;
  };
  strategies: MicroResult[];
}

function argPath(name: string): string | undefined {
  return process.argv
    .slice(2)
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.split("=")[1];
}

function latestResult(prefix: string): string {
  const files = readdirSync("results")
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    throw new Error(`No results found for prefix: ${prefix}`);
  }

  return `results/${files[files.length - 1]}`;
}

function fmtPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

async function main() {
  const longPath = argPath("long") ?? latestResult("longmemeval-slice-");
  const microPath = argPath("micro") ?? latestResult("memory-action-micro-");

  const longData = (await Bun.file(longPath).json()) as LongOutput;
  const microData = (await Bun.file(microPath).json()) as MicroOutput;

  const rows: string[] = [];

  for (const s of longData.strategies) {
    rows.push(
      `| LongMemEval-S Slice (n=${s.sampleSize}) | ${s.strategyName} | ${s.correct}/${s.sampleSize} (${fmtPct(s.accuracy)}) | ${Math.round(s.avgInputTokens).toLocaleString()} | ${Math.round(s.avgMemoryOverheadTokens).toLocaleString()} | ${(s.avgLatencyMs / 1000).toFixed(1)}s | $${s.totalEstimatedCostUsd.toFixed(4)} |`,
    );
  }

  for (const s of microData.strategies) {
    rows.push(
      `| Memory-to-Action Micro (1 scenario) | ${s.strategyName} | ${s.passed ? "PASS" : "FAIL"} (${s.matchedChecks}/${s.totalChecks}) | ${s.inputTokens.toLocaleString()} | ${s.memoryOverheadTokens.toLocaleString()} | ${(s.latencyMs / 1000).toFixed(1)}s | $${s.estimatedCostUsd.toFixed(4)} |`,
    );
  }

  const report = `# One-Day Benchmark Coverage Report

Generated: ${new Date().toISOString()}

## Scope
- Industry slice: **LongMemEval-S** (sampled proxy run)
- Internal gap check: **Memory-to-Action Micro**
- Strategies: **Full Context**, **RLM(8)**

## Combined Results
| Benchmark | Strategy | Score | Avg Input Tokens | Avg Memory Overhead Tokens | Avg Latency | Cost |
|---|---|---|---:|---:|---:|---:|
${rows.join("\n")}

## Artifacts
- LongMemEval slice result: \`${longPath}\`
- Memory-action micro result: \`${microPath}\`

## Notes
- LongMemEval run mode: ${longData.mode}
- This was a one-day calibration run, not the full official LongMemEval evaluation script.
- Proxy scoring uses normalized exact/substring matching (plus token F1 in raw artifact).
- Micro-benchmark is intentionally deterministic and checks memory-to-action grounding from corrected facts.

## Interpretation
- Use the LongMemEval slice as an external calibration signal.
- Use the micro benchmark as targeted evidence for memory-to-action behavior that our current suite under-covers.
- Next iteration should increase LongMemEval sample size and add 2-3 more action-grounded micro scenarios.
`;

  const outPath = "docs/research/one-day-benchmark-report.md";
  await Bun.write(outPath, report);

  console.log(`Report written: ${outPath}`);
  console.log(`Using: ${basename(longPath)} + ${basename(microPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
