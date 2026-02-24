import type { LLMMessage } from "../utils/llm";
import type { MemoryStrategy } from "./base";

/**
 * Keep only the last N message pairs in context.
 * Simple truncation — old messages are simply dropped.
 * This is the "observation masking" approach from JetBrains research.
 */
export class SlidingWindowStrategy implements MemoryStrategy {
  name: string;
  private messages: LLMMessage[] = [];
  private windowSize: number;

  constructor(windowSize = 10) {
    this.windowSize = windowSize;
    this.name = `Window(${windowSize})`;
  }

  reset(): void {
    this.messages = [];
  }

  addMessage(message: LLMMessage): void {
    this.messages.push(message);
  }

  async getContext() {
    const windowed = this.messages.slice(-this.windowSize);
    // Ensure we start with a user message
    const startIdx = windowed.findIndex((m) => m.role === "user");
    const clean = startIdx > 0 ? windowed.slice(startIdx) : windowed;

    return {
      messages: clean,
      memoryOverheadTokens: 0,
    };
  }
}
