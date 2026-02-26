/**
 * Internal benchmark: scale ladder (8k/32k/128k/1M target contexts).
 *
 * Usage:
 *   bun src/analysis/internal-scale-ladder.ts
 *   bun src/analysis/internal-scale-ladder.ts --tiers=8000,32000,128000
 */

import { chat } from "../utils/llm";
import { calculateCost } from "../utils/metrics";
import type { MemoryStrategy } from "../strategies/base";
import { FullContextStrategy } from "../strategies/full-context";
import { RLMStrategy } from "../strategies/rlm";

interface TierResult {
  strategyName: string;
  tierTargetTokens: number;
  achievedApproxTokens: number;
  correct: boolean;
  predicted: string;
  inputTokens: number;
  outputTokens: number;
  memoryOverheadTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
  skipped?: boolean;
  skipReason?: string;
}

interface Summary {
  strategyName: string;
  total: number;
  passed: number;
  passRate: number;
  avgLatencyMs: number;
  totalEstimatedCostUsd: number;
}

interface Output {
  benchmark: string;
  sampledAt: string;
  tiers: number[];
  strategies: Summary[];
  byStrategy: Record<string, TierResult[]>;
  notes: string[];
}

function parseTiers(): number[] {
  const raw = process.argv
    .slice(2)
    .find((arg) => arg.startsWith("--tiers="))
    ?.split("=")[1];
  if (!raw) return [8000, 32000, 128000, 1000000];
  const values = raw
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v > 0)
    .map((v) => Math.floor(v));
  return values.length > 0 ? values : [8000, 32000, 128000, 1000000];
}

function buildContext(targetTokens: number): { prompt: string; approxTokens: number; answer: string } {
  const keyFact = "KEY FACT: release code is AURORA-991.";
  const fillerLine =
    "FILLER: operations memo about routine status updates, dependencies, and non-critical background details.";

  const approxCharsPerToken = 4;
  const targetChars = targetTokens * approxCharsPerToken;

  let body = keyFact + "\n";
  while (body.length < targetChars) {
    body += fillerLine + "\n";
  }

  return {
    prompt: body,
    approxTokens: Math.round(body.length / approxCharsPerToken),
    answer: "AURORA-991",
  };
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function isCorrect(predicted: string, answer: string): boolean {
  return normalizeText(predicted).includes(normalizeText(answer));
}

async function runTier(strategy: MemoryStrategy, tier: number): Promise<TierResult> {
  const built = buildContext(tier);

  strategy.reset();
  strategy.addMessage({ role: "user", content: built.prompt });

  const ctx = await strategy.getContext();

  strategy.addMessage({ role: "user", content: "What is the release code? Answer only the code." });
  const askCtx = await strategy.getContext();

  const start = performance.now();
  const response = await chat(
    askCtx.messages,
    ["Extract exact code from context.", askCtx.system].filter(Boolean).join("\n\n"),
  );
  const latencyMs = performance.now() - start;

  const overhead = ctx.memoryOverheadTokens + askCtx.memoryOverheadTokens;

  return {
    strategyName: strategy.name,
    tierTargetTokens: tier,
    achievedApproxTokens: built.approxTokens,
    correct: isCorrect(response.content, built.answer),
    predicted: response.content,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    memoryOverheadTokens: overhead,
    latencyMs,
    estimatedCostUsd: calculateCost(response.inputTokens + overhead, response.outputTokens),
  };
}

function summarize(strategyName: string, rows: TierResult[]): Summary {
  const total = rows.length;
  const passed = rows.filter((r) => r.correct).length;
  return {
    strategyName,
    total,
    passed,
    passRate: total > 0 ? passed / total : 0,
    avgLatencyMs: total > 0 ? rows.reduce((s, r) => s + r.latencyMs, 0) / total : 0,
    totalEstimatedCostUsd: rows.reduce((s, r) => s + r.estimatedCostUsd, 0),
  };
}

async function main() {
  const tiers = parseTiers();

  const strategies: Array<{ name: string; create: () => MemoryStrategy }> = [
    { name: "Full Context", create: () => new FullContextStrategy() },
    { name: "RLM(8)", create: () => new RLMStrategy(8, 4) },
  ];

  const byStrategy: Record<string, TierResult[]> = {};

  console.log(`Internal scale ladder: tiers=${tiers.join(", ")}`);

  for (const strat of strategies) {
    console.log(`\n--- ${strat.name} ---`);
    const rows: TierResult[] = [];
    for (const tier of tiers) {
      process.stdout.write(`  tier ${tier}...`);
      try {
        const result = await runTier(strat.create(), tier);
        rows.push(result);
        console.log(result.correct ? " pass" : " fail");
      } catch (error) {
        rows.push({
          strategyName: strat.name,
          tierTargetTokens: tier,
          achievedApproxTokens: 0,
          correct: false,
          predicted: "",
          inputTokens: 0,
          outputTokens: 0,
          memoryOverheadTokens: 0,
          latencyMs: 0,
          estimatedCostUsd: 0,
          skipped: true,
          skipReason: String(error),
        });
        console.log(` skipped (${error})`);
      }
    }
    byStrategy[strat.name] = rows;
  }

  const summaries = Object.entries(byStrategy).map(([name, rows]) => summarize(name, rows));

  const output: Output = {
    benchmark: "Internal Scale Ladder",
    sampledAt: new Date().toISOString(),
    tiers,
    strategies: summaries,
    byStrategy,
    notes: [
      "Tier sizes are approximate token targets using text-length scaling.",
      "1M tier may skip or fail depending on provider/runtime limits.",
    ],
  };

  const path = `results/internal-scale-ladder-${Date.now()}.json`;
  await Bun.write(path, JSON.stringify(output, null, 2));

  console.log("\nSummary:");
  for (const s of summaries) {
    console.log(
      `  ${s.strategyName.padEnd(12)} ${s.passed}/${s.total} (${(s.passRate * 100).toFixed(1)}%) | avg latency ${(s.avgLatencyMs / 1000).toFixed(1)}s | total cost $${s.totalEstimatedCostUsd.toFixed(4)}`,
    );
  }

  console.log(`\nSaved: ${path}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
