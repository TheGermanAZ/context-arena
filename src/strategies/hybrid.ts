import type { LLMMessage } from "../utils/llm";
import { extractFacts, summarize } from "../utils/llm";
import type { MemoryStrategy } from "./base";

/**
 * Hybrid approach: structured facts + rolling summary + recent window.
 * Combines the best of summarization and structured extraction.
 * Most similar to the Focus Loop's "Knowledge block" approach.
 */
export class HybridStrategy implements MemoryStrategy {
  name = "Hybrid";
  private messages: LLMMessage[] = [];
  private facts: string[] = [];
  private narrativeSummary = "";
  private compressEvery: number;
  private recentWindow: number;
  private totalOverheadTokens = 0;
  private messagesSinceCompression = 0;

  constructor(compressEvery = 8, recentWindow = 4) {
    this.compressEvery = compressEvery;
    this.recentWindow = recentWindow;
  }

  reset(): void {
    this.messages = [];
    this.facts = [];
    this.narrativeSummary = "";
    this.totalOverheadTokens = 0;
    this.messagesSinceCompression = 0;
  }

  addMessage(message: LLMMessage): void {
    this.messages.push(message);
    this.messagesSinceCompression++;
  }

  async getContext() {
    let overheadThisStep = 0;

    if (
      this.messagesSinceCompression >= this.compressEvery &&
      this.messages.length > this.recentWindow
    ) {
      const toCompress = this.messages.slice(
        0,
        this.messages.length - this.recentWindow
      );

      // Run fact extraction AND summarization in parallel
      const [factResult, summaryResult] = await Promise.all([
        extractFacts(toCompress),
        summarize(
          (this.narrativeSummary
            ? `Previous summary:\n${this.narrativeSummary}\n\nNew messages:\n`
            : "") + toCompress.map((m) => `${m.role}: ${m.content}`).join("\n")
        ),
      ]);

      overheadThisStep =
        factResult.inputTokens +
        factResult.outputTokens +
        summaryResult.inputTokens +
        summaryResult.outputTokens;
      this.totalOverheadTokens += overheadThisStep;

      // Update narrative summary
      this.narrativeSummary = summaryResult.content;

      // Merge facts
      const newFacts = factResult.content
        .split("\n")
        .filter((line) => line.match(/^\d+\./))
        .map((line) => line.replace(/^\d+\.\s*/, "").trim());

      for (const fact of newFacts) {
        const idx = this.facts.findIndex(
          (existing) =>
            existing.toLowerCase().includes(fact.toLowerCase().slice(0, 30)) ||
            fact.toLowerCase().includes(existing.toLowerCase().slice(0, 30))
        );
        if (idx >= 0) {
          this.facts[idx] = fact; // Update existing
        } else {
          this.facts.push(fact);
        }
      }

      this.messages = this.messages.slice(-this.recentWindow);
      this.messagesSinceCompression = 0;
    }

    const messages: LLMMessage[] = [...this.messages];
    const startIdx = messages.findIndex((m) => m.role === "user");
    const clean = startIdx > 0 ? messages.slice(startIdx) : messages;

    const systemParts: string[] = [];
    if (this.facts.length > 0) {
      systemParts.push(
        `KEY FACTS:\n${this.facts.map((f, i) => `${i + 1}. ${f}`).join("\n")}`
      );
    }
    if (this.narrativeSummary) {
      systemParts.push(`CONVERSATION SUMMARY:\n${this.narrativeSummary}`);
    }

    return {
      messages: clean,
      system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
      memoryOverheadTokens: overheadThisStep,
    };
  }
}
