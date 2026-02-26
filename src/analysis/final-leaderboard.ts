/**
 * Final Leaderboard — Head-to-Head Benchmark (CTX-5)
 *
 * Runs all strategies across all scenarios and produces the definitive
 * comparison: accuracy, cost, retention-by-type, latency.
 *
 * Usage: bun src/analysis/final-leaderboard.ts
 */

import { chat } from "../utils/llm";
import { ALL_SCENARIOS, type Probe, type ProbeType, type Scenario } from "../tasks/scenarios";
import type { MemoryStrategy } from "../strategies/base";

// Import all strategies
import { FullContextStrategy } from "../strategies/full-context";
import { HybridStrategy } from "../strategies/hybrid";
import { RLMStrategy } from "../strategies/rlm";
import { RLLMStrategy } from "../strategies/rllm-strategy";
import { DiscoveredRLMStrategy } from "../strategies/discovered-rlm";
import { SummarizationStrategy } from "../strategies/summarizer";
import { StructuredExtractionStrategy } from "../strategies/structured";
import { SlidingWindowStrategy } from "../strategies/sliding-window";
import { PersistentRLMStrategy } from "../strategies/persistent-rlm";

// ── Types ──────────────────────────────────────────────────────────

interface StrategyResult {
  strategyName: string;
  scenarioName: string;
  correct: boolean;
  answer: string;
  totalTokens: number;
  latencyMs: number;
  retentionByType: Map<ProbeType, { retained: number; total: number }>;
}

interface LeaderboardEntry {
  strategy: string;
  accuracy: number;
  scenariosCorrect: number;
  totalScenarios: number;
  avgTokens: number;
  avgLatencyMs: number;
  overallRetention: number;
  retentionByType: Record<string, number>;
}

// ── Probe checking ─────────────────────────────────────────────────

function checkProbeInAnswer(probe: Probe, answer: string): boolean {
  const lower = answer.toLowerCase();
  return probe.patterns.every((p) => lower.includes(p.toLowerCase()));
}

// ── Run one strategy × one scenario ────────────────────────────────

async function runOne(
  strategy: MemoryStrategy,
  scenario: Scenario,
): Promise<StrategyResult> {
  strategy.reset();

  const startTime = performance.now();
  let totalTokens = 0;

  for (const step of scenario.steps) {
    strategy.addMessage({ role: "user", content: step });
    const context = await strategy.getContext();
    const response = await chat(
      context.messages,
      [scenario.systemPrompt, context.system].filter(Boolean).join("\n\n"),
    );
    totalTokens += response.inputTokens + response.outputTokens + context.memoryOverheadTokens;
    strategy.addMessage({ role: "assistant", content: response.content });
  }

  // Final question
  strategy.addMessage({ role: "user", content: scenario.finalQuestion });
  const finalContext = await strategy.getContext();
  const finalResponse = await chat(
    finalContext.messages,
    [scenario.systemPrompt, finalContext.system].filter(Boolean).join("\n\n"),
  );
  totalTokens += finalResponse.inputTokens + finalResponse.outputTokens + finalContext.memoryOverheadTokens;

  const latencyMs = performance.now() - startTime;
  const correct = scenario.checkAnswer(finalResponse.content);

  // Probe retention on final answer
  const retentionByType = new Map<ProbeType, { retained: number; total: number }>();
  for (const probe of scenario.probes ?? []) {
    const entry = retentionByType.get(probe.type) || { retained: 0, total: 0 };
    entry.total++;
    if (checkProbeInAnswer(probe, finalResponse.content)) {
      entry.retained++;
    }
    retentionByType.set(probe.type, entry);
  }

  return {
    strategyName: strategy.name,
    scenarioName: scenario.name,
    correct,
    answer: finalResponse.content,
    totalTokens,
    latencyMs,
    retentionByType,
  };
}

// ── Aggregate into leaderboard ─────────────────────────────────────

function buildLeaderboard(results: StrategyResult[]): LeaderboardEntry[] {
  const byStrategy = new Map<string, StrategyResult[]>();
  for (const r of results) {
    const arr = byStrategy.get(r.strategyName) || [];
    arr.push(r);
    byStrategy.set(r.strategyName, arr);
  }

  return Array.from(byStrategy.entries()).map(([strategy, runs]) => {
    const correct = runs.filter((r) => r.correct).length;

    // Aggregate retention by type
    const typeAgg = new Map<string, { retained: number; total: number }>();
    for (const r of runs) {
      for (const [type, counts] of r.retentionByType) {
        const entry = typeAgg.get(type) || { retained: 0, total: 0 };
        entry.retained += counts.retained;
        entry.total += counts.total;
        typeAgg.set(type, entry);
      }
    }

    const retentionByType: Record<string, number> = {};
    let totalRetained = 0;
    let totalProbes = 0;
    for (const [type, counts] of typeAgg) {
      retentionByType[type] = counts.total > 0 ? counts.retained / counts.total : 0;
      totalRetained += counts.retained;
      totalProbes += counts.total;
    }

    return {
      strategy,
      accuracy: correct / runs.length,
      scenariosCorrect: correct,
      totalScenarios: runs.length,
      avgTokens: runs.reduce((s, r) => s + r.totalTokens, 0) / runs.length,
      avgLatencyMs: runs.reduce((s, r) => s + r.latencyMs, 0) / runs.length,
      overallRetention: totalProbes > 0 ? totalRetained / totalProbes : 0,
      retentionByType,
    };
  }).sort((a, b) => b.accuracy - a.accuracy || b.overallRetention - a.overallRetention);
}

