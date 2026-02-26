import { FullContextStrategy } from "./strategies/full-context";
import { SlidingWindowStrategy } from "./strategies/sliding-window";
import { SummarizationStrategy } from "./strategies/summarizer";
import { StructuredExtractionStrategy } from "./strategies/structured";
import { HybridStrategy } from "./strategies/hybrid";
import { RLMStrategy } from "./strategies/rlm";
import { PersistentRLMStrategy } from "./strategies/persistent-rlm";
import { CorrectionAwareStrategy } from "./strategies/correction-aware";
import { ALL_SCENARIOS } from "./tasks/scenarios";
import { runScenario } from "./tasks/task-runner";
import { printComparisonTable, type BenchmarkResult } from "./utils/metrics";
import type { MemoryStrategy } from "./strategies/base";

/* ── Strategy Factories ───────────────────────────────────────────────── */

interface StrategyFactory {
  name: string;
  create: () => MemoryStrategy;
}

const ALL_STRATEGIES: StrategyFactory[] = [
  { name: "Full Context", create: () => new FullContextStrategy() },
  { name: "Window(10)", create: () => new SlidingWindowStrategy(10) },
  { name: "Window(6)", create: () => new SlidingWindowStrategy(6) },
  { name: "Summarize(8)", create: () => new SummarizationStrategy(8, 6) },
  { name: "Structured(8)", create: () => new StructuredExtractionStrategy(8, 4) },
  { name: "Hybrid", create: () => new HybridStrategy(8, 4) },
  { name: "RLM(8)", create: () => new RLMStrategy(8, 4) },
  { name: "PersistentRLM", create: () => new PersistentRLMStrategy(8, 4) },
  { name: "CorrectionAware", create: () => new CorrectionAwareStrategy(8, 4) },
];

/* ── Concurrency Limiter ──────────────────────────────────────────────── */

function pLimit(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        fn().then(resolve, reject).finally(() => {
          active--;
          if (queue.length > 0) queue.shift()!();
        });
      };
      if (active < concurrency) run();
      else queue.push(run);
    });
}

/* ── Result Caching ───────────────────────────────────────────────────── */

async function loadPreviousResults(resumePath?: string): Promise<BenchmarkResult[]> {
  if (!resumePath) return [];
  try {
    const file = Bun.file(resumePath);
    if (await file.exists()) {
      const data = await file.json();
      console.log(`Resuming from ${resumePath} (${data.length} existing results)`);
      return data;
    }
  } catch {
    // ignore parse errors
  }
  return [];
}

function hasResult(results: BenchmarkResult[], strategy: string, scenario: string): boolean {
  return results.some(
    (r) => r.strategyName === strategy && r.scenarioName === scenario
  );
}

/* ── Main ─────────────────────────────────────────────────────────────── */

async function main() {
  console.log("=".repeat(80));
  console.log("LONG-CONTEXT MEMORY STRATEGY BENCHMARK");
  console.log("=".repeat(80));

  // Parse CLI args
  const args = process.argv.slice(2);
  const onlyStrategy = args.find((a) => a.startsWith("--strategy="))?.split("=")[1];
  const onlyScenario = args.find((a) => a.startsWith("--scenario="))?.split("=")[1];
  const quick = args.includes("--quick");
  const sampleArg = args.find((a) => a.startsWith("--sample="))?.split("=")[1];
  const sample = sampleArg ? parseInt(sampleArg, 10) : undefined;
  const concurrencyArg = args.find((a) => a.startsWith("--concurrency="))?.split("=")[1];
  const concurrency = concurrencyArg ? parseInt(concurrencyArg, 10) : 8;
  const resumePath = args.find((a) => a.startsWith("--resume="))?.split("=")[1];
  const sequential = args.includes("--sequential");

  if (sample !== undefined && (isNaN(sample) || sample <= 0)) {
    console.error("Error: --sample must be a positive integer");
    process.exit(1);
  }
  if (isNaN(concurrency) || concurrency <= 0) {
    console.error("Error: --concurrency must be a positive integer");
    process.exit(1);
  }

  // Filter strategies
  const strategies = ALL_STRATEGIES.filter(
    (s) => !onlyStrategy || s.name.toLowerCase().includes(onlyStrategy.toLowerCase())
  );

  // Filter & sample scenarios
  let scenarios = ALL_SCENARIOS.filter(
    (s) => !onlyScenario || s.name.toLowerCase().includes(onlyScenario.toLowerCase())
  );
  if (quick) scenarios = scenarios.slice(0, 2);
  if (sample && sample < scenarios.length) {
    // Fisher-Yates shuffle, take first N
    const shuffled = [...scenarios];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    scenarios = shuffled.slice(0, sample);
  }

  // Load previous results for resume
  const previousResults = await loadPreviousResults(resumePath);

  // Build run pairs, skipping already-completed
  const pairs: { factory: StrategyFactory; scenario: (typeof scenarios)[number] }[] = [];
  for (const scenario of scenarios) {
    for (const factory of strategies) {
      if (!hasResult(previousResults, factory.name, scenario.name)) {
        pairs.push({ factory, scenario });
      }
    }
  }

  const totalPairs = strategies.length * scenarios.length;
  const skipped = totalPairs - pairs.length;

  console.log(`Scenarios: ${scenarios.map((s) => s.name).join(", ")}`);
  console.log(`Strategies: ${strategies.map((s) => s.name).join(", ")}`);
  console.log(`Total: ${totalPairs} runs (${skipped} cached, ${pairs.length} to run)`);
  console.log(`Concurrency: ${sequential ? "sequential" : concurrency}`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  if (pairs.length === 0) {
    console.log("All runs already completed. Nothing to do.");
    printComparisonTable(previousResults);
    return;
  }

  // Output file — reuse resume path or create new
  const outputPath = resumePath ?? `results/benchmark-${Date.now()}.json`;
  const results: BenchmarkResult[] = [...previousResults];
  let completed = 0;

  // Incremental save (mutex to prevent concurrent writes)
  let writing = Promise.resolve();
  const saveResults = () => {
    writing = writing.then(async () => {
      await Bun.write(outputPath, JSON.stringify(results, null, 2));
    }).catch((err) => {
      console.error(`  WARNING: Failed to save incremental results: ${err}`);
    });
    return writing;
  };

  if (sequential) {
    // Original sequential mode
    for (const { factory, scenario } of pairs) {
      try {
        const strategy = factory.create();
        const result = await runScenario(strategy, scenario);
        results.push(result);
        completed++;
        console.log(`  [${completed}/${pairs.length}] done\n`);
        await saveResults();
      } catch (error) {
        console.error(`  ERROR: ${factory.name} × ${scenario.name}: ${error}`);
      }
    }
  } else {
    // Parallel mode with concurrency limit
    const limit = pLimit(concurrency);

    const tasks = pairs.map(({ factory, scenario }) =>
      limit(async () => {
        try {
          const strategy = factory.create();
          const result = await runScenario(strategy, scenario);
          results.push(result);
          completed++;
          console.log(`  [${completed}/${pairs.length}] ${factory.name} × ${scenario.name} done`);
          await saveResults();
          return result;
        } catch (error) {
          console.error(`  ERROR: ${factory.name} × ${scenario.name}: ${error}`);
          return null;
        }
      })
    );

    await Promise.all(tasks);
  }

  // Final save
  await saveResults();

  // Print final comparison
  printComparisonTable(results);

  console.log(`\nResults saved to: ${outputPath}`);
  console.log(`Finished: ${new Date().toISOString()}`);
}

main().catch(console.error);
