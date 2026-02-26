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

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function getGitSha(): string | null {
  try {
    const result = Bun.spawnSync({
      cmd: ["git", "rev-parse", "HEAD"],
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode === 0) {
      const sha = new TextDecoder().decode(result.stdout).trim();
      return sha || null;
    }
  } catch {
    // ignore and return null
  }
  return null;
}

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

async function writeManifestSafely(path: string, manifest: unknown): Promise<boolean> {
  try {
    await Bun.write(path, JSON.stringify(manifest, null, 2));
    return true;
  } catch (error) {
    console.error(`WARNING: Failed to write manifest to ${path}: ${error}`);
    return false;
  }
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
  const seedArg = args.find((a) => a.startsWith("--seed="))?.split("=")[1];
  const seed = seedArg ? parseInt(seedArg, 10) : undefined;
  const concurrencyArg = args.find((a) => a.startsWith("--concurrency="))?.split("=")[1];
  const concurrency = concurrencyArg ? parseInt(concurrencyArg, 10) : 8;
  const resumePath = args.find((a) => a.startsWith("--resume="))?.split("=")[1];
  const sequential = args.includes("--sequential");

  if (sample !== undefined && (isNaN(sample) || sample <= 0)) {
    console.error("Error: --sample must be a positive integer");
    process.exit(1);
  }
  if (seedArg !== undefined && (seed === undefined || isNaN(seed) || seed <= 0)) {
    console.error("Error: --seed must be a positive integer");
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
    const random = seed !== undefined ? createSeededRandom(seed) : Math.random;
    // Fisher-Yates shuffle, take first N
    const shuffled = [...scenarios];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const temp = shuffled[i]!;
      shuffled[i] = shuffled[j]!;
      shuffled[j] = temp;
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
  const runStartedAt = new Date().toISOString();
  const outputPath = resumePath ?? `results/benchmark-${Date.now()}.json`;
  const manifestPath = outputPath.endsWith(".json")
    ? outputPath.replace(/\.json$/, ".manifest.json")
    : `${outputPath}.manifest.json`;
  const gitSha = getGitSha();

  console.log(`Scenarios: ${scenarios.map((s) => s.name).join(", ")}`);
  console.log(`Strategies: ${strategies.map((s) => s.name).join(", ")}`);
  console.log(`Total: ${totalPairs} runs (${skipped} cached, ${pairs.length} to run)`);
  console.log(`Concurrency: ${sequential ? "sequential" : concurrency}`);
  if (seed !== undefined) console.log(`Seed: ${seed}`);
  console.log(`Started: ${runStartedAt}\n`);

  if (pairs.length === 0) {
    console.log("All runs already completed. Nothing to do.");
    const finishedAt = new Date().toISOString();
    const savedManifest = await writeManifestSafely(manifestPath, {
      version: 1,
      benchmarkOutputPath: outputPath,
      startedAt: runStartedAt,
      finishedAt,
      gitSha,
      filters: {
        onlyStrategy: onlyStrategy ?? null,
        onlyScenario: onlyScenario ?? null,
        quick,
        sample: sample ?? null,
        seed: seed ?? null,
        concurrency,
        sequential,
        resumePath: resumePath ?? null,
      },
      selected: {
        strategies: strategies.map((s) => s.name),
        scenarios: scenarios.map((s) => s.name),
      },
      totals: {
        plannedRuns: totalPairs,
        cachedRuns: skipped,
        executedRuns: 0,
        failedRuns: 0,
        resultCount: previousResults.length,
      },
    });
    if (savedManifest) {
      console.log(`Manifest saved to: ${manifestPath}`);
    }
    printComparisonTable(previousResults);
    return;
  }
  const results: BenchmarkResult[] = [...previousResults];
  let completed = 0;
  let failed = 0;

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
        failed++;
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
          failed++;
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
  const finishedAt = new Date().toISOString();
  const savedManifest = await writeManifestSafely(manifestPath, {
    version: 1,
    benchmarkOutputPath: outputPath,
    startedAt: runStartedAt,
    finishedAt,
    gitSha,
    filters: {
      onlyStrategy: onlyStrategy ?? null,
      onlyScenario: onlyScenario ?? null,
      quick,
      sample: sample ?? null,
      seed: seed ?? null,
      concurrency,
      sequential,
      resumePath: resumePath ?? null,
    },
    selected: {
      strategies: strategies.map((s) => s.name),
      scenarios: scenarios.map((s) => s.name),
    },
    totals: {
      plannedRuns: totalPairs,
      cachedRuns: skipped,
      executedRuns: completed,
      failedRuns: failed,
      resultCount: results.length,
    },
  });

  console.log(`\nResults saved to: ${outputPath}`);
  if (savedManifest) {
    console.log(`Manifest saved to: ${manifestPath}`);
  }
  console.log(`Finished: ${finishedAt}`);
}

main().catch(console.error);
