import type { LLMMessage } from "../utils/llm";
import type { MemoryStrategy } from "./base";

/**
 * Baseline: send the entire conversation history every time.
 * No compression, no management. This is what most naive agents do.
 */
export class FullContextStrategy implements MemoryStrategy {
  name = "Full Context";
  private messages: LLMMessage[] = [];

  reset(): void {
    this.messages = [];
  }

  addMessage(message: LLMMessage): void {
    this.messages.push(message);
  }

  async getContext() {
    return {
      messages: [...this.messages],
      memoryOverheadTokens: 0,
    };
  }
}
