import type { LLMMessage } from "../utils/llm";

export interface MemoryStrategy {
  name: string;

  // Reset state for a new scenario
  reset(): void;

  // Add a message to history
  addMessage(message: LLMMessage): void;

  // Get the messages to send to the LLM (this is where the strategy lives)
  getContext(): Promise<{
    messages: LLMMessage[];
    system?: string;
    memoryOverheadTokens: number; // tokens spent on summarization/extraction
  }>;
}
