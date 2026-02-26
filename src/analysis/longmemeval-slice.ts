/**
 * One-day industry benchmark slice: LongMemEval-S (sampled).
 *
 * This script streams only the first N records from the public JSON source
 * (without downloading the full 264MB file), then runs our strategies against
 * that slice.
 *
 * IMPORTANT: This is a fast proxy run, not the official LongMemEval pipeline.
 * We compact each haystack session into one message to keep run-time bounded.
 *
 * Usage:
 *   bun src/analysis/longmemeval-slice.ts --sample=10
 */

import { chat } from "../utils/llm";
import { calculateCost } from "../utils/metrics";
import type { LLMMessage } from "../utils/llm";
import type { MemoryStrategy } from "../strategies/base";
import { FullContextStrategy } from "../strategies/full-context";
import { RLMStrategy } from "../strategies/rlm";

interface LongMemEvalMessage {
  role: string;
  content: string;
}

interface LongMemEvalItem {
  question_id: string;
  question_type: string;
  question: string;
  question_date: string;
  answer: string;
  answer_session_ids: string[];
  haystack_dates: string[];
  haystack_session_ids: string[];
  haystack_sessions: LongMemEvalMessage[][];
}

interface SliceItemResult {
  questionId: string;
  questionType: string;
  question: string;
  goldAnswer: string;
  predictedAnswer: string;
  correct: boolean;
  tokenF1: number;
  inputTokens: number;
  outputTokens: number;
  memoryOverheadTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
}

interface StrategySliceSummary {
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

interface SliceOutput {
  benchmark: string;
  mode: string;
  source: string;
  sampledAt: string;
  sampleSize: number;
  strategies: StrategySliceSummary[];
  byStrategy: Record<string, SliceItemResult[]>;
  notes: string[];
}

const DATA_URL =
  "https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json";

function parseArg(name: string, fallback: number): number {
  const raw = process.argv
    .slice(2)
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.split("=")[1];

  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`--${name} must be a positive number`);
  }
  return Math.floor(n);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9%./:,$\- ]+/g, "")
    .trim();
}

function tokenF1(predicted: string, gold: string): number {
  const p = normalizeText(predicted).split(" ").filter(Boolean);
  const g = normalizeText(gold).split(" ").filter(Boolean);
  if (p.length === 0 || g.length === 0) return 0;

  const gCounts = new Map<string, number>();
  for (const tok of g) {
    gCounts.set(tok, (gCounts.get(tok) ?? 0) + 1);
  }

  let overlap = 0;
  for (const tok of p) {
    const count = gCounts.get(tok) ?? 0;
    if (count > 0) {
      overlap++;
      gCounts.set(tok, count - 1);
    }
  }

  if (overlap === 0) return 0;
  const precision = overlap / p.length;
  const recall = overlap / g.length;
  return (2 * precision * recall) / (precision + recall);
}

function isCorrect(predicted: string, gold: string): boolean {
  const p = normalizeText(predicted);
  const g = normalizeText(gold);
  if (!p || !g) return false;

  // Fast proxy matching for short-form answers in this one-day slice.
  return p === g || p.includes(g) || g.includes(p);
}

function compactSession(session: LongMemEvalMessage[], index: number): string {
  const lines = session.map((m) => `${m.role}: ${m.content}`);
  return `[LongMemEval Session ${index + 1}]\n${lines.join("\n")}`;
}

async function streamFirstNLongMemEvalItems(url: string, limit: number): Promise<LongMemEvalItem[]> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to fetch LongMemEval source: HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  const results: LongMemEvalItem[] = [];

  let started = false;
  let inObject = false;
  let depth = 0;
  let inString = false;
  let escaping = false;
  let current = "";

  while (results.length < limit) {
    const { value, done } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });

    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];

      if (!started) {
        if (ch === "[") started = true;
        continue;
      }

      if (!inObject) {
        if (ch === "{") {
          inObject = true;
          depth = 1;
          inString = false;
          escaping = false;
          current = "{";
        }
        continue;
      }

      current += ch;

      if (inString) {
        if (escaping) escaping = false;
        else if (ch === "\\") escaping = true;
        else if (ch === '"') inString = false;
        continue;
      }

      if (ch === '"') {
        inString = true;
      } else if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const parsed = JSON.parse(current) as LongMemEvalItem;
          results.push(parsed);
          inObject = false;
          current = "";
          if (results.length >= limit) break;
        }
      }
    }
  }

  await reader.cancel();
  return results;
}

