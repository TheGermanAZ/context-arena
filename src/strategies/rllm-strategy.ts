import type { LLMMessage } from "../utils/llm";
import type { MemoryStrategy } from "./base";
import { RLLM, type RLMResult, type RLMEvent } from "rllm";

export interface CodeLogEntry {
  cycle: number;
  iteration: number;
  code: string;
  timestamp: number;
}

export interface ExtractionLogEntry {
  cycle: number;
  step: number;
  content: string;
  messagesCompressed: number;
  subCalls: number;
  totalTokens: number;
  executionTimeMs: number;
  iterations: number;
}

export class RLLMStrategy implements MemoryStrategy {
  name = "RLLM";
  private messages: LLMMessage[] = [];
  private delegatedKnowledge: string[] = [];
  private compressEvery: number;
  private recentWindow: number;
  private maxIterations: number;
  private totalOverheadTokens = 0;
  private messagesSinceCompression = 0;
  private currentStep = 0;
  private compressionCycle = 0;

  codeLogs: CodeLogEntry[] = [];
  extractionLog: ExtractionLogEntry[] = [];

  constructor(compressEvery = 8, recentWindow = 4, maxIterations = 5) {
    this.compressEvery = compressEvery;
    this.recentWindow = recentWindow;
    this.maxIterations = maxIterations;
  }

  reset(): void {
    this.messages = [];
    this.delegatedKnowledge = [];
    this.totalOverheadTokens = 0;
    this.messagesSinceCompression = 0;
    this.currentStep = 0;
    this.compressionCycle = 0;
    this.codeLogs = [];
    this.extractionLog = [];
  }

  addMessage(message: LLMMessage): void {
    this.messages.push(message);
    this.messagesSinceCompression++;
    this.currentStep++;
  }

  async getContext() {
    let overheadThisStep = 0;

    if (
      this.messagesSinceCompression >= this.compressEvery &&
      this.messages.length > this.recentWindow
    ) {
      const toCompress = this.messages.slice(
        0,
        this.messages.length - this.recentWindow,
      );

      const transcript = toCompress
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      const existingKnowledge =
        this.delegatedKnowledge.length > 0
          ? `Previously extracted knowledge:\n${this.delegatedKnowledge.join("\n")}\n\n`
          : "";

      this.compressionCycle++;
      const cycle = this.compressionCycle;

      try {
        const rlm = new RLLM({
          client: {
            model: "gpt-5-nano",
            provider: "custom",
            baseUrl: "https://opencode.ai/zen/v1",
            apiKey: process.env.OPENCODE_ZEN_KEY!,
          },
          maxIterations: this.maxIterations,
          verbose: false,
        });

        const prompt = `You are a memory extraction agent. Your job is to extract a COMPLETE knowledge state from this conversation transcript so that NOTHING is lost. The extracted knowledge will be the ONLY record — if you miss a detail, it is lost forever.

${existingKnowledge}Extract ALL facts from this conversation transcript. Be exhaustive — every name, number, ID, phone number, date, location, decision, correction, and relationship matters.

Conversation transcript:
${transcript}`;

        const result: RLMResult = await rlm.completion(prompt, {
          context: transcript,
          onEvent: (event: RLMEvent) => {
            if (event.type === "code_execution_start" && event.code) {
              this.codeLogs.push({
                cycle,
                iteration: event.iteration ?? 0,
                code: event.code,
                timestamp: event.timestamp,
              });
            }
          },
        });

        overheadThisStep = result.usage.tokenUsage.totalTokens;
        this.totalOverheadTokens += overheadThisStep;

        this.extractionLog.push({
          cycle,
          step: this.currentStep,
          content: result.answer.message,
          messagesCompressed: toCompress.length,
          subCalls: result.usage.subCalls,
          totalTokens: result.usage.tokenUsage.totalTokens,
          executionTimeMs: result.usage.executionTimeMs,
          iterations: result.iterations,
        });

        this.delegatedKnowledge = [result.answer.message];
      } catch (err) {
        console.error(`  RLLM failed on cycle ${cycle}: ${err}`);
        // Fallback: store raw transcript excerpt if rllm fails
        const fallback = transcript.slice(0, 2000);
        this.delegatedKnowledge = [fallback];

        this.extractionLog.push({
          cycle,
          step: this.currentStep,
          content: fallback,
          messagesCompressed: toCompress.length,
          subCalls: 0,
          totalTokens: 0,
          executionTimeMs: 0,
          iterations: 0,
        });
      }

      this.messages = this.messages.slice(-this.recentWindow);
      this.messagesSinceCompression = 0;
    }

    const messages: LLMMessage[] = [...this.messages];
    const startIdx = messages.findIndex((m) => m.role === "user");
    const clean = startIdx > 0 ? messages.slice(startIdx) : messages;

    const systemParts: string[] = [];
    if (this.delegatedKnowledge.length > 0) {
      systemParts.push(
        `DELEGATED KNOWLEDGE (extracted by agentic code-execution from earlier conversation):\n${this.delegatedKnowledge.join("\n\n")}`,
      );
    }

    return {
      messages: clean,
      system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
      memoryOverheadTokens: overheadThisStep,
    };
  }
}
