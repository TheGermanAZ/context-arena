/**
 * Build official-mode scoreboard markdown from manifest.
 */

interface ManifestJob {
  name: string;
  exitCode: number | null;
  artifactPath?: string;
}

interface Manifest {
  startedAt: string;
  finishedAt: string;
  jobs: ManifestJob[];
}

function arg(name: string): string | undefined {
  return process.argv
    .slice(2)
    .find((a) => a.startsWith(`--${name}=`))
    ?.split("=")[1];
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function num(v: unknown, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

async function load(path: string): Promise<any> {
  return Bun.file(path).json();
}

async function rows(jobName: string, path: string): Promise<string[]> {
  const data = await load(path);

  if (jobName === "official-longmemeval") {
    return (data.strategies ?? []).map(
      (s: any) =>
        `| LongMemEval | ${s.strategyName} | ${s.correct}/${s.total} (${pct(num(s.accuracy))}) | ${(num(s.avgLatencyMs) / 1000).toFixed(1)}s | $${num(s.totalEstimatedCostUsd).toFixed(4)} | deterministic fallback |`,
    );
  }

  if (jobName === "official-memoryarena") {
    return (data.strategies ?? []).map(
      (s: any) =>
        `| MemoryArena | ${s.strategyName} | ${s.correct}/${s.total} (${pct(num(s.accuracy))}) | ${(num(s.avgLatencyMs) / 1000).toFixed(1)}s | $${num(s.totalEstimatedCostUsd).toFixed(4)} | deterministic fallback |`,
    );
  }

  if (jobName === "official-memoryagentbench") {
    return (data.strategies ?? []).map(
      (s: any) =>
        `| MemoryAgentBench (EventQA + FactConsolidation) | ${s.strategyName} | ${s.correct}/${s.total} (${pct(num(s.accuracy))}) | ${(num(s.avgLatencyMs) / 1000).toFixed(1)}s | $${num(s.totalEstimatedCostUsd).toFixed(4)} | deterministic fallback |`,
    );
  }

  return [`| ${jobName} | - | - | - | - | unknown |`];
}

async function main() {
  const manifestPath = arg("manifest");
  if (!manifestPath) throw new Error("--manifest is required");

  const manifest = (await load(manifestPath)) as Manifest;

  const table: string[] = [];
  const artifacts: string[] = [];

  for (const job of manifest.jobs) {
    if (job.artifactPath) {
      artifacts.push(`- ${job.name}: \`${job.artifactPath}\` (exit ${job.exitCode})`);
      const rs = await rows(job.name, job.artifactPath);
      table.push(...rs);
    } else {
      artifacts.push(`- ${job.name}: no artifact (exit ${job.exitCode})`);
    }
  }

  const markdown = `# Official Benchmark Scoreboard

Generated: ${new Date().toISOString()}
Manifest: \`${manifestPath}\`
Window: ${manifest.startedAt} -> ${manifest.finishedAt}

## Results
| Benchmark | Strategy | Score | Avg Latency | Cost | Scoring Mode |
|---|---|---|---:|---:|---|
${table.join("\n")}

## Artifacts
${artifacts.join("\n")}

## Summary
- Official benchmark datasets/splits were used for LongMemEval, MemoryArena, and MemoryAgentBench.
- Official LLM-judge evaluation steps require external judge credentials not available in this runtime.
- Deterministic fallback scoring was used for this run and is explicitly labeled above.
`;

  const outPath = "docs/research/official-benchmark-scoreboard.md";
  await Bun.write(outPath, markdown);

  console.log(`Scoreboard written: ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
