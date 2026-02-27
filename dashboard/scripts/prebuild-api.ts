import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { app } from '../server';

const outputDir = path.resolve(import.meta.dir, '../public/data');
await mkdir(outputDir, { recursive: true });

const endpoints = [
  'leaderboard',
  'retention-by-type',
  'depth-comparison',
  'retention-curve',
  'rllm-comparison',
  'token-cost',
  'code-analysis',
  'scenario-heatmap',
  'cost-accuracy',
  'scenario-difficulty',
  'parallel-benchmarks',
  'journal',
];

for (const name of endpoints) {
  const res = await app.request(`/api/${name}`);
  if (!res.ok) {
    console.error(`PREBUILD FAILED: /api/${name} returned ${res.status}`);
    process.exit(1);
  }
  const data = await res.json();
  const filePath = path.join(outputDir, `${name}.json`);
  await Bun.write(filePath, JSON.stringify(data));
  console.log(`  ✓ ${filePath}`);
}

// Token-cost: merge all scenarios into one file for static serving
// (avoids filenames with spaces/special chars in scenario names)
const tokenCostRes = await app.request('/api/token-cost');
if (!tokenCostRes.ok) {
  console.error(`PREBUILD FAILED: /api/token-cost returned ${tokenCostRes.status} (scenario discovery)`);
  process.exit(1);
}
const tokenCostDefault = (await tokenCostRes.json()) as {
  scenario: string;
  strategies: unknown[];
  availableScenarios: string[];
};
const byScenario: Record<string, { scenario: string; strategies: unknown[] }> = {
  [tokenCostDefault.scenario]: {
    scenario: tokenCostDefault.scenario,
    strategies: tokenCostDefault.strategies,
  },
};
for (const scenario of tokenCostDefault.availableScenarios) {
  if (scenario === tokenCostDefault.scenario) continue; // already have it
  const res = await app.request(`/api/token-cost?scenario=${encodeURIComponent(scenario)}`);
  if (!res.ok) {
    console.error(`PREBUILD FAILED: /api/token-cost?scenario=${scenario} returned ${res.status}`);
    process.exit(1);
  }
  const data = (await res.json()) as { scenario: string; strategies: unknown[] };
  byScenario[scenario] = { scenario: data.scenario, strategies: data.strategies };
}
// Overwrite the default token-cost.json with all-scenarios bundle
const allScenariosPath = path.join(outputDir, 'token-cost.json');
await Bun.write(
  allScenariosPath,
  JSON.stringify({
    availableScenarios: tokenCostDefault.availableScenarios,
    defaultScenario: tokenCostDefault.scenario,
    byScenario,
  }),
);
console.log(`  ✓ ${allScenariosPath} (all ${tokenCostDefault.availableScenarios.length} scenarios)`)

console.log('\nPrebuild complete.');
