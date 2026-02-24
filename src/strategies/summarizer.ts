import type { LLMMessage } from "../utils/llm";
import { summarize } from "../utils/llm";
import type { MemoryStrategy } from "./base";

/**
 * Periodically summarize old messages into a compressed summary.
 * Keeps a rolling summary + recent messages.
 * This is the approach used by OpenHands/LangChain ConversationSummaryMemory.
 */
export class SummarizationStrategy implements MemoryStrategy {
  name: string;
  private messages: LLMMessage[] = [];
  private summary = "";
  private summarizeEvery: number;
  private recentWindow: number;
  private totalOverheadTokens = 0;

  constructor(summarizeEvery = 8, recentWindow = 6) {
    this.summarizeEvery = summarizeEvery;
    this.recentWindow = recentWindow;
    this.name = `Summarize(${summarizeEvery})`;
  }

  reset(): void {
    this.messages = [];
    this.summary = "";
    this.totalOverheadTokens = 0;
  }

  addMessage(message: LLMMessage): void {
    this.messages.push(message);
  }

  async getContext() {
    let overheadThisStep = 0;

    // If we've accumulated enough messages, summarize the old ones
    if (this.messages.length > this.summarizeEvery + this.recentWindow) {
      const toSummarize = this.messages.slice(
        0,
        this.messages.length - this.recentWindow
      );

      const transcript = toSummarize
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      const textToSummarize = this.summary
        ? `Previous summary:\n${this.summary}\n\nNew messages:\n${transcript}`
        : transcript;

      const result = await summarize(textToSummarize);
      this.summary = result.content;
      overheadThisStep = result.inputTokens + result.outputTokens;
      this.totalOverheadTokens += overheadThisStep;

      // Keep only recent messages
      this.messages = this.messages.slice(-this.recentWindow);
    }

    const messages: LLMMessage[] = [...this.messages];
    // Ensure starts with user message
    const startIdx = messages.findIndex((m) => m.role === "user");
    const clean = startIdx > 0 ? messages.slice(startIdx) : messages;

    return {
      messages: clean,
      system: this.summary
        ? `CONVERSATION SUMMARY (earlier context):\n${this.summary}`
        : undefined,
      memoryOverheadTokens: overheadThisStep,
    };
  }
}
