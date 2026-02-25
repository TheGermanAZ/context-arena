import type { LLMMessage } from "../utils/llm";
import { chat } from "../utils/llm";
import type { MemoryStrategy } from "./base";
import type { DelegationLogEntry } from "./rlm";

const SUB_LLM_PROMPT = `You are a sub-agent processing a conversation segment. Your job is to extract a COMPLETE knowledge state from this conversation. Answer these specific questions:

1. ENTITIES: List every person, place, organization, product, or system mentioned with ALL their attributes (names, numbers, roles, relationships).
2. DECISIONS: What decisions were made? What was chosen and what was rejected?
3. CORRECTIONS: Were any previous facts corrected, updated, or changed? List BOTH the old value and the new value explicitly. This is critical — flag every instance where something was changed.
4. NUMBERS: List every specific number, amount, date, time, code, ID, or measurement with its context.
5. CURRENT STATE: What is the current state of affairs as of the end of this segment? Only the latest values.

Be exhaustive. Every specific detail matters. Do NOT generalize.`;

const SUB_LLM_SYSTEM =
  "You are a precise sub-agent in a Recursive Language Model system. Your output will be the ONLY record of this conversation segment. If you miss a detail, it is lost forever. Be thorough and exact.";

/**
 * Deep RLM strategy — chains N sub-LLM calls per compression cycle.
 *
 * At depth 1, behavior is identical to the standard RLM strategy.
 * At depth N, each compression triggers a chain:
 *   Pass 1: sub-LLM processes (existing knowledge + transcript) → output₁
 *   Pass 2: sub-LLM re-processes output₁ → output₂
 *   ...
 *   Pass N: sub-LLM re-processes outputₙ₋₁ → outputₙ
 *
 * This isolates compounding information loss across delegation layers.
 */
export class DeepRLMStrategy implements MemoryStrategy {
  name: string;
  private messages: LLMMessage[] = [];
  private delegatedKnowledge: string[] = [];
  private delegateEvery: number;
  private recentWindow: number;
  private depth: number;
  private totalOverheadTokens = 0;
  private messagesSinceDelegation = 0;
  private currentStep = 0;
  private delegationCycle = 0;

  /** Opt-in: when true, sub-LLM outputs are captured in delegationLog */
  enableLogging = false;
  delegationLog: DelegationLogEntry[] = [];

  constructor(depth = 1, delegateEvery = 8, recentWindow = 4) {
    this.depth = depth;
    this.delegateEvery = delegateEvery;
    this.recentWindow = recentWindow;
    this.name = `DeepRLM(d=${depth})`;
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

      const existingKnowledge =
        this.delegatedKnowledge.length > 0
          ? `Previously extracted knowledge:\n${this.delegatedKnowledge.join("\n")}\n\n`
          : "";

      // Pass 1: process transcript (same as standard RLM)
      let currentOutput = await chat(
        [
          {
            role: "user",
            content: `${existingKnowledge}New conversation segment:\n${transcript}\n\n${SUB_LLM_PROMPT}`,
          },
        ],
        SUB_LLM_SYSTEM,
      );

      overheadThisStep += currentOutput.inputTokens + currentOutput.outputTokens;

      // Passes 2..N: re-process previous output
      for (let d = 2; d <= this.depth; d++) {
        const reprocessed = await chat(
          [
            {
              role: "user",
              content: `The following is a knowledge extraction from a conversation. Re-extract and consolidate the complete knowledge state.\n\n${currentOutput.content}\n\n${SUB_LLM_PROMPT}`,
            },
          ],
          SUB_LLM_SYSTEM,
        );

        overheadThisStep += reprocessed.inputTokens + reprocessed.outputTokens;
        currentOutput = reprocessed;
      }

      this.totalOverheadTokens += overheadThisStep;

      // Log the final output of the chain
      if (this.enableLogging) {
        this.delegationCycle++;
        this.delegationLog.push({
          cycle: this.delegationCycle,
          step: this.currentStep,
          content: currentOutput.content,
          messagesCompressed: toDelegate.length,
        });
      }

      this.delegatedKnowledge = [currentOutput.content];
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
