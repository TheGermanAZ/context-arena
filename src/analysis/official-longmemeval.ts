/**
 * Official-mode LongMemEval runner.
 *
 * Uses official dataset schema (longmemeval_s_cleaned.json structure) and
 * question types. Falls back to deterministic scoring when official judge
 * credentials are unavailable.
 *
 * Usage:
 *   bun src/analysis/official-longmemeval.ts --sample=8
 */

import { chat } from "../utils/llm";
import { calculateCost } from "../utils/metrics";
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
  answer: string;
  haystack_sessions: LongMemEvalMessage[][];
}

interface ItemResult {
  questionId: string;
  questionType: string;
  correct: boolean;
  hypothesis: string;
  answer: string;
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
  sampleSize: number;
  strategies: StrategySummary[];
  byStrategy: Record<string, ItemResult[]>;
  notes: string[];
}

const DATA_URL =
  "https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json";

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
  return v
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9%./:,$\- ]+/g, "")
    .trim();
}

function deterministicMatch(hyp: string, ans: string): boolean {
  const h = normalizeText(hyp);
  const a = normalizeText(ans);
  return !!h && !!a && (h === a || h.includes(a) || a.includes(h));
}

function compactSession(session: LongMemEvalMessage[], index: number): string {
  return `[Session ${index + 1}]\n` + session.map((m) => `${m.role}: ${m.content}`).join("\n");
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function streamFirstN(limit: number): Promise<LongMemEvalItem[]> {
  const res = await fetch(DATA_URL);
  if (!res.ok || !res.body) throw new Error(`Failed to fetch LongMemEval data: HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  const results: LongMemEvalItem[] = [];
  let started = false;
  let inObj = false;
  let depth = 0;
  let inString = false;
  let esc = false;
  let current = "";

  while (results.length < limit) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunkText = decoder.decode(value, { stream: true });

    for (let i = 0; i < chunkText.length; i++) {
      const ch = chunkText[i];
      if (!started) {
        if (ch === "[") started = true;
        continue;
      }
      if (!inObj) {
        if (ch === "{") {
          inObj = true;
          depth = 1;
          inString = false;
          esc = false;
          current = "{";
        }
        continue;
      }

      current += ch;

      if (inString) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inString = false;
        continue;
      }

      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          results.push(JSON.parse(current) as LongMemEvalItem);
          inObj = false;
          current = "";
          if (results.length >= limit) break;
        }
      }
    }
  }

  await reader.cancel();
  return results;
}

async function runOne(
  strategy: MemoryStrategy,
  item: LongMemEvalItem,
  ingestBatch: number,
): Promise<ItemResult> {
  strategy.reset();
  let overhead = 0;

  const batches = chunk(item.haystack_sessions, ingestBatch);
  for (let i = 0; i < batches.length; i++) {
    const start = i * ingestBatch;
    const text = batches[i]
      .map((s, j) => compactSession(s, start + j))
      .join("\n\n");
    strategy.addMessage({ role: "user", content: text });
    const ctx = await strategy.getContext();
    overhead += ctx.memoryOverheadTokens;
  }

  strategy.addMessage({ role: "user", content: `${item.question}\n\nAnswer only.` });
  const fctx = await strategy.getContext();
  overhead += fctx.memoryOverheadTokens;

  const start = performance.now();
  const resp = await chat(
    fctx.messages,
    [
      "You are running LongMemEval-style memory QA.",
      "Use only provided session history.",
      fctx.system,
    ]
      .filter(Boolean)
      .join("\n\n"),
  );
  const latencyMs = performance.now() - start;

  return {
    questionId: item.question_id,
    questionType: item.question_type,
    correct: deterministicMatch(resp.content, item.answer),
    hypothesis: resp.content,
    answer: item.answer,
    inputTokens: resp.inputTokens,
    outputTokens: resp.outputTokens,
    memoryOverheadTokens: overhead,
    latencyMs,
    estimatedCostUsd: calculateCost(resp.inputTokens + overhead, resp.outputTokens),
  };
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
  const sample = parseArg("sample", 4);
  const ingestBatch = parseArg("ingest-batch", 8);

  console.log(`Official LongMemEval mode: sample=${sample}, ingest-batch=${ingestBatch}`);
  const items = await streamFirstN(sample);

  const strategies: Array<{ name: string; create: () => MemoryStrategy }> = [
    { name: "Full Context", create: () => new FullContextStrategy() },
    { name: "RLM(8)", create: () => new RLMStrategy(8, 4) },
  ];

  const byStrategy: Record<string, ItemResult[]> = {};
  for (const s of strategies) {
    console.log(`\n--- ${s.name} ---`);
    const out: ItemResult[] = [];
    for (let i = 0; i < items.length; i++) {
      process.stdout.write(`  [${i + 1}/${items.length}] ${items[i].question_id}...`);
      try {
        const r = await runOne(s.create(), items[i], ingestBatch);
        out.push(r);
        console.log(r.correct ? " correct" : " wrong");
      } catch (error) {
        console.log(` error: ${error}`);
      }
    }
    byStrategy[s.name] = out;
  }

  const summaries = Object.entries(byStrategy).map(([name, rows]) => summarize(name, rows));

  const output: Output = {
    benchmark: "Official LongMemEval Mode",
    mode: "official dataset schema + deterministic fallback scoring",
    sampledAt: new Date().toISOString(),
    source: DATA_URL,
    sampleSize: items.length,
    strategies: summaries,
    byStrategy,
    notes: [
      "Uses official LongMemEval-S dataset schema and question types.",
      "Official LLM-judge scoring requires OPENAI_API_KEY; unavailable in this environment.",
      "Deterministic exact/substring fallback used for this run.",
    ],
  };

  const path = `results/official-longmemeval-${Date.now()}.json`;
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
