import type { MemoryStrategy } from "../strategies/base";
import { chat } from "../utils/llm";
import type { StepMetrics } from "../utils/metrics";
import { aggregateMetrics, type BenchmarkResult } from "../utils/metrics";
import type { Scenario } from "./scenarios";

export async function runScenario(
  strategy: MemoryStrategy,
  scenario: Scenario
): Promise<BenchmarkResult> {
  strategy.reset();
  const stepMetrics: StepMetrics[] = [];

  console.log(
    `  Running: ${strategy.name} × ${scenario.name} (${scenario.steps.length} steps)...`
  );

  // Play through each step of the conversation
  for (let i = 0; i < scenario.steps.length; i++) {
    const userMessage = scenario.steps[i];

    // Add user message to memory
    strategy.addMessage({ role: "user", content: userMessage });

    // Get context from strategy (this is where compression/extraction happens)
    const context = await strategy.getContext();

    // Send to LLM
    const response = await chat(
      context.messages,
      [scenario.systemPrompt, context.system].filter(Boolean).join("\n\n")
    );

    // Add assistant response to memory
    strategy.addMessage({ role: "assistant", content: response.content });

    stepMetrics.push({
      step: i + 1,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      latencyMs: response.latencyMs,
      memoryOverheadTokens: context.memoryOverheadTokens,
    });

    // Progress indicator
    if ((i + 1) % 5 === 0) {
      process.stdout.write(
        `    Step ${i + 1}/${scenario.steps.length} (ctx: ${response.inputTokens} tok)\n`
      );
    }
  }

  // Now ask the final question
  strategy.addMessage({ role: "user", content: scenario.finalQuestion });
  const finalContext = await strategy.getContext();

  const finalResponse = await chat(
    finalContext.messages,
    [scenario.systemPrompt, finalContext.system].filter(Boolean).join("\n\n")
  );

  stepMetrics.push({
    step: scenario.steps.length + 1,
    inputTokens: finalResponse.inputTokens,
    outputTokens: finalResponse.outputTokens,
    latencyMs: finalResponse.latencyMs,
    memoryOverheadTokens: finalContext.memoryOverheadTokens,
  });

  const correct = scenario.checkAnswer(finalResponse.content);
  console.log(
    `  Result: ${correct ? "PASS" : "FAIL"} | Final answer tokens: ${finalResponse.inputTokens + finalResponse.outputTokens}`
  );

  if (!correct) {
    console.log(`  Answer preview: ${finalResponse.content.slice(0, 200)}...`);
  }

  return aggregateMetrics(
    strategy.name,
    scenario.name,
    stepMetrics,
    finalResponse.content,
    correct
  );
}
