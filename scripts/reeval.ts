const fullData = await Bun.file("results/benchmark-1771954472148.json").json();
const rlmData = await Bun.file("results/benchmark-1771957581509.json").json();

function fixedCheckContradiction(answer: string): boolean {
  const lower = answer.toLowerCase();
  return (
    lower.includes("june 1") &&
    (lower.includes("june 18") ||
      lower.includes("june 18th") ||
      lower.includes("1-18") ||
      lower.includes("1 to june 18")) &&
    lower.includes("8,500") &&
    lower.includes("1,350") &&
    lower.includes("aman") &&
    lower.includes("500") &&
    lower.includes("shinjuku") &&
    lower.includes("090-8765-4321") &&
    lower.includes("june 10")
  );
}

console.log("CORRECTED CONTRADICTION RESOLUTION:");
const allCR = fullData.filter(
  (r: any) => r.scenarioName === "Contradiction Resolution",
);
for (const r of allCR) {
  const newResult = fixedCheckContradiction(r.finalAnswer);
  const tag = r.correct !== newResult ? " ** CHANGED **" : "";
  console.log(
    "  " +
      r.strategyName.padEnd(18) +
      (r.correct ? "PASS" : "FAIL") +
      " -> " +
      (newResult ? "PASS" : "FAIL") +
      tag,
  );
}
for (const r of rlmData.filter(
  (r: any) => r.scenarioName === "Contradiction Resolution",
)) {
  const newResult = fixedCheckContradiction(r.finalAnswer);
  const tag = r.correct !== newResult ? " ** CHANGED **" : "";
  console.log(
    "  " +
      r.strategyName.padEnd(18) +
      (r.correct ? "PASS" : "FAIL") +
      " -> " +
      (newResult ? "PASS" : "FAIL") +
      tag,
  );
}

console.log("\nCORRECTED LEADERBOARD:");
console.log("=".repeat(80));
console.log(
  "Strategy".padEnd(20) +
    "Score".padStart(7) +
    "Acc".padStart(8) +
    "Avg Tok".padStart(12) +
    "Overhead".padStart(10) +
    "Cost".padStart(12),
);
console.log("-".repeat(69));

const strategies = [...new Set(fullData.map((r: any) => r.strategyName))];
strategies.push("RLM(8)");

const rows: Array<{
  name: string;
  correct: number;
  total: number;
  avgInput: number;
  avgOverhead: number;
  totalCost: number;
}> = [];

for (const strat of strategies) {
  const results =
    strat === "RLM(8)"
      ? rlmData
      : fullData.filter((r: any) => r.strategyName === strat);
  let correct = 0;
  let total = 0;
  for (const r of results) {
    total++;
    if (r.scenarioName === "Contradiction Resolution") {
      if (fixedCheckContradiction(r.finalAnswer)) correct++;
    } else {
      if (r.correct) correct++;
    }
  }
  const avgInput = Math.round(
    results.reduce((s: number, r: any) => s + r.totalInputTokens, 0) /
      results.length,
  );
  const avgOverhead = Math.round(
    results.reduce(
      (s: number, r: any) => s + r.totalMemoryOverheadTokens,
      0,
    ) / results.length,
  );
  const totalCost = results.reduce(
    (s: number, r: any) => s + r.estimatedCostUsd,
    0,
  );
  rows.push({ name: strat, correct, total, avgInput, avgOverhead, totalCost });
}

// Sort by accuracy descending, then by cost ascending
rows.sort((a, b) => {
  const accA = a.correct / a.total;
  const accB = b.correct / b.total;
  if (accB !== accA) return accB - accA;
  return a.totalCost - b.totalCost;
});

for (const r of rows) {
  const acc = ((r.correct / r.total) * 100).toFixed(0);
  console.log(
    r.name.padEnd(20) +
      (r.correct + "/" + r.total).padStart(7) +
      (acc + "%").padStart(8) +
      r.avgInput.toLocaleString().padStart(12) +
      r.avgOverhead.toLocaleString().padStart(10) +
      ("$" + r.totalCost.toFixed(4)).padStart(12),
  );
}
