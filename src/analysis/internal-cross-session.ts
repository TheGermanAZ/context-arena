/**
 * Internal benchmark: cross-session memory.
 *
 * Simulates three sessions with explicit resets and handoff summaries.
 *
 * Usage:
 *   bun src/analysis/internal-cross-session.ts
 */

import { chat } from "../utils/llm";
import { calculateCost } from "../utils/metrics";
import type { MemoryStrategy } from "../strategies/base";
import { FullContextStrategy } from "../strategies/full-context";
import { RLMStrategy } from "../strategies/rlm";

interface SessionResult {
  strategyName: string;
  correct: boolean;
  matchedChecks: number;
  totalChecks: number;
  finalAnswer: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalMemoryOverheadTokens: number;
  totalLatencyMs: number;
  estimatedCostUsd: number;
}

interface Output {
  benchmark: string;
  sampledAt: string;
  strategies: SessionResult[];
}

const session1 = [
  "Project Atlas kickoff: baseline budget is $420,000.",
  "Primary vendor is Northwind Systems.",
  "Target launch month is October 2027.",
];

const session2 = [
  "Correction: budget revised to $465,000 after scope expansion.",
  "Vendor remains Northwind Systems.",
  "New requirement: SOC2 audit must be completed before launch.",
];

const session3 = [
  "Correction: vendor changed to BluePeak Labs after legal review.",
  "Launch month moved to November 2027.",
  "Compliance requirement still SOC2 before launch.",
];

const finalQuestion =
  "What is the current budget, vendor, launch month, and required audit? Answer in one sentence with exact values.";

const checks = [/465,?000/i, /bluepeak labs/i, /november\s+2027/i, /soc2/i];

function score(answer: string): { correct: boolean; matched: number } {
  const matched = checks.filter((rx) => rx.test(answer)).length;
  return { correct: matched === checks.length, matched };
}

async function runOne(strategy: MemoryStrategy): Promise<SessionResult> {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalMemoryOverheadTokens = 0;
  let totalLatencyMs = 0;

  // Session 1
  strategy.reset();
  for (const step of session1) {
    strategy.addMessage({ role: "user", content: step });
    const ctx = await strategy.getContext();
    totalMemoryOverheadTokens += ctx.memoryOverheadTokens;
  }
  strategy.addMessage({ role: "user", content: "Write a short persistence note for next session." });
  const s1ctx = await strategy.getContext();
  totalMemoryOverheadTokens += s1ctx.memoryOverheadTokens;
  const s1start = performance.now();
  const s1resp = await chat(s1ctx.messages, ["Write concise persistence notes.", s1ctx.system].filter(Boolean).join("\n\n"));
  totalLatencyMs += performance.now() - s1start;
  totalInputTokens += s1resp.inputTokens;
  totalOutputTokens += s1resp.outputTokens;
  const note1 = s1resp.content;

  // Session 2
  strategy.reset();
  strategy.addMessage({ role: "user", content: `Previous session note:\n${note1}` });
  for (const step of session2) {
    strategy.addMessage({ role: "user", content: step });
    const ctx = await strategy.getContext();
    totalMemoryOverheadTokens += ctx.memoryOverheadTokens;
  }
  strategy.addMessage({ role: "user", content: "Write an updated persistence note for next session." });
  const s2ctx = await strategy.getContext();
  totalMemoryOverheadTokens += s2ctx.memoryOverheadTokens;
  const s2start = performance.now();
  const s2resp = await chat(s2ctx.messages, ["Write concise persistence notes.", s2ctx.system].filter(Boolean).join("\n\n"));
  totalLatencyMs += performance.now() - s2start;
  totalInputTokens += s2resp.inputTokens;
  totalOutputTokens += s2resp.outputTokens;
  const note2 = s2resp.content;

  // Session 3 + final query
  strategy.reset();
  strategy.addMessage({ role: "user", content: `Previous session note:\n${note2}` });
  for (const step of session3) {
    strategy.addMessage({ role: "user", content: step });
    const ctx = await strategy.getContext();
    totalMemoryOverheadTokens += ctx.memoryOverheadTokens;
  }
  strategy.addMessage({ role: "user", content: finalQuestion });
  const fctx = await strategy.getContext();
  totalMemoryOverheadTokens += fctx.memoryOverheadTokens;
  const fstart = performance.now();
  const fresp = await chat(fctx.messages, ["Use latest corrected values.", fctx.system].filter(Boolean).join("\n\n"));
  totalLatencyMs += performance.now() - fstart;
  totalInputTokens += fresp.inputTokens;
  totalOutputTokens += fresp.outputTokens;

  const scored = score(fresp.content);

  return {
    strategyName: strategy.name,
    correct: scored.correct,
    matchedChecks: scored.matched,
    totalChecks: checks.length,
    finalAnswer: fresp.content,
    totalInputTokens,
    totalOutputTokens,
    totalMemoryOverheadTokens,
    totalLatencyMs,
    estimatedCostUsd: calculateCost(totalInputTokens + totalMemoryOverheadTokens, totalOutputTokens),
  };
}

async function main() {
  const strategies: Array<{ name: string; create: () => MemoryStrategy }> = [
    { name: "Full Context", create: () => new FullContextStrategy() },
    { name: "RLM(8)", create: () => new RLMStrategy(8, 4) },
  ];

  const results: SessionResult[] = [];

  console.log("Internal cross-session benchmark");
  for (const s of strategies) {
    process.stdout.write(`  ${s.name}...`);
    try {
      const result = await runOne(s.create());
      results.push(result);
      console.log(result.correct ? " pass" : " fail");
    } catch (error) {
      console.log(` error: ${error}`);
    }
  }

  const output: Output = {
    benchmark: "Internal Cross-Session",
    sampledAt: new Date().toISOString(),
    strategies: results,
  };

  const path = `results/internal-cross-session-${Date.now()}.json`;
  await Bun.write(path, JSON.stringify(output, null, 2));

  console.log("\nSummary:");
  for (const r of results) {
    console.log(
      `  ${r.strategyName.padEnd(12)} ${r.correct ? "PASS" : "FAIL"} (${r.matchedChecks}/${r.totalChecks}) | latency ${(r.totalLatencyMs / 1000).toFixed(1)}s | cost $${r.estimatedCostUsd.toFixed(4)}`,
    );
  }
  console.log(`\nSaved: ${path}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
