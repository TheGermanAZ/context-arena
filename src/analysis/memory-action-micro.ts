/**
 * One-day internal gap benchmark: memory -> action micro scenario.
 *
 * This is intentionally tiny and deterministic so we can run it quickly
 * alongside the LongMemEval slice.
 *
 * Usage:
 *   bun src/analysis/memory-action-micro.ts
 */

import { chat } from "../utils/llm";
import { calculateCost } from "../utils/metrics";
import type { MemoryStrategy } from "../strategies/base";
import { FullContextStrategy } from "../strategies/full-context";
import { RLMStrategy } from "../strategies/rlm";
import { QPBStrategy } from "../strategies/qpb";

interface MicroScenario {
  name: string;
  description: string;
  steps: string[];
  finalQuestion: string;
  requiredPatterns: RegExp[];
}

interface MicroStrategyResult {
  strategyName: string;
  passed: boolean;
  matchedChecks: number;
  totalChecks: number;
  finalAnswer: string;
  inputTokens: number;
  outputTokens: number;
  memoryOverheadTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
}

interface MicroOutput {
  benchmark: string;
  sampledAt: string;
  scenario: Omit<MicroScenario, "requiredPatterns"> & { requiredCheckCount: number };
  strategies: MicroStrategyResult[];
}

const scenario: MicroScenario = {
  name: "Conference Logistics Action",
  description:
    "Tests whether corrected planning facts survive compression and can be recalled with exact values.",
  steps: [
    "We are finalizing logistics for the Q2 Product Summit breakfast event.",
    "Initial plan: venue Hall A, expected headcount 90.",
    "Catering vendor is Sunrise Catering.",
    "Correction: event moved to Hall C, not Hall A.",
    "Correction: updated headcount is 120 attendees, not 90.",
    "Dietary counts are 14 vegan and 9 gluten-free meals.",
    "Payment terms: submit $1,800 deposit before Friday 4:00 PM.",
    "Initial budget code was MKT-77.",
    "Correction: use budget code OPS-19, not MKT-77.",
    "Reminder: include a final confirmation message to Sunrise Catering.",
    "Ignore this note: office plant watering moved to Tuesdays.",
    "Ignore this note: team hoodie order approved for next month.",
  ],
  finalQuestion:
    "List all the current, corrected details for this event. Include every specific value, code, name, count, and deadline from our conversation. Use only the latest corrected values.",
  requiredPatterns: [
    /sunrise catering/i,
    /hall\s*c/i,
    /120/i,
    /14\s*vegan/i,
    /9\s*(gluten[- ]free|gf)/i,
    /(\$\s*1,?800|1800)/i,
    /friday\s*4:?00\s*(pm)?/i,
    /ops-19/i,
  ],
};

async function runMicroScenario(
  strategy: MemoryStrategy,
  input: MicroScenario,
): Promise<MicroStrategyResult> {
  strategy.reset();

  const started = performance.now();
  let overheadTokens = 0;

  for (const step of input.steps) {
    strategy.addMessage({ role: "user", content: step });
    const ctx = await strategy.getContext();
    overheadTokens += ctx.memoryOverheadTokens;
  }

  strategy.addMessage({ role: "user", content: input.finalQuestion });
  const finalContext = await strategy.getContext();
  overheadTokens += finalContext.memoryOverheadTokens;

  const response = await chat(
    finalContext.messages,
    [
      "You are a fact-recall assistant.",
      "List all facts with their exact values.",
      "Use only the latest corrected values — ignore superseded ones.",
      "Ignore irrelevant notes.",
      finalContext.system,
    ]
      .filter(Boolean)
      .join("\n\n"),
  );

  const latencyMs = performance.now() - started;

  const matched = input.requiredPatterns.filter((rx) => rx.test(response.content)).length;
  const passed = matched === input.requiredPatterns.length;

  return {
    strategyName: strategy.name,
    passed,
    matchedChecks: matched,
    totalChecks: input.requiredPatterns.length,
    finalAnswer: response.content,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    memoryOverheadTokens: overheadTokens,
    latencyMs,
    estimatedCostUsd: calculateCost(response.inputTokens + overheadTokens, response.outputTokens),
  };
}

async function main() {
  const strategies: Array<{ name: string; create: () => MemoryStrategy }> = [
    { name: "Full Context", create: () => new FullContextStrategy() },
    { name: "RLM(8)", create: () => new RLMStrategy(8, 4) },
    { name: "QPB", create: () => new QPBStrategy(8, 4) },
  ];

  const results: MicroStrategyResult[] = [];

  console.log(`Running micro benchmark: ${scenario.name}`);
  for (const s of strategies) {
    process.stdout.write(`  ${s.name}...`);
    try {
      const result = await runMicroScenario(s.create(), scenario);
      results.push(result);
      console.log(result.passed ? " pass" : " fail");
    } catch (error) {
      console.log(` error: ${error}`);
    }
  }

  const output: MicroOutput = {
    benchmark: "Memory-to-Action Micro",
    sampledAt: new Date().toISOString(),
    scenario: {
      name: scenario.name,
      description: scenario.description,
      steps: scenario.steps,
      finalQuestion: scenario.finalQuestion,
      requiredCheckCount: scenario.requiredPatterns.length,
    },
    strategies: results,
  };

  const path = `results/memory-action-micro-${Date.now()}.json`;
  await Bun.write(path, JSON.stringify(output, null, 2));

  console.log("\nSummary:");
  for (const r of results) {
    console.log(
      `  ${r.strategyName.padEnd(12)} ${r.passed ? "PASS" : "FAIL"} (${r.matchedChecks}/${r.totalChecks}) | latency ${(r.latencyMs / 1000).toFixed(1)}s | cost $${r.estimatedCostUsd.toFixed(4)}`,
    );
  }

  console.log(`\nSaved: ${path}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
