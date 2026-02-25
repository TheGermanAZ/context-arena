/**
 * RLM Depth-Scaling Analysis (CTX-2)
 *
 * Runs DeepRLM at depth 1, 2, and 3 across all scenarios with probe logging.
 * Produces depth-scaling curves showing whether information loss compounds
 * linearly or exponentially with delegation depth.
 *
 * Usage: bun src/analysis/rlm-depth.ts
 */

import { DeepRLMStrategy } from "../strategies/deep-rlm";
import type { DelegationLogEntry } from "../strategies/rlm";
import { chat } from "../utils/llm";
import { ALL_SCENARIOS, type Probe, type ProbeType, type Scenario } from "../tasks/scenarios";

// ── Types ──────────────────────────────────────────────────────────

interface ProbeResult {
  fact: string;
  type: ProbeType;
  retained: boolean;
}

interface DepthScenarioResult {
  scenarioName: string;
  depth: number;
  probeResults: ProbeResult[];
  retainedCount: number;
  totalProbes: number;
  delegationCycles: number;
  totalOverheadTokens: number;
}

interface DepthTypeResult {
  type: ProbeType;
  totalProbes: number;
  retentionByDepth: Map<number, number>; // depth → retention rate
}

// ── Probe checking ─────────────────────────────────────────────────

function checkProbeRetained(probe: Probe, content: string): boolean {
  const lower = content.toLowerCase();
  return probe.patterns.every((p) => lower.includes(p.toLowerCase()));
}

function checkProbeAcrossLog(probe: Probe, log: DelegationLogEntry[]): boolean {
  // A probe is "retained" if it's present in the final delegation output
  // that occurs after the probe was introduced
  const relevantEntries = log.filter((e) => e.step >= probe.introducedAtStep);
  if (relevantEntries.length === 0) return true; // no delegation after introduction — still in recent window
  const lastEntry = relevantEntries[relevantEntries.length - 1]!;
  return checkProbeRetained(probe, lastEntry.content);
}

// ── Run a single scenario at a given depth ─────────────────────────

async function runScenarioAtDepth(
  scenario: Scenario,
  depth: number,
): Promise<DepthScenarioResult> {
  const strategy = new DeepRLMStrategy(depth, 8, 4);
  strategy.enableLogging = true;

  process.stdout.write(`  d=${depth} × ${scenario.name}...`);

  for (let i = 0; i < scenario.steps.length; i++) {
    strategy.addMessage({ role: "user", content: scenario.steps[i]! });
    const context = await strategy.getContext();
    const response = await chat(
      context.messages,
      [scenario.systemPrompt, context.system].filter(Boolean).join("\n\n"),
    );
    strategy.addMessage({ role: "assistant", content: response.content });
  }

  // Trigger final delegation if pending
  strategy.addMessage({ role: "user", content: scenario.finalQuestion });
  await strategy.getContext();

  const probes = scenario.probes ?? [];
  const probeResults: ProbeResult[] = probes.map((probe) => ({
    fact: probe.fact,
    type: probe.type,
    retained: checkProbeAcrossLog(probe, strategy.delegationLog),
  }));

  const retainedCount = probeResults.filter((p) => p.retained).length;
  console.log(` ${retainedCount}/${probes.length} probes retained`);

  return {
    scenarioName: scenario.name,
    depth,
    probeResults,
    retainedCount,
    totalProbes: probes.length,
    delegationCycles: strategy.delegationLog.length,
    totalOverheadTokens: probeResults.length, // placeholder — actual from strategy
  };
}

// ── Aggregate by type × depth ──────────────────────────────────────

function aggregateByTypeAndDepth(
  results: DepthScenarioResult[],
): DepthTypeResult[] {
  const typeMap = new Map<ProbeType, DepthTypeResult>();

  for (const result of results) {
    for (const probe of result.probeResults) {
      let entry = typeMap.get(probe.type);
      if (!entry) {
        entry = {
          type: probe.type,
          totalProbes: 0,
          retentionByDepth: new Map(),
        };
        typeMap.set(probe.type, entry);
      }

      // Count total probes (only once per unique probe, use depth=1 as baseline)
      if (result.depth === 1) {
        entry.totalProbes++;
      }

      const currentCount = entry.retentionByDepth.get(result.depth) ?? 0;
      if (probe.retained) {
        entry.retentionByDepth.set(result.depth, currentCount + 1);
      } else {
        // Ensure key exists even if 0
        if (!entry.retentionByDepth.has(result.depth)) {
          entry.retentionByDepth.set(result.depth, 0);
        }
      }
    }
  }

  return [...typeMap.values()];
}

// ── Report ─────────────────────────────────────────────────────────

