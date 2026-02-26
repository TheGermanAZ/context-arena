/**
 * Run all requested benchmark tracks in parallel.
 *
 * Usage:
 *   bun src/analysis/parallel-benchmarks.ts
 */

import { readdirSync, statSync } from "fs";

interface Job {
  name: string;
  script: string;
  args: string[];
  resultPrefix: string;
}

interface JobResult {
  name: string;
  script: string;
  args: string[];
  exitCode: number | null;
  artifactPath?: string;
}

interface Manifest {
  startedAt: string;
  finishedAt: string;
  jobs: JobResult[];
}

function latestForPrefix(prefix: string): { path: string; mtimeMs: number } | null {
  const files = readdirSync("results").filter((f) => f.startsWith(prefix) && f.endsWith(".json"));
  if (files.length === 0) return null;

  const sorted = files
    .map((f) => ({ path: `results/${f}`, mtimeMs: statSync(`results/${f}`).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return sorted[0] ?? null;
}

async function collectStream(stream: ReadableStream<Uint8Array> | null, onLine: (line: string) => void) {
  if (!stream) return;
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });

    let idx = buf.indexOf("\n");
    while (idx >= 0) {
      const line = buf.slice(0, idx).trimEnd();
      if (line) onLine(line);
      buf = buf.slice(idx + 1);
      idx = buf.indexOf("\n");
    }
  }

  const tail = buf.trim();
  if (tail) onLine(tail);
}

async function runJob(job: Job): Promise<JobResult> {
  console.log(`\n[start] ${job.name}`);

  const proc = Bun.spawn({
    cmd: ["bun", job.script, ...job.args],
    stdout: "pipe",
    stderr: "pipe",
  });

  const outTask = collectStream(proc.stdout, (line) => console.log(`[${job.name}] ${line}`));
  const errTask = collectStream(proc.stderr, (line) => console.log(`[${job.name}:err] ${line}`));

  const exitCode = await proc.exited;
  await outTask;
  await errTask;

  const artifact = latestForPrefix(job.resultPrefix);

  console.log(`[done] ${job.name} (exit ${exitCode})${artifact ? ` -> ${artifact.path}` : ""}`);

  return {
    name: job.name,
    script: job.script,
    args: job.args,
    exitCode,
    artifactPath: artifact?.path,
  };
}

async function main() {
  const jobs: Job[] = [
    {
      name: "industry-longmemeval",
      script: "src/analysis/longmemeval-slice.ts",
      args: ["--sample=3", "--ingest-batch=8"],
      resultPrefix: "longmemeval-slice-",
    },
    {
      name: "industry-memoryarena",
      script: "src/analysis/memoryarena-slice.ts",
      args: ["--sample=2", "--steps=2"],
      resultPrefix: "memoryarena-slice-",
    },
    {
      name: "industry-memoryagentbench",
      script: "src/analysis/memoryagentbench-slice.ts",
      args: ["--sample=2"],
      resultPrefix: "memoryagentbench-slice-",
    },
    {
      name: "internal-cross-session",
      script: "src/analysis/internal-cross-session.ts",
      args: [],
      resultPrefix: "internal-cross-session-",
    },
    {
      name: "internal-multi-agent",
      script: "src/analysis/internal-multi-agent.ts",
      args: [],
      resultPrefix: "internal-multi-agent-",
    },
    {
      name: "internal-scale-ladder",
      script: "src/analysis/internal-scale-ladder.ts",
      args: ["--tiers=8000,32000,128000"],
      resultPrefix: "internal-scale-ladder-",
    },
    {
      name: "internal-backbone-matrix",
      script: "src/analysis/internal-backbone-matrix.ts",
      args: ["--models=gpt-5-nano,gpt-5-mini,gpt-4.1-mini"],
      resultPrefix: "internal-backbone-matrix-",
    },
  ];

  console.log("Running all benchmark tracks in parallel...");

  const startedAt = new Date().toISOString();
  const results = await Promise.all(jobs.map((j) => runJob(j)));
  const finishedAt = new Date().toISOString();

  const manifest: Manifest = {
    startedAt,
    finishedAt,
    jobs: results,
  };

  const manifestPath = `results/parallel-benchmarks-manifest-${Date.now()}.json`;
  await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`\nManifest: ${manifestPath}`);

  // Generate unified scoreboard immediately.
  const reportProc = Bun.spawn({
    cmd: ["bun", "src/analysis/parallel-scoreboard.ts", `--manifest=${manifestPath}`],
    stdout: "inherit",
    stderr: "inherit",
  });

  const reportExit = await reportProc.exited;
  if (reportExit !== 0) {
    console.log(`Scoreboard generation exited with code ${reportExit}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
