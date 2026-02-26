/**
 * Industry slice runner: MemoryAgentBench subset proxy.
 *
 * Uses HF dataset `ai-hyz/MemoryAgentBench` and filters:
 * - EventQA rows from Accurate_Retrieval (source contains eventqa)
 * - FactConsolidation rows from Conflict_Resolution (source contains factconsolidation)
 *
 * Usage:
 *   bun src/analysis/memoryagentbench-slice.ts --sample=2
 */

import { chat } from "../utils/llm";
import { calculateCost } from "../utils/metrics";
import type { MemoryStrategy } from "../strategies/base";
import { FullContextStrategy } from "../strategies/full-context";
import { RLMStrategy } from "../strategies/rlm";

interface MABRow {
  context: string;
  questions: string[];
  answers: string[][];
  metadata: {
    source?: string;
  };
}

interface CaseResult {
  subset: "EventQA" | "FactConsolidation";
  source: string;
  correct: boolean;
  question: string;
  predicted: string;
  accepted: string[];
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
  sampledAt: string;
  source: string;
  config: { samplePerSubset: number };
  strategies: StrategySummary[];
  byStrategy: Record<string, CaseResult[]>;
  notes: string[];
}

const DATASET_BASE =
  "https://datasets-server.huggingface.co/rows?dataset=ai-hyz/MemoryAgentBench&config=default";

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
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9%./:,$\- ]+/g, "")
    .trim();
}

function trimContext(context: string, maxChars: number): string {
  if (context.length <= maxChars) return context;
  const half = Math.floor(maxChars / 2);
  const head = context.slice(0, half);
  const tail = context.slice(-half);
  return `${head}\n\n[...TRUNCATED FOR ONE-DAY PROXY RUN...]\n\n${tail}`;
}

function matchesAny(predicted: string, accepted: string[]): boolean {
  const p = normalizeText(predicted);
  if (!p) return false;
  return accepted.some((a) => {
    const g = normalizeText(a);
    return g.length > 0 && (p === g || p.includes(g) || g.includes(p));
  });
}

async function retryChat(
  messages: { role: "user" | "assistant"; content: string }[],
  system: string,
  retries = 2,
) {
  let lastError: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await chat(messages, system);
    } catch (error) {
      lastError = error;
      if (i < retries) {
        await Bun.sleep(750 * (i + 1));
      }
    }
  }
  throw lastError;
}

