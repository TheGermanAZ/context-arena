import type { LLMMessage } from "../utils/llm";
import { chat } from "../utils/llm";
import type { MemoryStrategy } from "./base";

/**
 * A single delegation log entry — captures what the sub-LLM produced
 * at a given compression cycle.
 */
export interface DelegationLogEntry {
  cycle: number;
  step: number; // conversation step when delegation happened
  content: string; // the sub-LLM's output
  messagesCompressed: number; // how many messages were sent to sub-LLM
}

/**
 * Recursive Language Model (RLM) strategy.
 *
 * Inspired by Prime Intellect's RLM paper. Instead of compressing old context,
 * the main LLM delegates processing to sub-LLMs. Old messages are sent to a
 * sub-LLM with a targeted query, and only the sub-LLM's distilled answer is
 * kept. The main LLM never sees the raw old history — only sub-LLM outputs.
 *
 * Key difference from summarization:
 * - Summarization says "compress this"
 * - RLM says "answer these specific questions about this"
 *
 * The delegation is task-directed, not generic — which preserves specifics
 * that summaries lose.
 */
export class RLMStrategy implements MemoryStrategy {
  name: string;
  private messages: LLMMessage[] = [];
  private delegatedKnowledge: string[] = [];
  private delegateEvery: number;
  private recentWindow: number;
  private totalOverheadTokens = 0;
  private messagesSinceDelegation = 0;
  private currentStep = 0;
  private delegationCycle = 0;

  /** Opt-in: when true, sub-LLM outputs are captured in delegationLog */
  enableLogging = false;
  delegationLog: DelegationLogEntry[] = [];

  constructor(delegateEvery = 8, recentWindow = 4) {
    this.delegateEvery = delegateEvery;
    this.recentWindow = recentWindow;
    this.name = `RLM(${delegateEvery})`;
  }

  reset(): void {
    this.messages = [];
    this.delegatedKnowledge = [];
    this.totalOverheadTokens = 0;
    this.messagesSinceDelegation = 0;
    this.currentStep = 0;
    this.delegationCycle = 0;
    this.delegationLog = [];
  }

  addMessage(message: LLMMessage): void {
    this.messages.push(message);
    this.messagesSinceDelegation++;
    this.currentStep++;
  }

  async getContext() {
    let overheadThisStep = 0;

    if (
      this.messagesSinceDelegation >= this.delegateEvery &&
      this.messages.length > this.recentWindow
    ) {
      const toDelegate = this.messages.slice(
        0,
        this.messages.length - this.recentWindow,
      );

      const transcript = toDelegate
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      // Build context for the sub-LLM: what do we already know + new messages
      const existingKnowledge =
        this.delegatedKnowledge.length > 0
          ? `Previously extracted knowledge:\n${this.delegatedKnowledge.join("\n")}\n\n`
          : "";

      // The RLM approach: ask the sub-LLM TARGETED questions, not "summarize"
      const subLLMResult = await chat(
        [
          {
            role: "user",
            content: `${existingKnowledge}New conversation segment:\n${transcript}\n\nYou are a sub-agent processing a conversation segment. Your job is to extract a COMPLETE knowledge state from this conversation. Answer these specific questions:

1. ENTITIES: List every person, place, organization, product, or system mentioned with ALL their attributes (names, numbers, roles, relationships).
2. DECISIONS: What decisions were made? What was chosen and what was rejected?
3. CORRECTIONS: Were any previous facts corrected, updated, or changed? List BOTH the old value and the new value explicitly. This is critical — flag every instance where something was changed.
4. NUMBERS: List every specific number, amount, date, time, code, ID, or measurement with its context.
5. CURRENT STATE: What is the current state of affairs as of the end of this segment? Only the latest values.

Be exhaustive. Every specific detail matters. Do NOT generalize.`,
          },
        ],
        "You are a precise sub-agent in a Recursive Language Model system. Your output will be the ONLY record of this conversation segment. If you miss a detail, it is lost forever. Be thorough and exact.",
      );

      overheadThisStep = subLLMResult.inputTokens + subLLMResult.outputTokens;
      this.totalOverheadTokens += overheadThisStep;

      // Capture sub-LLM output for analysis (opt-in)
      if (this.enableLogging) {
        this.delegationCycle++;
        this.delegationLog.push({
          cycle: this.delegationCycle,
          step: this.currentStep,
          content: subLLMResult.content,
          messagesCompressed: toDelegate.length,
        });
      }

      // Replace old delegated knowledge with the new comprehensive state
      this.delegatedKnowledge = [subLLMResult.content];

      // Keep only recent messages
      this.messages = this.messages.slice(-this.recentWindow);
      this.messagesSinceDelegation = 0;
    }

    const messages: LLMMessage[] = [...this.messages];
    const startIdx = messages.findIndex((m) => m.role === "user");
    const clean = startIdx > 0 ? messages.slice(startIdx) : messages;

    const systemParts: string[] = [];
    if (this.delegatedKnowledge.length > 0) {
      systemParts.push(
        `DELEGATED KNOWLEDGE (processed by sub-agent from earlier conversation):\n${this.delegatedKnowledge.join("\n\n")}`,
      );
    }

    return {
      messages: clean,
      system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
      memoryOverheadTokens: overheadThisStep,
    };
  }
}
