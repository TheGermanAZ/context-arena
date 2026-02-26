/**
 * Quick probe analysis against existing benchmark results.
 * No API calls — just checks probes against final answers.
 *
 * Usage: bun src/analysis/probe-check.ts results/benchmark-XXXX.json
 */
import { ALL_SCENARIOS } from "../tasks/scenarios";

const path = process.argv[2] || "results/benchmark-1772135061913.json";
const data = await Bun.file(path).json();

const strategies = ["RLM(8)", "PersistentRLM"];

for (const stratName of strategies) {
  console.log("=".repeat(70));
  console.log(stratName);
  console.log("=".repeat(70));

  const byType: Record<string, { retained: number; total: number }> = {};
  let totalRetained = 0;
  let totalProbes = 0;

  for (const scenario of ALL_SCENARIOS) {
    if (!scenario.probes || scenario.probes.length === 0) continue;

    const result = data.find(
      (r: any) => r.strategyName === stratName && r.scenarioName === scenario.name,
    );
    if (!result) {
      console.log("  MISSING:", scenario.name);
      continue;
    }

    const answer = (result.finalAnswer ?? "").toLowerCase();

    for (const probe of scenario.probes) {
      const retained = probe.patterns.every((p) =>
        answer.includes(p.toLowerCase()),
      );
      totalProbes++;
      if (retained) totalRetained++;

      if (!byType[probe.type]) byType[probe.type] = { retained: 0, total: 0 };
      byType[probe.type].total++;
      if (retained) byType[probe.type].retained++;
    }
  }

  console.log("\nRetention by Fact Type:");
  console.log(
    "Type".padEnd(15) + "Retained".padEnd(12) + "Total".padEnd(8) + "Rate",
  );
  console.log("-".repeat(45));

  const types = Object.entries(byType).sort(
    (a, b) => a[1].retained / a[1].total - b[1].retained / b[1].total,
  );
  for (const [type, stats] of types) {
    const rate = ((stats.retained / stats.total) * 100).toFixed(0) + "%";
    console.log(
      type.padEnd(15) +
        String(stats.retained).padEnd(12) +
        String(stats.total).padEnd(8) +
        rate,
    );
  }
  console.log("-".repeat(45));
  console.log(
    "TOTAL".padEnd(15) +
      String(totalRetained).padEnd(12) +
      String(totalProbes).padEnd(8) +
      ((totalRetained / totalProbes) * 100).toFixed(1) +
      "%",
  );
  console.log("");
}

// Head-to-head
console.log("=".repeat(70));
console.log("HEAD-TO-HEAD: Probes where they differ");
console.log("=".repeat(70));

let prlmWins = 0;
let rlmWins = 0;

for (const scenario of ALL_SCENARIOS) {
  if (!scenario.probes || scenario.probes.length === 0) continue;
  const rlm = data.find(
    (r: any) => r.strategyName === "RLM(8)" && r.scenarioName === scenario.name,
  );
  const prlm = data.find(
    (r: any) =>
      r.strategyName === "PersistentRLM" && r.scenarioName === scenario.name,
  );
  if (!rlm || !prlm) continue;

  const rlmAnswer = (rlm.finalAnswer ?? "").toLowerCase();
  const prlmAnswer = (prlm.finalAnswer ?? "").toLowerCase();

  for (const probe of scenario.probes) {
    const rlmRetained = probe.patterns.every((p) =>
      rlmAnswer.includes(p.toLowerCase()),
    );
    const prlmRetained = probe.patterns.every((p) =>
      prlmAnswer.includes(p.toLowerCase()),
    );

    if (rlmRetained !== prlmRetained) {
      const winner = prlmRetained ? "PersistentRLM" : "RLM(8)";
      if (prlmRetained) prlmWins++;
      else rlmWins++;
      console.log(
        `  [${winner.padEnd(14)}] ${scenario.name} — ${probe.fact} (${probe.type})`,
      );
    }
  }
}

console.log(
  `\nDiff: PersistentRLM wins ${prlmWins} probes, RLM(8) wins ${rlmWins} probes`,
);
