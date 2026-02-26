/**
 * Orchestrate official-mode benchmark runs in parallel.
 */

import { readdirSync, statSync } from "fs";

interface Job {
  name: string;
  script: string;
  args: string[];
  prefix: string;
}

interface JobResult {
  name: string;
  exitCode: number | null;
  artifactPath?: string;
}

interface Manifest {
  startedAt: string;
  finishedAt: string;
  jobs: JobResult[];
}

function latest(prefix: string): string | undefined {
  const files = readdirSync("results").filter((f) => f.startsWith(prefix) && f.endsWith(".json"));
  if (!files.length) return undefined;
  files.sort((a, b) => statSync(`results/${b}`).mtimeMs - statSync(`results/${a}`).mtimeMs);
  return `results/${files[0]}`;
}

async function collect(stream: ReadableStream<Uint8Array> | null, log: (line: string) => void) {
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
      if (line) log(line);
      buf = buf.slice(idx + 1);
      idx = buf.indexOf("\n");
    }
  }
  const tail = buf.trim();
  if (tail) log(tail);
}

async function run(job: Job): Promise<JobResult> {
  console.log(`\n[start] ${job.name}`);
  const proc = Bun.spawn({ cmd: ["bun", job.script, ...job.args], stdout: "pipe", stderr: "pipe" });
  const out = collect(proc.stdout, (line) => console.log(`[${job.name}] ${line}`));
  const err = collect(proc.stderr, (line) => console.log(`[${job.name}:err] ${line}`));
  const exitCode = await proc.exited;
  await out;
  await err;
  const artifactPath = latest(job.prefix);
  console.log(`[done] ${job.name} exit=${exitCode}${artifactPath ? ` -> ${artifactPath}` : ""}`);
  return { name: job.name, exitCode, artifactPath };
}

async function main() {
  const jobs: Job[] = [
    {
      name: "official-longmemeval",
      script: "src/analysis/official-longmemeval.ts",
      args: ["--sample=3", "--ingest-batch=8"],
      prefix: "official-longmemeval-",
    },
    {
      name: "official-memoryarena",
      script: "src/analysis/official-memoryarena.ts",
      args: ["--sample=2", "--steps=2"],
      prefix: "official-memoryarena-",
    },
    {
      name: "official-memoryagentbench",
      script: "src/analysis/official-memoryagentbench.ts",
      args: ["--sample=2", "--max-context-chars=60000"],
      prefix: "official-memoryagentbench-",
    },
  ];

  const startedAt = new Date().toISOString();
  const results = await Promise.all(jobs.map((j) => run(j)));
  const finishedAt = new Date().toISOString();

  const manifest: Manifest = { startedAt, finishedAt, jobs: results };
  const manifestPath = `results/official-benchmarks-manifest-${Date.now()}.json`;
  await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest: ${manifestPath}`);

  const scoreProc = Bun.spawn({
    cmd: ["bun", "src/analysis/official-scoreboard.ts", `--manifest=${manifestPath}`],
    stdout: "inherit",
    stderr: "inherit",
  });
  const scoreExit = await scoreProc.exited;
  if (scoreExit !== 0) {
    console.log(`official-scoreboard exited with ${scoreExit}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
