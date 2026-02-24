import { FullContextStrategy } from "./strategies/full-context";
import { SlidingWindowStrategy } from "./strategies/sliding-window";
import { SummarizationStrategy } from "./strategies/summarizer";
import { StructuredExtractionStrategy } from "./strategies/structured";
import { HybridStrategy } from "./strategies/hybrid";
import { RLMStrategy } from "./strategies/rlm";
import { CorrectionAwareStrategy } from "./strategies/correction-aware";
import { ALL_SCENARIOS } from "./tasks/scenarios";
import { runScenario } from "./tasks/task-runner";
import { printComparisonTable, type BenchmarkResult } from "./utils/metrics";

async function main() {
  console.log("=".repeat(80));
  console.log("LONG-CONTEXT MEMORY STRATEGY BENCHMARK");
  console.log("=".repeat(80));
  console.log(`Scenarios: ${ALL_SCENARIOS.length}`);
  console.log(`Model: claude-haiku-4-5-20251001`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  // Parse CLI args for which strategies/scenarios to run
  const args = process.argv.slice(2);
  const onlyStrategy = args.find((a) => a.startsWith("--strategy="))?.split("=")[1];
  const onlyScenario = args.find((a) => a.startsWith("--scenario="))?.split("=")[1];
  const quick = args.includes("--quick");

  const strategies = [
    new FullContextStrategy(),
    new SlidingWindowStrategy(10),
    new SlidingWindowStrategy(6),
    new SummarizationStrategy(8, 6),
    new StructuredExtractionStrategy(8, 4),
    new HybridStrategy(8, 4),
    new RLMStrategy(8, 4),
    new CorrectionAwareStrategy(8, 4),
  ].filter((s) => !onlyStrategy || s.name.toLowerCase().includes(onlyStrategy.toLowerCase()));

  const scenarios = ALL_SCENARIOS.filter(
    (s) => !onlyScenario || s.name.toLowerCase().includes(onlyScenario.toLowerCase())
  );

  // In quick mode, only run the first 2 scenarios
  const selectedScenarios = quick ? scenarios.slice(0, 2) : scenarios;

  console.log(`Strategies: ${strategies.map((s) => s.name).join(", ")}`);
  console.log(`Scenarios: ${selectedScenarios.map((s) => s.name).join(", ")}`);
  console.log(
    `Total runs: ${strategies.length * selectedScenarios.length}\n`
  );

  const results: BenchmarkResult[] = [];

  for (const scenario of selectedScenarios) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`SCENARIO: ${scenario.name}`);
    console.log(`${scenario.description}`);
    console.log(`Steps: ${scenario.steps.length}`);
    console.log(`${"─".repeat(60)}`);

    for (const strategy of strategies) {
      try {
        const result = await runScenario(strategy, scenario);
        results.push(result);
      } catch (error) {
        console.error(
          `  ERROR: ${strategy.name} × ${scenario.name}: ${error}`
        );
      }
    }
  }

  // Print final comparison
  printComparisonTable(results);

  // Save raw results to JSON
  const outputPath = `results/benchmark-${Date.now()}.json`;
  await Bun.write(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nRaw results saved to: ${outputPath}`);
  console.log(`Finished: ${new Date().toISOString()}`);
}

main().catch(console.error);
