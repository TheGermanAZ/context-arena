/**
 * Internal benchmark: backbone robustness matrix.
 *
 * Runs the same retention query across multiple model backbones.
 *
 * Usage:
 *   bun src/analysis/internal-backbone-matrix.ts
 *   bun src/analysis/internal-backbone-matrix.ts --models=gpt-5-nano,gpt-5-mini,gpt-4.1-mini
 */

import { chat } from "../utils/llm";

interface ModelResult {
  model: string;
  correct: boolean;
  predicted: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  error?: string;
}

interface Output {
  benchmark: string;
  sampledAt: string;
  models: string[];
  results: ModelResult[];
  notes: string[];
}

const messages = [
  { role: "user" as const, content: "Client profile: account id AC-7781, renewal date 2027-11-05, preferred region eu-north." },
  { role: "assistant" as const, content: "Noted." },
  { role: "user" as const, content: "Correction: preferred region is eu-west, not eu-north." },
  { role: "assistant" as const, content: "Updated." },
  { role: "user" as const, content: "What are the current account id and preferred region?" },
];

function parseModels(): string[] {
  const raw = process.argv
    .slice(2)
    .find((arg) => arg.startsWith("--models="))
    ?.split("=")[1];
  if (!raw) return ["gpt-5-nano", "gpt-5-mini", "gpt-4.1-mini"];
  return raw
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

function isCorrect(answer: string): boolean {
  const lower = answer.toLowerCase();
  return lower.includes("ac-7781") && lower.includes("eu-west") && !lower.includes("eu-north");
}

async function runModel(model: string): Promise<ModelResult> {
  try {
    const response = await chat(
      messages,
      "Answer with exact current values only.",
      model,
      256,
    );

    return {
      model,
      correct: isCorrect(response.content),
      predicted: response.content,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      latencyMs: response.latencyMs,
    };
  } catch (error) {
    return {
      model,
      correct: false,
      predicted: "",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      error: String(error),
    };
  }
}

async function main() {
  const models = parseModels();
  console.log(`Internal backbone matrix: ${models.join(", ")}`);

  const results: ModelResult[] = [];
  for (const model of models) {
    process.stdout.write(`  ${model}...`);
    const result = await runModel(model);
    results.push(result);
    if (result.error) {
      console.log(" error");
    } else {
      console.log(result.correct ? " pass" : " fail");
    }
  }

  const output: Output = {
    benchmark: "Internal Backbone Matrix",
    sampledAt: new Date().toISOString(),
    models,
    results,
    notes: [
      "Single correction-sensitive query across all backbones.",
      "Model availability depends on provider routing in current environment.",
    ],
  };

  const path = `results/internal-backbone-matrix-${Date.now()}.json`;
  await Bun.write(path, JSON.stringify(output, null, 2));

  const passed = results.filter((r) => r.correct).length;
  console.log(`\nPassed: ${passed}/${results.length}`);
  console.log(`Saved: ${path}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
