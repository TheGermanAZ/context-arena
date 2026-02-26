/**
 * Build unified scoreboard markdown from parallel benchmark manifest.
 *
 * Usage:
 *   bun src/analysis/parallel-scoreboard.ts --manifest=results/parallel-benchmarks-manifest-xxxx.json
 */

interface ManifestJob {
  name: string;
  artifactPath?: string;
  exitCode: number | null;
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

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function safe(n: number | undefined, d = 0): number {
  return Number.isFinite(n) ? Number(n) : d;
}

async function loadJson(path: string): Promise<any> {
  return Bun.file(path).json();
}

async function rowsForArtifact(jobName: string, path: string): Promise<string[]> {
  const data = await loadJson(path);
  const rows: string[] = [];

  if (jobName === "industry-longmemeval") {
    for (const s of data.strategies ?? []) {
      rows.push(
        `| Industry: LongMemEval Slice | ${s.strategyName} | ${s.correct}/${s.sampleSize} (${fmtPct(s.accuracy)}) | ${(safe(s.avgLatencyMs) / 1000).toFixed(1)}s | $${safe(s.totalEstimatedCostUsd).toFixed(4)} | proxy |`,
      );
    }
    return rows;
  }

  if (jobName === "industry-memoryarena") {
    for (const s of data.strategies ?? []) {
      rows.push(
        `| Industry: MemoryArena Slice | ${s.strategyName} | ${s.passedChecks}/${s.totalChecks} (${fmtPct(s.successRate)}) | ${(safe(s.avgLatencyMs) / 1000).toFixed(1)}s | $${safe(s.totalEstimatedCostUsd).toFixed(4)} | proxy |`,
      );
    }
    return rows;
  }

  if (jobName === "industry-memoryagentbench") {
    for (const s of data.strategies ?? []) {
      rows.push(
        `| Industry: MemoryAgentBench Subset | ${s.strategyName} | ${s.correct}/${s.total} (${fmtPct(s.accuracy)}) | ${(safe(s.avgLatencyMs) / 1000).toFixed(1)}s | $${safe(s.totalEstimatedCostUsd).toFixed(4)} | proxy |`,
      );
    }
    return rows;
  }

  if (jobName === "internal-cross-session") {
    for (const s of data.strategies ?? []) {
      rows.push(
        `| Internal: Cross-Session | ${s.strategyName} | ${s.correct ? "PASS" : "FAIL"} (${s.matchedChecks}/${s.totalChecks}) | ${(safe(s.totalLatencyMs) / 1000).toFixed(1)}s | $${safe(s.estimatedCostUsd).toFixed(4)} | internal |`,
      );
    }
    return rows;
  }

  if (jobName === "internal-multi-agent") {
    for (const s of data.strategies ?? []) {
      rows.push(
        `| Internal: Multi-Agent Handoff | ${s.strategyName} | ${s.correct ? "PASS" : "FAIL"} (${s.matchedChecks}/${s.totalChecks}) | ${(safe(s.totalLatencyMs) / 1000).toFixed(1)}s | $${safe(s.estimatedCostUsd).toFixed(4)} | internal |`,
      );
    }
    return rows;
  }

  if (jobName === "internal-scale-ladder") {
    for (const s of data.strategies ?? []) {
      rows.push(
        `| Internal: Scale Ladder | ${s.strategyName} | ${s.passed}/${s.total} (${fmtPct(s.passRate)}) | ${(safe(s.avgLatencyMs) / 1000).toFixed(1)}s | $${safe(s.totalEstimatedCostUsd).toFixed(4)} | internal |`,
      );
    }
    return rows;
  }

  if (jobName === "internal-backbone-matrix") {
    for (const r of data.results ?? []) {
      rows.push(
        `| Internal: Backbone Matrix | ${r.model} | ${r.correct ? "PASS" : "FAIL"} | ${(safe(r.latencyMs) / 1000).toFixed(1)}s | $0.0000 | internal |`,
      );
    }
    return rows;
  }

  rows.push(`| ${jobName} | - | no parser | - | - | unknown |`);
  return rows;
}

async function main() {
  const manifestPath = arg("manifest");
  if (!manifestPath) {
    throw new Error("--manifest is required");
  }

  const manifest = (await loadJson(manifestPath)) as Manifest;

  const lines: string[] = [];
  const artifactLines: string[] = [];

  for (const job of manifest.jobs) {
    if (job.artifactPath) {
      artifactLines.push(`- ${job.name}: \`${job.artifactPath}\` (exit ${job.exitCode})`);
      const rows = await rowsForArtifact(job.name, job.artifactPath);
      lines.push(...rows);
    } else {
      artifactLines.push(`- ${job.name}: (no artifact, exit ${job.exitCode})`);
    }
  }

  const md = `# Parallel Benchmark Scoreboard

Generated: ${new Date().toISOString()}
Manifest: \`${manifestPath}\`
Window: ${manifest.startedAt} -> ${manifest.finishedAt}

## Unified Results
| Track | Strategy / Model | Score | Avg Latency | Cost | Type |
|---|---|---|---:|---:|---|
${lines.join("\n")}

## Artifacts
${artifactLines.join("\n")}

## Notes
- Industry tracks are bounded proxy runs for one-day parallel execution.
- Internal tracks are targeted diagnostics for product-specific risk areas.
- Expand sample sizes and switch industry runners to official evaluation pipelines in the next pass.
`;

  const outPath = "docs/research/parallel-benchmark-scoreboard.md";
  await Bun.write(outPath, md);
  console.log(`Scoreboard written: ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