async function runOneQuestion(
  strategy: MemoryStrategy,
  item: LongMemEvalItem,
  ingestBatchSize: number,
): Promise<SliceItemResult> {
  strategy.reset();

  const started = performance.now();
  let overheadTokens = 0;

  const groupedSessions = chunk(item.haystack_sessions, ingestBatchSize);
  for (let i = 0; i < groupedSessions.length; i++) {
    const start = i * ingestBatchSize;
    const compacted = groupedSessions[i]
      .map((session, offset) => compactSession(session, start + offset))
      .join("\n\n");

    strategy.addMessage({
      role: "user",
      content: compacted,
    });

    const ingestContext = await strategy.getContext();
    overheadTokens += ingestContext.memoryOverheadTokens;
  }

  strategy.addMessage({
    role: "user",
    content: `${item.question}\n\nRespond with only the shortest exact answer phrase from memory.`,
  });

  const finalContext = await strategy.getContext();
  overheadTokens += finalContext.memoryOverheadTokens;

  const response = await chat(
    finalContext.messages,
    [
      "You are answering long-memory QA.",
      "Use only what appears in the prior sessions.",
      "Return concise answer text only.",
      finalContext.system,
    ]
      .filter(Boolean)
      .join("\n\n"),
  );

  const elapsed = performance.now() - started;
  const correct = isCorrect(response.content, item.answer);
  const f1 = tokenF1(response.content, item.answer);

  return {
    questionId: item.question_id,
    questionType: item.question_type,
    question: item.question,
    goldAnswer: item.answer,
    predictedAnswer: response.content,
    correct,
    tokenF1: f1,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    memoryOverheadTokens: overheadTokens,
    latencyMs: elapsed,
    estimatedCostUsd: calculateCost(response.inputTokens + overheadTokens, response.outputTokens),
  };
}

function summarize(strategyName: string, rows: SliceItemResult[]): StrategySliceSummary {
  const sampleSize = rows.length;
  const correct = rows.filter((r) => r.correct).length;

  return {
    strategyName,
    sampleSize,
    correct,
    accuracy: sampleSize > 0 ? correct / sampleSize : 0,
    avgInputTokens:
      sampleSize > 0 ? rows.reduce((s, r) => s + r.inputTokens, 0) / sampleSize : 0,
    avgOutputTokens:
      sampleSize > 0 ? rows.reduce((s, r) => s + r.outputTokens, 0) / sampleSize : 0,
    avgMemoryOverheadTokens:
      sampleSize > 0 ? rows.reduce((s, r) => s + r.memoryOverheadTokens, 0) / sampleSize : 0,
    avgLatencyMs:
      sampleSize > 0 ? rows.reduce((s, r) => s + r.latencyMs, 0) / sampleSize : 0,
    totalEstimatedCostUsd: rows.reduce((s, r) => s + r.estimatedCostUsd, 0),
  };
}

async function main() {
  const sample = parseArg("sample", 10);
  const ingestBatch = parseArg("ingest-batch", 4);
  if (ingestBatch <= 0) {
    throw new Error("--ingest-batch must be > 0");
  }

  console.log(`LongMemEval-S slice: streaming first ${sample} items...`);
  const items = await streamFirstNLongMemEvalItems(DATA_URL, sample);
  console.log(`Loaded ${items.length} items`);

  const strategies: Array<{ name: string; create: () => MemoryStrategy }> = [
    { name: "Full Context", create: () => new FullContextStrategy() },
    { name: "RLM(8)", create: () => new RLMStrategy(8, 4) },
  ];

  const byStrategy: Record<string, SliceItemResult[]> = {};

  for (const strat of strategies) {
    const rows: SliceItemResult[] = [];
    console.log(`\n--- ${strat.name} ---`);
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      process.stdout.write(`  [${i + 1}/${items.length}] ${item.question_id}...`);
      try {
        const result = await runOneQuestion(strat.create(), item, ingestBatch);
        rows.push(result);
        console.log(result.correct ? " correct" : " wrong");
      } catch (error) {
        console.log(` error: ${error}`);
      }
    }
    byStrategy[strat.name] = rows;
  }

  const strategiesSummary = Object.entries(byStrategy).map(([strategyName, rows]) =>
    summarize(strategyName, rows),
  );

  const output: SliceOutput = {
    benchmark: "LongMemEval-S Slice (Proxy)",
    mode: `session-compacted, streamed first N records, ingest-batch=${ingestBatch}`,
    source: DATA_URL,
    sampledAt: new Date().toISOString(),
    sampleSize: items.length,
    strategies: strategiesSummary,
    byStrategy,
    notes: [
      "Fast one-day proxy, not official LongMemEval pipeline.",
      "Each haystack session is compacted into one synthetic message for bounded runtime.",
      "Scoring uses normalized exact/substring match plus token F1 for visibility.",
    ],
  };

  const path = `results/longmemeval-slice-${Date.now()}.json`;
  await Bun.write(path, JSON.stringify(output, null, 2));

  console.log("\nSummary:");
  for (const s of strategiesSummary) {
    console.log(
      `  ${s.strategyName.padEnd(12)} ${s.correct}/${s.sampleSize} (${(s.accuracy * 100).toFixed(1)}%) | avg latency ${(s.avgLatencyMs / 1000).toFixed(1)}s | total cost $${s.totalEstimatedCostUsd.toFixed(4)}`,
    );
  }
  console.log(`\nSaved: ${path}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
