export interface StepMetrics {
  step: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  memoryOverheadTokens: number; // tokens used for summarization/extraction
}

export interface BenchmarkResult {
  strategyName: string;
  scenarioName: string;
  steps: StepMetrics[];
  finalAnswer: string;
  correct: boolean;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalMemoryOverheadTokens: number;
  totalLatencyMs: number;
  estimatedCostUsd: number;
  peakContextTokens: number;
}

// Haiku pricing as of Feb 2026
const INPUT_COST_PER_1M = 0.80;
const OUTPUT_COST_PER_1M = 4.00;

export function calculateCost(
  inputTokens: number,
  outputTokens: number
): number {
  return (
    (inputTokens / 1_000_000) * INPUT_COST_PER_1M +
    (outputTokens / 1_000_000) * OUTPUT_COST_PER_1M
  );
}

export function aggregateMetrics(
  strategyName: string,
  scenarioName: string,
  steps: StepMetrics[],
  finalAnswer: string,
  correct: boolean
): BenchmarkResult {
  const totalInputTokens = steps.reduce((s, m) => s + m.inputTokens, 0);
  const totalOutputTokens = steps.reduce((s, m) => s + m.outputTokens, 0);
  const totalMemoryOverheadTokens = steps.reduce(
    (s, m) => s + m.memoryOverheadTokens,
    0
  );
  const totalLatencyMs = steps.reduce((s, m) => s + m.latencyMs, 0);
  const peakContextTokens = Math.max(...steps.map((m) => m.inputTokens));

  return {
    strategyName,
    scenarioName,
    steps,
    finalAnswer,
    correct,
    totalInputTokens,
    totalOutputTokens,
    totalMemoryOverheadTokens,
    totalLatencyMs,
    estimatedCostUsd: calculateCost(
      totalInputTokens + totalMemoryOverheadTokens,
      totalOutputTokens
    ),
    peakContextTokens,
  };
}

export function printComparisonTable(results: BenchmarkResult[]): void {
  console.log("\n" + "=".repeat(120));
  console.log("BENCHMARK RESULTS");
  console.log("=".repeat(120));

  // Group by scenario
  const scenarios = [...new Set(results.map((r) => r.scenarioName))];

  for (const scenario of scenarios) {
    const scenarioResults = results.filter((r) => r.scenarioName === scenario);
    console.log(`\n--- ${scenario} ---\n`);
    console.log(
      "| Strategy".padEnd(25) +
        "| Correct".padEnd(12) +
        "| Input Tok".padEnd(14) +
        "| Output Tok".padEnd(14) +
        "| Overhead".padEnd(14) +
        "| Peak Ctx".padEnd(14) +
        "| Latency".padEnd(14) +
        "| Cost".padEnd(12) +
        "|"
    );
    console.log("|" + "-".repeat(24) + ("|" + "-".repeat(13)).repeat(6) + "|" + "-".repeat(11) + "|");

    for (const r of scenarioResults) {
      console.log(
        `| ${r.strategyName}`.padEnd(25) +
          `| ${r.correct ? "YES" : "NO"}`.padEnd(12) +
          `| ${r.totalInputTokens.toLocaleString()}`.padEnd(14) +
          `| ${r.totalOutputTokens.toLocaleString()}`.padEnd(14) +
          `| ${r.totalMemoryOverheadTokens.toLocaleString()}`.padEnd(14) +
          `| ${r.peakContextTokens.toLocaleString()}`.padEnd(14) +
          `| ${(r.totalLatencyMs / 1000).toFixed(1)}s`.padEnd(14) +
          `| $${r.estimatedCostUsd.toFixed(4)}`.padEnd(12) +
          "|"
      );
    }
  }

  // Overall summary
  console.log("\n" + "=".repeat(120));
  console.log("OVERALL SUMMARY");
  console.log("=".repeat(120));

  const strategies = [...new Set(results.map((r) => r.strategyName))];
  console.log(
    "\n| Strategy".padEnd(25) +
      "| Accuracy".padEnd(14) +
      "| Avg Input".padEnd(14) +
      "| Avg Overhead".padEnd(16) +
      "| Avg Latency".padEnd(14) +
      "| Total Cost".padEnd(14) +
      "|"
  );
  console.log("|" + "-".repeat(24) + ("|" + "-".repeat(13)).repeat(4) + "|" + "-".repeat(13) + "|");

  for (const strategy of strategies) {
    const stratResults = results.filter((r) => r.strategyName === strategy);
    const accuracy =
      stratResults.filter((r) => r.correct).length / stratResults.length;
    const avgInput =
      stratResults.reduce((s, r) => s + r.totalInputTokens, 0) /
      stratResults.length;
    const avgOverhead =
      stratResults.reduce((s, r) => s + r.totalMemoryOverheadTokens, 0) /
      stratResults.length;
    const avgLatency =
      stratResults.reduce((s, r) => s + r.totalLatencyMs, 0) /
      stratResults.length;
    const totalCost = stratResults.reduce(
      (s, r) => s + r.estimatedCostUsd,
      0
    );

    console.log(
      `| ${strategy}`.padEnd(25) +
        `| ${(accuracy * 100).toFixed(0)}%`.padEnd(14) +
        `| ${Math.round(avgInput).toLocaleString()}`.padEnd(14) +
        `| ${Math.round(avgOverhead).toLocaleString()}`.padEnd(16) +
        `| ${(avgLatency / 1000).toFixed(1)}s`.padEnd(14) +
        `| $${totalCost.toFixed(4)}`.padEnd(14) +
        "|"
    );
  }

  console.log("");
}
