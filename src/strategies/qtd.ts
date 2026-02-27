import type { LLMMessage } from "../utils/llm";
import { chat } from "../utils/llm";
import type { MemoryStrategy } from "./base";
import type { DelegationLogEntry } from "./rlm";

/**
 * Query-Time Distillation (QTD) Strategy
 *
 * Accumulates all messages raw — no compression during the conversation.
 * When context exceeds the token budget at getContext() time, fires a
 * single sub-LLM call guided by the latest user question to extract
 * only what's relevant.
 */
export class QTDStrategy implements MemoryStrategy {
  name = "QTD";
  private messages: LLMMessage[] = [];
  private tokenBudget: number;
  private recentWindow: number;
  private totalOverheadTokens = 0;
  private currentStep = 0;
  private distillationCount = 0;

  enableLogging = false;
  delegationLog: DelegationLogEntry[] = [];

  constructor(tokenBudget = 8000, recentWindow = 4) {
    this.tokenBudget = tokenBudget;
    this.recentWindow = recentWindow;
  }

  reset(): void {
    this.messages = [];
    this.totalOverheadTokens = 0;
    this.currentStep = 0;
    this.distillationCount = 0;
    this.delegationLog = [];
  }

  addMessage(message: LLMMessage): void {
    this.messages.push(message);
    this.currentStep++;
  }

  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async getContext() {
    let overheadThisStep = 0;

    const totalTokens = this.messages.reduce(
      (sum, m) => sum + QTDStrategy.estimateTokens(m.content),
      0,
    );

    if (totalTokens <= this.tokenBudget) {
      const messages = [...this.messages];
      const startIdx = messages.findIndex((m) => m.role === "user");
      const clean = startIdx > 0 ? messages.slice(startIdx) : messages;
      return { messages: clean, system: undefined, memoryOverheadTokens: 0 };
    }

    const latestUserMsg = [...this.messages]
      .reverse()
      .find((m) => m.role === "user");
    const question = latestUserMsg?.content ?? "";

    const toDistill = this.messages.slice(
      0,
      this.messages.length - this.recentWindow,
    );
    const transcript = toDistill
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const subLLMResult = await chat(
      [
        {
          role: "user",
          content: `The user is about to ask: "${question}"

Extract EVERY fact from this conversation that could be relevant to answering that question. Include:
- Direct answers and supporting details
- All specific numbers, IDs, codes, phone numbers, measurements
- Any corrections or updates to previously stated facts (BOTH old and new values)
- Entity attributes, relationships, and current state
- Spatial information, locations, floor plans
- Decisions made and alternatives rejected
- Context that helps interpret the answer

Be exhaustive. Include anything that MIGHT matter — the cost of including extra facts is low, the cost of missing one is total.

Conversation:
${transcript}`,
        },
      ],
      "You are a precise extraction sub-agent. The user has a specific question and you must extract every possibly relevant fact from the conversation. Your output is the ONLY record that will survive. If you miss a detail, it is lost forever.",
    );

    overheadThisStep = subLLMResult.inputTokens + subLLMResult.outputTokens;
    this.totalOverheadTokens += overheadThisStep;

    if (this.enableLogging) {
      this.distillationCount++;
      this.delegationLog.push({
        cycle: this.distillationCount,
        step: this.currentStep,
        content: subLLMResult.content,
        messagesCompressed: toDistill.length,
      });
    }

    const recentMessages = this.messages.slice(-this.recentWindow);
    const startIdx = recentMessages.findIndex((m) => m.role === "user");
    const clean = startIdx > 0 ? recentMessages.slice(startIdx) : recentMessages;

    return {
      messages: clean,
      system: `DISTILLED KNOWLEDGE (extracted from earlier conversation, guided by your current question):\n${subLLMResult.content}`,
      memoryOverheadTokens: overheadThisStep,
    };
  }
}