// ── Report ─────────────────────────────────────────────────────────

function printLeaderboard(entries: LeaderboardEntry[]): void {
  console.log("\n" + "=".repeat(90));
  console.log("  FINAL LEADERBOARD -- ALL STRATEGIES HEAD-TO-HEAD (CTX-5)");
  console.log("=".repeat(90));

  console.log("\n-- Accuracy & Cost --\n");
  console.log(
    "  " +
    "Rank".padEnd(6) +
    "Strategy".padEnd(22) +
    "Accuracy".padStart(10) +
    "Correct".padStart(10) +
    "Avg Tokens".padStart(12) +
    "Avg Latency".padStart(14),
  );
  console.log("  " + "-".repeat(74));

  entries.forEach((e, i) => {
    console.log(
      "  " +
      `#${i + 1}`.padEnd(6) +
      e.strategy.padEnd(22) +
      `${(e.accuracy * 100).toFixed(0)}%`.padStart(10) +
      `${e.scenariosCorrect}/${e.totalScenarios}`.padStart(10) +
      `${Math.round(e.avgTokens).toLocaleString()}`.padStart(12) +
      `${(e.avgLatencyMs / 1000).toFixed(1)}s`.padStart(14),
    );
  });

  console.log("\n-- Retention by Fact Type --\n");
  const allTypes = [...new Set(entries.flatMap((e) => Object.keys(e.retentionByType)))].sort();

  console.log(
    "  " + "Strategy".padEnd(22) + allTypes.map((t) => t.padStart(12)).join(""),
  );
  console.log("  " + "-".repeat(22 + allTypes.length * 12));

  for (const e of entries) {
    const cells = allTypes.map((t) => {
      const val = e.retentionByType[t];
      return val !== undefined ? `${(val * 100).toFixed(0)}%`.padStart(12) : "--".padStart(12);
    });
    console.log("  " + e.strategy.padEnd(22) + cells.join(""));
  }

  console.log("\n" + "=".repeat(90));
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("Final Leaderboard Benchmark (CTX-5)");
  console.log("Running all strategies across all scenarios...\n");

  const strategies: MemoryStrategy[] = [
    new FullContextStrategy(),
    new HybridStrategy(),
    new RLMStrategy(),
    new PersistentRLMStrategy(),
    new RLLMStrategy(),
    new DiscoveredRLMStrategy(),
    new SummarizationStrategy(),
    new StructuredExtractionStrategy(),
    new SlidingWindowStrategy(),
  ];

  const scenarios = ALL_SCENARIOS.filter((s) => s.probes && s.probes.length > 0);
  const totalRuns = strategies.length * scenarios.length;
  let completed = 0;

  const allResults: StrategyResult[] = [];

  for (const strategy of strategies) {
    console.log(`\n-- ${strategy.name} --`);
    for (const scenario of scenarios) {
      completed++;
      process.stdout.write(`  [${completed}/${totalRuns}] ${scenario.name}...`);
      try {
        const result = await runOne(strategy, scenario);
        allResults.push(result);
        console.log(result.correct ? " PASS" : " FAIL");
      } catch (err) {
        console.log(` ERROR: ${err}`);
        allResults.push({
          strategyName: strategy.name,
          scenarioName: scenario.name,
          correct: false,
          answer: `ERROR: ${err}`,
          totalTokens: 0,
          latencyMs: 0,
          retentionByType: new Map(),
        });
      }
    }
  }

  const leaderboard = buildLeaderboard(allResults);
  printLeaderboard(leaderboard);

  // Save results
  const outputPath = `results/final-leaderboard-${Date.now()}.json`;

  // Convert Map to plain objects for JSON serialization
  const serializableResults = allResults.map((r) => ({
    ...r,
    retentionByType: Object.fromEntries(r.retentionByType),
  }));

  await Bun.write(
    outputPath,
    JSON.stringify({ results: serializableResults, leaderboard }, null, 2),
  );
  console.log(`\nResults saved to ${outputPath}`);
}

main().catch(console.error);
