/**
 * Official-mode MemoryAgentBench runner.
 *
 * Uses official dataset and split names from ai-hyz/MemoryAgentBench.
 * Subset selection:
 * - EventQA from Accurate_Retrieval by metadata.source containing "eventqa"
 * - FactConsolidation from Conflict_Resolution by metadata.source containing "factconsolidation"
 *
 * Usage:
 *   bun src/analysis/official-memoryagentbench.ts --sample=2
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
  metadata: { source?: string };
}

interface Case {
  subset: "EventQA" | "FactConsolidation";
  source: string;
  context: string;
  question: string;
  accepted: string[];
}

interface CaseResult {
  subset: "EventQA" | "FactConsolidation";
  source: string;
  correct: boolean;
  question: string;
  hypothesis: string;
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
  mode: string;
  sampledAt: string;
  source: string;
  config: { samplePerSubset: number; maxContextChars: number };
  strategies: StrategySummary[];
  byStrategy: Record<string, CaseResult[]>;
  notes: string[];
}

const BASE =
  "https://datasets-server.huggingface.co/rows?dataset=ai-hyz/MemoryAgentBench&config=default";

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

function matchAny(hyp: string, accepted: string[]): boolean {
  const h = normalizeText(hyp);
  if (!h) return false;
  return accepted.some((ans) => {
    const a = normalizeText(ans);
    return !!a && (h === a || h.includes(a) || a.includes(h));
  });
}

function trimContext(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const half = Math.floor(maxChars / 2);
  return `${text.slice(0, half)}\n\n[...TRUNCATED FOR BOUNDED OFFICIAL-MODE RUN...]\n\n${text.slice(-half)}`;
}

async function fetchRows(split: string, length: number): Promise<MABRow[]> {
  const res = await fetch(`${BASE}&split=${encodeURIComponent(split)}&offset=0&length=${length}`);
  if (!res.ok) throw new Error(`Failed to fetch ${split}: HTTP ${res.status}`);
  const data = (await res.json()) as { rows: Array<{ row: MABRow }> };
  return (data.rows ?? []).map((r) => r.row);
}

async function retryChat(
  messages: { role: "user" | "assistant"; content: string }[],
  system: string,
  retries = 2,
) {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await chat(messages, system);
    } catch (error) {
      lastErr = error;
      if (i < retries) await Bun.sleep(700 * (i + 1));
    }
  }
  throw lastErr;
}

async function runCase(
  strategy: MemoryStrategy,
  c: Case,
  maxContextChars: number,
): Promise<CaseResult> {
  strategy.reset();
  strategy.addMessage({ role: "user", content: trimContext(c.context, maxContextChars) });
  const ingest = await strategy.getContext();

  strategy.addMessage({ role: "user", content: `${c.question}\n\nAnswer briefly.` });
  const ask = await strategy.getContext();

  const start = performance.now();
  const resp = await retryChat(
    ask.messages,
    [
      "You are answering MemoryAgentBench official-mode subset questions.",
      "Use only provided context.",
      ask.system,
    ]
      .filter(Boolean)
      .join("\n\n"),
  );
  const latencyMs = performance.now() - start;

  const overhead = ingest.memoryOverheadTokens + ask.memoryOverheadTokens;

  return {
    subset: c.subset,
    source: c.source,
    correct: matchAny(resp.content, c.accepted),
    question: c.question,
    hypothesis: resp.content,
    accepted: c.accepted,
    inputTokens: resp.inputTokens,
    outputTokens: resp.outputTokens,
    memoryOverheadTokens: overhead,
    latencyMs,
    estimatedCostUsd: calculateCost(resp.inputTokens + overhead, resp.outputTokens),
  };
}

function summarize(strategyName: string, rows: CaseResult[]): StrategySummary {
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
  const maxContextChars = parseArg("max-context-chars", 60000);

  console.log(`Official MemoryAgentBench mode: sample=${sample}, maxContextChars=${maxContextChars}`);

  const ar = await fetchRows("Accurate_Retrieval", 80);
  const cr = await fetchRows("Conflict_Resolution", 80);

  const event = ar
    .filter((r) => (r.metadata?.source ?? "").toLowerCase().includes("eventqa"))
    .slice(0, sample)
    .map(
      (r): Case => ({
        subset: "EventQA",
        source: r.metadata?.source ?? "",
        context: r.context,
        question: r.questions?.[0] ?? "",
        accepted: r.answers?.[0] ?? [],
      }),
    );

  const fact = cr
    .filter((r) => (r.metadata?.source ?? "").toLowerCase().includes("factconsolidation"))
    .slice(0, sample)
    .map(
      (r): Case => ({
        subset: "FactConsolidation",
        source: r.metadata?.source ?? "",
        context: r.context,
        question: r.questions?.[0] ?? "",
        accepted: r.answers?.[0] ?? [],
      }),
    );

  const cases = [...event, ...fact].filter((c) => c.question && c.context && c.accepted.length > 0);
  if (!cases.length) throw new Error("No official-mode subset cases found");

  const strategies: Array<{ name: string; create: () => MemoryStrategy }> = [
    { name: "Full Context", create: () => new FullContextStrategy() },
    { name: "RLM(8)", create: () => new RLMStrategy(8, 4) },
  ];

  const byStrategy: Record<string, CaseResult[]> = {};

  for (const s of strategies) {
    console.log(`\n--- ${s.name} ---`);
    const out: CaseResult[] = [];
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      process.stdout.write(`  [${i + 1}/${cases.length}] ${c.subset} (${c.source})...`);
      try {
        const r = await runCase(s.create(), c, maxContextChars);
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
    benchmark: "Official MemoryAgentBench Mode",
    mode: "official splits/sources + deterministic scoring fallback",
    sampledAt: new Date().toISOString(),
    source: BASE,
    config: { samplePerSubset: sample, maxContextChars },
    strategies: summaries,
    byStrategy,
    notes: [
      "Uses official dataset and split names (Accurate_Retrieval, Conflict_Resolution).",
      "EventQA and FactConsolidation selected by official metadata.source tags.",
      "Deterministic exact/substring scoring used in place of LLM-judge scoring due missing judge API credentials.",
    ],
  };

  const path = `results/official-memoryagentbench-${Date.now()}.json`;
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