async function fetchSplitRows(split: string, length: number): Promise<MABRow[]> {
  const url = `${DATASET_BASE}&split=${encodeURIComponent(split)}&offset=0&length=${length}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`MemoryAgentBench fetch failed for ${split}: HTTP ${response.status}`);
  }
  const data = (await response.json()) as { rows: Array<{ row: MABRow }> };
  return (data.rows ?? []).map((r) => r.row);
}

async function runCase(
  strategy: MemoryStrategy,
  subset: "EventQA" | "FactConsolidation",
  source: string,
  context: string,
  question: string,
  accepted: string[],
  maxContextChars: number,
): Promise<CaseResult> {
  strategy.reset();

  strategy.addMessage({ role: "user", content: trimContext(context, maxContextChars) });
  const ingest = await strategy.getContext();

  strategy.addMessage({ role: "user", content: `${question}\n\nAnswer briefly.` });
  const ask = await strategy.getContext();

  const start = performance.now();
  const response = await retryChat(
    ask.messages,
    [
      "You are answering from long context memory.",
      "Use the provided context only.",
      ask.system,
    ]
      .filter(Boolean)
      .join("\n\n"),
  );
  const latencyMs = performance.now() - start;

  const overhead = ingest.memoryOverheadTokens + ask.memoryOverheadTokens;

  return {
    subset,
    source,
    correct: matchesAny(response.content, accepted),
    question,
    predicted: response.content,
    accepted,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    memoryOverheadTokens: overhead,
    latencyMs,
    estimatedCostUsd: calculateCost(response.inputTokens + overhead, response.outputTokens),
  };
}

function summarize(strategyName: string, rows: CaseResult[]): StrategySummary {
  const total = rows.length;
  const correct = rows.filter((r) => r.correct).length;
  return {
    strategyName,
    total,
    correct,
    accuracy: total > 0 ? correct / total : 0,
    avgLatencyMs: total > 0 ? rows.reduce((s, r) => s + r.latencyMs, 0) / total : 0,
    totalEstimatedCostUsd: rows.reduce((s, r) => s + r.estimatedCostUsd, 0),
  };
}

async function main() {
  const sample = parseArg("sample", 2);
  const maxContextChars = parseArg("max-context-chars", 100000);

  console.log(`MemoryAgentBench slice: sample per subset=${sample}`);

  const arRows = await fetchSplitRows("Accurate_Retrieval", 80);
  const crRows = await fetchSplitRows("Conflict_Resolution", 80);

  const eventRows = arRows.filter((r) => (r.metadata?.source ?? "").toLowerCase().includes("eventqa")).slice(0, sample);
  const factRows = crRows.filter((r) => (r.metadata?.source ?? "").toLowerCase().includes("factconsolidation")).slice(0, sample);

  const testCases = [
    ...eventRows.map((r) => ({
      subset: "EventQA" as const,
      source: r.metadata?.source ?? "",
      context: r.context,
      question: r.questions?.[0] ?? "",
      accepted: r.answers?.[0] ?? [],
    })),
    ...factRows.map((r) => ({
      subset: "FactConsolidation" as const,
      source: r.metadata?.source ?? "",
      context: r.context,
      question: r.questions?.[0] ?? "",
      accepted: r.answers?.[0] ?? [],
    })),
  ].filter((c) => c.question && c.context && c.accepted.length > 0);

  if (testCases.length === 0) {
    throw new Error("No test cases found for EventQA/FactConsolidation filters");
  }

  const strategies: Array<{ name: string; create: () => MemoryStrategy }> = [
    { name: "Full Context", create: () => new FullContextStrategy() },
    { name: "RLM(8)", create: () => new RLMStrategy(8, 4) },
  ];

  const byStrategy: Record<string, CaseResult[]> = {};

  for (const strat of strategies) {
    console.log(`\n--- ${strat.name} ---`);
    const rows: CaseResult[] = [];
    for (let i = 0; i < testCases.length; i++) {
      const c = testCases[i];
      process.stdout.write(`  [${i + 1}/${testCases.length}] ${c.subset} (${c.source})...`);
      try {
        const result = await runCase(
          strat.create(),
          c.subset,
          c.source,
          c.context,
          c.question,
          c.accepted,
          maxContextChars,
        );
        rows.push(result);
        console.log(result.correct ? " correct" : " wrong");
      } catch (error) {
        console.log(` error: ${error}`);
      }
    }
    byStrategy[strat.name] = rows;
  }

  const summaries = Object.entries(byStrategy).map(([name, rows]) => summarize(name, rows));

  const output: Output = {
    benchmark: "MemoryAgentBench Subset (Proxy)",
    sampledAt: new Date().toISOString(),
    source: DATASET_BASE,
    config: {
      samplePerSubset: sample,
    },
    strategies: summaries,
    byStrategy,
    notes: [
      "Proxy one-day run using ai-hyz/MemoryAgentBench rows endpoint.",
      "Subset filter: EventQA from Accurate_Retrieval + FactConsolidation from Conflict_Resolution via metadata.source.",
      "Scoring uses normalized exact/substring match against accepted answers.",
      `Context is trimmed to ${maxContextChars} chars for bounded one-day execution.`,
    ],
  };

  const path = `results/memoryagentbench-slice-${Date.now()}.json`;
  await Bun.write(path, JSON.stringify(output, null, 2));

  console.log("\nSummary:");
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
