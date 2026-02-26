import type { LLMMessage } from "../utils/llm";
import { chat } from "../utils/llm";
import type { MemoryStrategy } from "./base";
import type { DelegationLogEntry } from "./rlm";

/**
 * Discovered RLM Strategy (CTX-5)
 *
 * Reverse-engineered from the best patterns found in CTX-4.
 * This encodes the LLM's discovered extraction approach as fixed prompts,
 * giving the same quality as agentic extraction at fixed-strategy cost.
 *
 * TODO: After CTX-4, replace the extraction prompts below with the
 * actual patterns the LLM discovered.
 */
export class DiscoveredRLMStrategy implements MemoryStrategy {
  name = "DiscoveredRLM";
  private messages: LLMMessage[] = [];
  private delegatedKnowledge: string[] = [];
  private compressEvery: number;
  private recentWindow: number;
  private totalOverheadTokens = 0;
  private messagesSinceCompression = 0;
  private currentStep = 0;
  private delegationCycle = 0;

  enableLogging = false;
  delegationLog: DelegationLogEntry[] = [];

  constructor(compressEvery = 8, recentWindow = 4) {
    this.compressEvery = compressEvery;
    this.recentWindow = recentWindow;
  }

  reset(): void {
    this.messages = [];
    this.delegatedKnowledge = [];
    this.totalOverheadTokens = 0;
    this.messagesSinceCompression = 0;
    this.currentStep = 0;
    this.delegationCycle = 0;
    this.delegationLog = [];
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

      // ── Pass 1: Structured extraction ──
      const pass1 = await chat(
        [
          {
            role: "user",
            content: `${existingKnowledge}New conversation segment:\n${transcript}\n\nExtract ALL information from this conversation into these categories:

IDENTIFIERS: Every ID, phone number, code, reference number, account number (exact format matters)
NUMBERS: Every quantity, price, measurement, count, percentage, with its context
ENTITIES: Every person, place, organization, product with ALL their attributes
DATES/TIMES: Every date, time, deadline, schedule item
CORRECTIONS: Every instance where a previous fact was updated — state BOTH old and new values
DECISIONS: Every decision made, with what was chosen and what was rejected
SPATIAL: Every location, address, region, floor, room assignment

Be exhaustive. Copy exact values — do not paraphrase numbers or IDs.`,
          },
        ],
        "You extract structured facts with perfect precision. Your output is the ONLY record. Miss nothing.",
      );

      // ── Pass 2: Verification ──
      const pass2 = await chat(
        [
          {
            role: "user",
            content: `Original transcript:\n${transcript}\n\nExtracted facts:\n${pass1.content}\n\nVerify the extraction above against the original transcript. For each category:
1. Are there any facts in the transcript that were MISSED in the extraction?
2. Are there any facts that were extracted INCORRECTLY?
3. For corrections/updates: does the extraction have BOTH the old and new values?

Output the FINAL corrected extraction. Include everything from the first pass plus anything that was missed.`,
          },
        ],
        "You are a verification agent. Compare extracted facts against source material. Find what was missed or wrong.",
      );

      overheadThisStep =
        pass1.inputTokens + pass1.outputTokens +
        pass2.inputTokens + pass2.outputTokens;
      this.totalOverheadTokens += overheadThisStep;

      if (this.enableLogging) {
        this.delegationCycle++;
        this.delegationLog.push({
          cycle: this.delegationCycle,
          step: this.currentStep,
          content: pass2.content,
          messagesCompressed: toCompress.length,
        });
      }

      this.delegatedKnowledge = [pass2.content];
      this.messages = this.messages.slice(-this.recentWindow);
      this.messagesSinceCompression = 0;
    }

    const messages: LLMMessage[] = [...this.messages];
    const startIdx = messages.findIndex((m) => m.role === "user");
    const clean = startIdx > 0 ? messages.slice(startIdx) : messages;

    const systemParts: string[] = [];
    if (this.delegatedKnowledge.length > 0) {
      systemParts.push(
        `DELEGATED KNOWLEDGE (extracted and verified from earlier conversation):\n${this.delegatedKnowledge.join("\n\n")}`,
      );
    }

    return {
      messages: clean,
      system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
      memoryOverheadTokens: overheadThisStep,
    };
  }
}
