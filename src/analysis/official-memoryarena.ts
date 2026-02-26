/**
 * Official-mode MemoryArena runner.
 *
 * Uses official dataset/split: ZexueHe/memoryarena, config=bundled_shopping, split=test.
 *
 * Usage:
 *   bun src/analysis/official-memoryarena.ts --sample=2 --steps=2
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
  matchedAttributes: number;
  totalAttributes: number;
  inputTokens: number;
  outputTokens: number;
  memoryOverheadTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
}

interface StrategySummary {
  strategyName: string;
  total: number;
  correct: number;
  accuracy: number;
  avgLatencyMs: number;
  totalEstimatedCostUsd: number;
}

interface Output {
  benchmark: string;
  mode: string;
  sampledAt: string;
  source: string;
  config: { sample: number; stepsPerRow: number };
  strategies: StrategySummary[];
  byStrategy: Record<string, ItemResult[]>;
  notes: string[];
}

const ROWS_URL =
  "https://datasets-server.huggingface.co/rows?dataset=ZexueHe/memoryarena&config=bundled_shopping&split=test";

function parseArg(name: string, fallback: number): number {
  const raw = process.argv
    .slice(2)
    .find((a) => a.startsWith(`--${name}=`))
    ?.split("=")[1];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`--${name} must be positive`);
  return Math.floor(n);
}

function normalizeText(v: string): string {
  return v.toLowerCase().replace(/\s+/g, " ").trim();
}

function score(predicted: string, gold: ArenaAnswer): { correct: boolean; matched: number } {
  const p = normalizeText(predicted);
  const asin = normalizeText(gold.target_asin);
  const asinMatch = asin.length > 0 && p.includes(asin);

  let matched = 0;
  for (const attr of gold.attributes ?? []) {
    if (attr && p.includes(normalizeText(attr))) matched++;
  }

  const attrThreshold = Math.ceil((gold.attributes?.length ?? 0) / 2);
  const correct = asinMatch || ((gold.attributes?.length ?? 0) > 0 && matched >= attrThreshold);
  return { correct, matched };
}

async function fetchRows(sample: number): Promise<ArenaRow[]> {
  const res = await fetch(`${ROWS_URL}&offset=0&length=${sample}`);
  if (!res.ok) throw new Error(`Failed to load MemoryArena rows: HTTP ${res.status}`);
  const data = (await res.json()) as { rows: Array<{ row: ArenaRow }> };
  return (data.rows ?? []).map((r) => r.row);
}

async function runOneRow(
  strategy: MemoryStrategy,
  row: ArenaRow,
  stepsPerRow: number,
): Promise<ItemResult[]> {
  strategy.reset();
  const maxSteps = Math.min(stepsPerRow, row.questions.length, row.answers.length);

  const out: ItemResult[] = [];
  for (let i = 0; i < maxSteps; i++) {
    strategy.addMessage({ role: "user", content: row.questions[i] });
    const ctx = await strategy.getContext();

    const start = performance.now();
    const resp = await chat(
      ctx.messages,
      [
        "You are solving MemoryArena bundled_shopping tasks.",
        "Return concise selected product details with ASIN when possible.",
        ctx.system,
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
    const latencyMs = performance.now() - start;

    strategy.addMessage({ role: "assistant", content: resp.content });

    const gold = row.answers[i];
    const scored = score(resp.content, gold);

    out.push({
      rowId: row.id,
      category: row.category,
      step: i + 1,
      correct: scored.correct,
      predicted: resp.content,
      goldAsin: gold.target_asin,
      matchedAttributes: scored.matched,
      totalAttributes: gold.attributes.length,
      inputTokens: resp.inputTokens,
      outputTokens: resp.outputTokens,
      memoryOverheadTokens: ctx.memoryOverheadTokens,
      latencyMs,
      estimatedCostUsd: calculateCost(resp.inputTokens + ctx.memoryOverheadTokens, resp.outputTokens),
    });
  }

  return out;
}

function summarize(strategyName: string, rows: ItemResult[]): StrategySummary {
  const total = rows.length;
  const correct = rows.filter((r) => r.correct).length;
  return {
    strategyName,
    total,
    correct,
    accuracy: total ? correct / total : 0,
    avgLatencyMs: total ? rows.reduce((s, r) => s + r.latencyMs, 0) / total : 0,
    totalEstimatedCostUsd: rows.reduce((s, r) => s + r.estimatedCostUsd, 0),
  };
}

async function main() {
  const sample = parseArg("sample", 2);
  const steps = parseArg("steps", 2);

  console.log(`Official MemoryArena mode: sample=${sample}, steps=${steps}`);
  const rows = await fetchRows(sample);

  const strategies: Array<{ name: string; create: () => MemoryStrategy }> = [
    { name: "Full Context", create: () => new FullContextStrategy() },
    { name: "RLM(8)", create: () => new RLMStrategy(8, 4) },
  ];

  const byStrategy: Record<string, ItemResult[]> = {};

  for (const s of strategies) {
    console.log(`\n--- ${s.name} ---`);
    const results: ItemResult[] = [];
    for (let i = 0; i < rows.length; i++) {
      process.stdout.write(`  [${i + 1}/${rows.length}] row ${rows[i].id}...`);
      try {
        const rs = await runOneRow(s.create(), rows[i], steps);
        results.push(...rs);
        console.log(` ${rs.filter((x) => x.correct).length}/${rs.length}`);
      } catch (error) {
        console.log(` error: ${error}`);
      }
    }
    byStrategy[s.name] = results;
  }

  const summaries = Object.entries(byStrategy).map(([name, rows]) => summarize(name, rows));

  const output: Output = {
    benchmark: "Official MemoryArena Mode",
    mode: "official dataset split + deterministic success check",
    sampledAt: new Date().toISOString(),
    source: ROWS_URL,
    config: { sample, stepsPerRow: steps },
    strategies: summaries,
    byStrategy,
    notes: [
      "Uses official MemoryArena dataset config/split (bundled_shopping/test).",
      "Environment-interactive success-rate pipeline is out of scope for one-day bounded run.",
      "Step-level deterministic success used: ASIN match or >=50% attribute match.",
    ],
  };

  const path = `results/official-memoryarena-${Date.now()}.json`;
  await Bun.write(path, JSON.stringify(output, null, 2));

  for (const s of summaries) {
    console.log(
      `  ${s.strategyName.padEnd(12)} ${s.correct}/${s.total} (${(s.accuracy * 100).toFixed(1)}%) | avg latency ${(s.avgLatencyMs / 1000).toFixed(1)}s | total cost $${s.totalEstimatedCostUsd.toFixed(4)}`,
    );
  }

  console.log(`\nSaved: ${path}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