function printReport(
  results: DepthScenarioResult[],
  depths: number[],
): void {
  console.log("\n" + "═".repeat(70));
  console.log("  RLM DEPTH-SCALING ANALYSIS — CTX-2");
  console.log("═".repeat(70));

  // 1. Overall accuracy by depth
  console.log("\n── Overall Probe Retention by Depth ──\n");
  for (const d of depths) {
    const atDepth = results.filter((r) => r.depth === d);
    const totalRetained = atDepth.reduce((s, r) => s + r.retainedCount, 0);
    const totalProbes = atDepth.reduce((s, r) => s + r.totalProbes, 0);
    const pct = totalProbes > 0 ? ((totalRetained / totalProbes) * 100).toFixed(1) : "0";
    const bar = "█".repeat(Math.round((totalRetained / totalProbes) * 30)).padEnd(30, "░");
    console.log(`  Depth ${d}  ${bar} ${pct.padStart(5)}%  (${totalRetained}/${totalProbes})`);
  }

  // 2. Retention by type × depth
  const byType = aggregateByTypeAndDepth(results);
  console.log("\n── Retention by Fact Type × Depth ──\n");
  const header = "  Type".padEnd(16) + depths.map((d) => `d=${d}`.padStart(8)).join("") + "   Decay";
  console.log(header);
  console.log("  " + "─".repeat(14 + depths.length * 8 + 10));

  for (const t of byType) {
    const cells: string[] = [];
    const rates: number[] = [];
    for (const d of depths) {
      const retained = t.retentionByDepth.get(d) ?? 0;
      const rate = t.totalProbes > 0 ? retained / t.totalProbes : 0;
      rates.push(rate);
      cells.push(`${(rate * 100).toFixed(0)}%`.padStart(8));
    }

    // Classify decay: linear vs exponential
    let decay = "—";
    if (rates.length >= 3 && rates[0]! > 0) {
      const dropD1toD2 = rates[0]! - rates[1]!;
      const dropD2toD3 = rates[1]! - rates[2]!;
      if (dropD1toD2 <= 0 && dropD2toD3 <= 0) {
        decay = "stable";
      } else if (dropD2toD3 > dropD1toD2 * 1.5) {
        decay = "EXPONENTIAL";
      } else if (dropD2toD3 > dropD1toD2 * 0.5) {
        decay = "linear";
      } else {
        decay = "decelerating";
      }
    } else if (rates[0] === 0) {
      decay = "already dead";
    }

    console.log(`  ${t.type.padEnd(14)}${cells.join("")}   ${decay}`);
  }

  // 3. Per-scenario breakdown
  console.log("\n── Per-Scenario Results ──\n");
  const scenarios = [...new Set(results.map((r) => r.scenarioName))];
  for (const name of scenarios) {
    const runs = results.filter((r) => r.scenarioName === name);
    const line = runs
      .sort((a, b) => a.depth - b.depth)
      .map((r) => `d=${r.depth}: ${r.retainedCount}/${r.totalProbes}`)
      .join("  →  ");
    console.log(`  ${name.padEnd(28)} ${line}`);
  }

  // 4. Scaling classification
  console.log("\n── Depth-Scaling Verdict ──\n");
  const d1Results = results.filter((r) => r.depth === 1);
  const d3Results = results.filter((r) => r.depth === 3);
  const d1Total = d1Results.reduce((s, r) => s + r.retainedCount, 0);
  const d3Total = d3Results.reduce((s, r) => s + r.retainedCount, 0);
  const d1Probes = d1Results.reduce((s, r) => s + r.totalProbes, 0);
  const d1Rate = d1Probes > 0 ? d1Total / d1Probes : 0;
  const d3Rate = d1Probes > 0 ? d3Total / d1Probes : 0;

  if (d3Rate < d1Rate * 0.3) {
    console.log("  EXPONENTIAL DECAY — depth 3 retains less than 30% of depth 1.");
    console.log("  Information loss compounds aggressively. Deep RLM is destructive.");
  } else if (d3Rate < d1Rate * 0.7) {
    console.log("  LINEAR DECAY — depth 3 retains 30-70% of depth 1.");
    console.log("  Information loss scales proportionally with depth.");
  } else {
    console.log("  SUBLINEAR DECAY — depth 3 retains >70% of depth 1.");
    console.log("  Re-processing is mostly lossless. Deep RLM may be viable.");
  }

  console.log("\n" + "═".repeat(70));
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const depths = [1, 2, 3];

  console.log("RLM Depth-Scaling Analysis (CTX-2)");
  console.log(`Testing depths: ${depths.join(", ")} across all scenarios\n`);

  const scenariosWithProbes = ALL_SCENARIOS.filter(
    (s) => s.probes && s.probes.length > 0,
  );

  console.log(`Found ${scenariosWithProbes.length} scenarios with probes.\n`);

  const results: DepthScenarioResult[] = [];

  for (const depth of depths) {
    console.log(`\n━━━ Depth ${depth} ━━━`);
    for (const scenario of scenariosWithProbes) {
      try {
        const result = await runScenarioAtDepth(scenario, depth);
        results.push(result);
      } catch (err) {
        console.log(` ERROR: ${err instanceof Error ? err.message : err}`);
        // Record as 0 retention so the report still generates
        const probes = scenario.probes ?? [];
        results.push({
          scenarioName: scenario.name,
          depth,
          probeResults: probes.map((p) => ({ fact: p.fact, type: p.type, retained: false })),
          retainedCount: 0,
          totalProbes: probes.length,
          delegationCycles: 0,
          totalOverheadTokens: 0,
        });
      }
    }
  }

  printReport(results, depths);

  // Save raw data
  const outputPath = `results/rlm-depth-${Date.now()}.json`;
  const serializable = results.map((r) => ({
    ...r,
  }));
  await Bun.write(outputPath, JSON.stringify(serializable, null, 2));
  console.log(`\nRaw data saved to ${outputPath}`);
}

main().catch(console.error);
