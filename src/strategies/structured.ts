import type { LLMMessage } from "../utils/llm";
import { extractFacts } from "../utils/llm";
import type { MemoryStrategy } from "./base";

/**
 * Extract structured facts from conversation, inject them as system context.
 * Only keeps recent messages + accumulated knowledge.
 * Inspired by AgeMem's fact extraction and AFM's importance scoring.
 */
export class StructuredExtractionStrategy implements MemoryStrategy {
  name: string;
  private messages: LLMMessage[] = [];
  private facts: string[] = [];
  private extractEvery: number;
  private recentWindow: number;
  private totalOverheadTokens = 0;
  private messagesSinceExtraction = 0;

  constructor(extractEvery = 8, recentWindow = 4) {
    this.extractEvery = extractEvery;
    this.recentWindow = recentWindow;
    this.name = `Structured(${extractEvery})`;
  }

  reset(): void {
    this.messages = [];
    this.facts = [];
    this.totalOverheadTokens = 0;
    this.messagesSinceExtraction = 0;
  }

  addMessage(message: LLMMessage): void {
    this.messages.push(message);
    this.messagesSinceExtraction++;
  }

  async getContext() {
    let overheadThisStep = 0;

    // Extract facts periodically from new messages
    if (
      this.messagesSinceExtraction >= this.extractEvery &&
      this.messages.length > this.recentWindow
    ) {
      const toExtract = this.messages.slice(
        0,
        this.messages.length - this.recentWindow
      );

      const result = await extractFacts(toExtract);
      overheadThisStep = result.inputTokens + result.outputTokens;
      this.totalOverheadTokens += overheadThisStep;

      // Parse numbered facts from response
      const newFacts = result.content
        .split("\n")
        .filter((line) => line.match(/^\d+\./))
        .map((line) => line.replace(/^\d+\.\s*/, "").trim());

      // Merge with existing facts (deduplicate by checking overlap)
      for (const fact of newFacts) {
        const isDuplicate = this.facts.some(
          (existing) =>
            existing.toLowerCase().includes(fact.toLowerCase().slice(0, 30)) ||
            fact.toLowerCase().includes(existing.toLowerCase().slice(0, 30))
        );
        if (!isDuplicate) {
          this.facts.push(fact);
        } else {
          // Replace old version with new (handles updates)
          const idx = this.facts.findIndex(
            (existing) =>
              existing
                .toLowerCase()
                .includes(fact.toLowerCase().slice(0, 30)) ||
              fact.toLowerCase().includes(existing.toLowerCase().slice(0, 30))
          );
          if (idx >= 0) this.facts[idx] = fact;
        }
      }

      // Trim to recent window
      this.messages = this.messages.slice(-this.recentWindow);
      this.messagesSinceExtraction = 0;
    }

    const messages: LLMMessage[] = [...this.messages];
    const startIdx = messages.findIndex((m) => m.role === "user");
    const clean = startIdx > 0 ? messages.slice(startIdx) : messages;

    const knowledgeBlock =
      this.facts.length > 0
        ? `KNOWN FACTS (extracted from earlier conversation):\n${this.facts.map((f, i) => `${i + 1}. ${f}`).join("\n")}`
        : undefined;

    return {
      messages: clean,
      system: knowledgeBlock,
      memoryOverheadTokens: overheadThisStep,
    };
  }
}
