/**
 * Industry slice runner: MemoryArena (bundled_shopping, sampled rows).
 *
 * Fast proxy run for one-day calibration. Uses HF datasets-server rows endpoint.
 *
 * Usage:
 *   bun src/analysis/memoryarena-slice.ts --sample=2 --steps=2
 */

import { chat } from "../utils/llm";
import { calculateCost } from "../utils/metrics";
import type { MemoryStrategy } from "../strategies/base";
import { FullContextStrategy } from "../strategies/full-context";
import { RLMStrategy } from "../strategies/rlm";

interface ArenaAnswer {
  target_asin: string;
  attributes: string[];
}

interface ArenaRow {
  id: number;
  questions: string[];
  answers: ArenaAnswer[];
  category: string;
}

interface ItemResult {
  rowId: number;
  category: string;
  step: number;
  correct: boolean;
  predicted: string;
  goldAsin: string;
  matchedAttributeCount: number;
  inputTokens: number;
  outputTokens: number;
  memoryOverheadTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
}

interface StrategySummary {
  strategyName: string;
  totalChecks: number;
  passedChecks: number;
  successRate: number;
  avgLatencyMs: number;
  totalEstimatedCostUsd: number;
}

interface Output {
  benchmark: string;
  sampledAt: string;
  source: string;
  config: {
    sample: number;
    stepsPerRow: number;
  };
  strategies: StrategySummary[];
  byStrategy: Record<string, ItemResult[]>;
  notes: string[];
}

const DATASET_ROWS_URL =
  "https://datasets-server.huggingface.co/rows?dataset=ZexueHe/memoryarena&config=bundled_shopping&split=test";

function parseArg(name: string, fallback: number): number {
  const raw = process.argv
    .slice(2)
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.split("=")[1];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`--${name} must be a positive number`);
  }
  return Math.floor(value);
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function scorePrediction(pred: string, gold: ArenaAnswer): { correct: boolean; matchedAttributeCount: number } {
  const normalized = normalizeText(pred);
  const asinMatch = normalized.includes(normalizeText(gold.target_asin));

  let matched = 0;
  for (const attr of gold.attributes ?? []) {
    if (attr && normalized.includes(normalizeText(attr))) {
      matched++;
    }
  }

  // Count as correct when ASIN is present OR at least half of attributes match.
  const correct = asinMatch || (gold.attributes.length > 0 && matched >= Math.ceil(gold.attributes.length / 2));
  return { correct, matchedAttributeCount: matched };
}

async function fetchRows(sample: number): Promise<ArenaRow[]> {
  const url = `${DATASET_ROWS_URL}&offset=0&length=${sample}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`MemoryArena fetch failed: HTTP ${response.status}`);
  const data = (await response.json()) as { rows: Array<{ row: ArenaRow }> };
  return (data.rows ?? []).map((r) => r.row);
}

async function runRowSteps(
  strategy: MemoryStrategy,
  row: ArenaRow,
  stepsPerRow: number,
): Promise<ItemResult[]> {
  strategy.reset();

  const out: ItemResult[] = [];

  const maxSteps = Math.min(stepsPerRow, row.questions.length, row.answers.length);

  for (let i = 0; i < maxSteps; i++) {
    strategy.addMessage({ role: "user", content: row.questions[i] });
    const ctx = await strategy.getContext();

    const start = performance.now();
    const response = await chat(
      ctx.messages,
      [
        "You are solving a shopping-agent benchmark question.",
        "Reply with concise purchase choice details.",
        "Include the chosen ASIN when possible.",
        ctx.system,
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
    const latencyMs = performance.now() - start;

    const gold = row.answers[i];
    const score = scorePrediction(response.content, gold);

    strategy.addMessage({ role: "assistant", content: response.content });

    out.push({
      rowId: row.id,
      category: row.category,
      step: i + 1,
      correct: score.correct,
      predicted: response.content,
      goldAsin: gold.target_asin,
      matchedAttributeCount: score.matchedAttributeCount,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      memoryOverheadTokens: ctx.memoryOverheadTokens,
      latencyMs,
      estimatedCostUsd: calculateCost(
        response.inputTokens + ctx.memoryOverheadTokens,
        response.outputTokens,
      ),
    });
  }

  return out;
}

function summarize(strategyName: string, results: ItemResult[]): StrategySummary {
  const totalChecks = results.length;
  const passedChecks = results.filter((r) => r.correct).length;
  const successRate = totalChecks > 0 ? passedChecks / totalChecks : 0;

  return {
    strategyName,
    totalChecks,
    passedChecks,
    successRate,
    avgLatencyMs:
      totalChecks > 0 ? results.reduce((s, r) => s + r.latencyMs, 0) / totalChecks : 0,
    totalEstimatedCostUsd: results.reduce((s, r) => s + r.estimatedCostUsd, 0),
  };
}

async function main() {
  const sample = parseArg("sample", 2);
  const steps = parseArg("steps", 2);

  console.log(`MemoryArena slice: sample=${sample}, steps=${steps}`);
  const rows = await fetchRows(sample);

  const strategies: Array<{ name: string; create: () => MemoryStrategy }> = [
    { name: "Full Context", create: () => new FullContextStrategy() },
    { name: "RLM(8)", create: () => new RLMStrategy(8, 4) },
  ];

  const byStrategy: Record<string, ItemResult[]> = {};

  for (const strat of strategies) {
    console.log(`\n--- ${strat.name} ---`);
    const acc: ItemResult[] = [];
    for (let i = 0; i < rows.length; i++) {
      process.stdout.write(`  [${i + 1}/${rows.length}] row ${rows[i].id}...`);
      try {
        const results = await runRowSteps(strat.create(), rows[i], steps);
        acc.push(...results);
        const pass = results.filter((r) => r.correct).length;
        console.log(` ${pass}/${results.length}`);
      } catch (error) {
        console.log(` error: ${error}`);
      }
    }
    byStrategy[strat.name] = acc;
  }

  const summaries = Object.entries(byStrategy).map(([name, results]) => summarize(name, results));

  const output: Output = {
    benchmark: "MemoryArena Slice (Proxy)",
    sampledAt: new Date().toISOString(),
    source: DATASET_ROWS_URL,
    config: {
      sample,
      stepsPerRow: steps,
    },
    strategies: summaries,
    byStrategy,
    notes: [
      "Proxy one-day run using bundled_shopping rows endpoint.",
      "Step scoring is relaxed (ASIN match or >=50% attribute match).",
      "Not an official MemoryArena success-rate pipeline.",
    ],
  };

  const path = `results/memoryarena-slice-${Date.now()}.json`;
  await Bun.write(path, JSON.stringify(output, null, 2));

  console.log("\nSummary:");
  for (const s of summaries) {
    console.log(
      `  ${s.strategyName.padEnd(12)} ${s.passedChecks}/${s.totalChecks} (${(s.successRate * 100).toFixed(1)}%) | avg latency ${(s.avgLatencyMs / 1000).toFixed(1)}s | total cost $${s.totalEstimatedCostUsd.toFixed(4)}`,
    );
  }
  console.log(`\nSaved: ${path}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
