/**
 * Internal benchmark: multi-agent shared-memory handoff.
 *
 * Simulates Agent A and Agent B collaborating via handoff notes.
 *
 * Usage:
 *   bun src/analysis/internal-multi-agent.ts
 */

import { chat } from "../utils/llm";
import { calculateCost } from "../utils/metrics";
import type { MemoryStrategy } from "../strategies/base";
import { FullContextStrategy } from "../strategies/full-context";
import { RLMStrategy } from "../strategies/rlm";

interface Result {
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
  strategies: Result[];
}

const agentASteps = [
  "Task: prepare rollout checklist for Mobile App v4.",
  "Current target date is April 14.",
  "Initial rollout region: us-central.",
  "Correction: rollout region changed to eu-central.",
  "Gate condition: crash-free rate must be >= 99.5%.",
];

const agentBSteps = [
  "New update from release manager: rollout date moved to April 18.",
  "Correction: crash-free gate is >= 99.7%, not 99.5%.",
  "Rollout still eu-central.",
  "Need final handoff note with date, region, and quality gate.",
];

const finalQuestion = "Provide final rollout handoff note with exact date, region, and crash-free threshold.";

const checks = [/april\s+18/i, /eu-central/i, /99\.7%|99\.7/i];

function score(answer: string): { correct: boolean; matched: number } {
  const matched = checks.filter((rx) => rx.test(answer)).length;
  return { correct: matched === checks.length, matched };
}

async function runOne(strategyFactory: () => MemoryStrategy): Promise<Result> {
  const agentA = strategyFactory();
  const agentB = strategyFactory();

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalMemoryOverheadTokens = 0;
  let totalLatencyMs = 0;

  // Agent A phase
  agentA.reset();
  for (const step of agentASteps) {
    agentA.addMessage({ role: "user", content: step });
    const ctx = await agentA.getContext();
    totalMemoryOverheadTokens += ctx.memoryOverheadTokens;
  }
  agentA.addMessage({ role: "user", content: "Write handoff note for Agent B." });
  const actx = await agentA.getContext();
  totalMemoryOverheadTokens += actx.memoryOverheadTokens;
  const aStart = performance.now();
  const aResp = await chat(actx.messages, ["Create concise, factual handoff notes.", actx.system].filter(Boolean).join("\n\n"));
  totalLatencyMs += performance.now() - aStart;
  totalInputTokens += aResp.inputTokens;
  totalOutputTokens += aResp.outputTokens;

  // Agent B phase
  agentB.reset();
  agentB.addMessage({ role: "user", content: `Handoff from Agent A:\n${aResp.content}` });
  for (const step of agentBSteps) {
    agentB.addMessage({ role: "user", content: step });
    const ctx = await agentB.getContext();
    totalMemoryOverheadTokens += ctx.memoryOverheadTokens;
  }
  agentB.addMessage({ role: "user", content: finalQuestion });
  const bctx = await agentB.getContext();
  totalMemoryOverheadTokens += bctx.memoryOverheadTokens;

  const bStart = performance.now();
  const bResp = await chat(bctx.messages, ["Use latest corrected values.", bctx.system].filter(Boolean).join("\n\n"));
  totalLatencyMs += performance.now() - bStart;
  totalInputTokens += bResp.inputTokens;
  totalOutputTokens += bResp.outputTokens;

  const scored = score(bResp.content);

  return {
    strategyName: agentA.name,
    correct: scored.correct,
    matchedChecks: scored.matched,
    totalChecks: checks.length,
    finalAnswer: bResp.content,
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

  const results: Result[] = [];

  console.log("Internal multi-agent benchmark");
  for (const s of strategies) {
    process.stdout.write(`  ${s.name}...`);
    try {
      const result = await runOne(s.create);
      results.push(result);
      console.log(result.correct ? " pass" : " fail");
    } catch (error) {
      console.log(` error: ${error}`);
    }
  }

  const output: Output = {
    benchmark: "Internal Multi-Agent Handoff",
    sampledAt: new Date().toISOString(),
    strategies: results,
  };

  const path = `results/internal-multi-agent-${Date.now()}.json`;
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
