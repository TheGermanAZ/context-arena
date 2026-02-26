/**
 * CTX-3 Baseline: Run hand-rolled RLM on gpt-5-nano via OpenCode Zen
 * to get a fair same-model comparison against RLLM agentic (4.8%).
 *
 * Resumes from partial results if available — only runs missing scenarios.
 */
import { RLMStrategy } from "../strategies/rlm";
import { chat } from "../utils/llm";
import { ALL_SCENARIOS } from "../tasks/scenarios";
import { writeFileSync, readFileSync, existsSync } from "fs";

interface ScenarioResult {
  name: string;
  retained: number;
  total: number;
  cycles: number;
  probeResults: { fact: string; type: string; retained: boolean }[];
}

const PARTIAL_PATH = "results/rlm-nano-baseline-partial.json";

// Load existing partial results
let results: ScenarioResult[] = [];
const completed = new Set<string>();

if (existsSync(PARTIAL_PATH)) {
  const existing = JSON.parse(readFileSync(PARTIAL_PATH, "utf-8"));
  for (const r of existing.results) {
    if (r.cycles > 0) {
      results.push(r);
      completed.add(r.name);
    }
  }
  if (completed.size > 0) {
    console.log(`Resuming — ${completed.size} scenarios already done: ${[...completed].join(", ")}\n`);
  }
}

const scenarios = ALL_SCENARIOS.filter(s => s.probes && s.probes.length > 0);
const remaining = scenarios.filter(s => !completed.has(s.name));

console.log(`Running RLM(8) on gpt-5-nano via OpenCode Zen — ${remaining.length} remaining scenarios\n`);

for (const scenario of remaining) {
  const strategy = new RLMStrategy(8, 4);
  strategy.enableLogging = true;

  process.stdout.write(`  ${scenario.name}...`);

  try {
    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      strategy.addMessage({ role: "user", content: step });
      const ctx = await strategy.getContext();
      const response = await chat(
        ctx.messages,
        [scenario.systemPrompt, ctx.system].filter(Boolean).join("\n\n"),
      );
      strategy.addMessage({ role: "assistant", content: response.content });

      // Progress indicator every 5 steps
      if ((i + 1) % 5 === 0) process.stdout.write(` [${i + 1}/${scenario.steps.length}]`);
    }

    // Final question to trigger last compression
    strategy.addMessage({ role: "user", content: scenario.finalQuestion });
    await strategy.getContext();

    const log = strategy.delegationLog;
    const probes = scenario.probes ?? [];
    const probeResults: { fact: string; type: string; retained: boolean }[] = [];
    let kept = 0;

    for (const probe of probes) {
      const lastEntry = log[log.length - 1];
      const retainedInLast = lastEntry
        ? probe.patterns.every(p => lastEntry.content.toLowerCase().includes(p.toLowerCase()))
        : false;

      if (retainedInLast) kept++;
      probeResults.push({ fact: probe.fact, type: probe.type, retained: retainedInLast });
    }

    results.push({
      name: scenario.name,
      retained: kept,
      total: probes.length,
      cycles: log.length,
      probeResults,
    });

    console.log(` ${kept}/${probes.length} retained (${log.length} cycles)`);
  } catch (err) {
    console.error(` FAILED: ${err}`);
    // Don't add failed scenarios — leave them for next resume
  }

  // Save partial results after each scenario
  writeFileSync(PARTIAL_PATH, JSON.stringify({ results, complete: false }, null, 2));
}

// Check if all scenarios completed
const allDone = results.length === scenarios.length;

if (!allDone) {
  console.log(`\n  ${results.length}/${scenarios.length} scenarios completed. Re-run to resume remaining.\n`);
}

// Final summary (even partial)
const totalRetained = results.reduce((s, r) => s + r.retained, 0);
const totalProbes = results.reduce((s, r) => s + r.total, 0);
const pct = totalProbes > 0 ? ((totalRetained / totalProbes) * 100).toFixed(1) : "0.0";

console.log(`\n══════════════════════════════════════════════════════════════════════`);
console.log(`  RLM(8) BASELINE ON gpt-5-nano${allDone ? "" : " (PARTIAL)"}`);
console.log(`══════════════════════════════════════════════════════════════════════`);
console.log();

for (const r of results) {
  const bar = "█".repeat(Math.round((r.retained / r.total) * 20)).padEnd(20, "░");
  const rpct = ((r.retained / r.total) * 100).toFixed(0);
  console.log(`  ${r.name.padEnd(25)} ${bar} ${rpct.padStart(3)}%  (${r.retained}/${r.total})`);
}

console.log();
console.log(`  OVERALL: ${totalRetained}/${totalProbes} = ${pct}% retention (${results.length}/${scenarios.length} scenarios)`);
console.log(`  RLLM agentic (same model): 4.8%`);
console.log(`  Delta: ${(parseFloat(pct) - 4.8).toFixed(1)}pp`);
console.log(`\n══════════════════════════════════════════════════════════════════════`);

if (allDone) {
  const ts = Date.now();
  const finalPath = `results/rlm-nano-baseline-${ts}.json`;
  writeFileSync(finalPath, JSON.stringify({
    model: "gpt-5-nano",
    provider: "OpenCode Zen",
    strategy: "RLM(8,4) hand-rolled",
    timestamp: new Date().toISOString(),
    overall: { retained: totalRetained, total: totalProbes, pct: parseFloat(pct) },
    results,
    complete: true,
  }, null, 2));

  console.log(`\nFinal results saved to ${finalPath}`);
}
