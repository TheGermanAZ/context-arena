import type { LLMMessage } from "../utils/llm";
import { chat } from "../utils/llm";
import type { MemoryStrategy } from "./base";
import type { DelegationLogEntry } from "./rlm";

interface PinnedEntry {
  key: string;
  value: string;
}

/**
 * Quantity-Pinning Buffer (QPB) Strategy
 *
 * Extends RLM's architecture with a regex-based side-channel that
 * protects quantities and IDs — the single highest-loss fact type
 * (0-33% retention in base RLM).
 *
 * After each RLM delegation cycle, regex-scans the sub-LLM output
 * for quantities/IDs and pins them in a buffer that persists across
 * cycles. The sub-LLM's natural-language blob stays untouched
 * (avoiding CTX-5's format sensitivity trap). The pinned buffer is
 * appended as an addendum, not a replacement.
 *
 * Cost: zero additional LLM calls — just regex after each delegation.
 */
export class QPBStrategy implements MemoryStrategy {
  name = "QPB";
  private messages: LLMMessage[] = [];
  private delegatedKnowledge: string[] = [];
  private pinnedBuffer: Map<string, string> = new Map();
  private delegateEvery: number;
  private recentWindow: number;
  private totalOverheadTokens = 0;
  private messagesSinceDelegation = 0;
  private currentStep = 0;
  private delegationCycle = 0;

  enableLogging = false;
  delegationLog: DelegationLogEntry[] = [];

  constructor(delegateEvery = 8, recentWindow = 4) {
    this.delegateEvery = delegateEvery;
    this.recentWindow = recentWindow;
  }

  reset(): void {
    this.messages = [];
    this.delegatedKnowledge = [];
    this.pinnedBuffer = new Map();
    this.totalOverheadTokens = 0;
    this.messagesSinceDelegation = 0;
    this.currentStep = 0;
    this.delegationCycle = 0;
    this.delegationLog = [];
  }

  /** Expose pinned buffer for testing */
  getPinnedBuffer(): Map<string, string> {
    return this.pinnedBuffer;
  }

  addMessage(message: LLMMessage): void {
    this.messages.push(message);
    this.messagesSinceDelegation++;
    this.currentStep++;
  }

  /**
   * Extract quantities, IDs, phone numbers from text.
   * Returns entries with full-line context as value.
   */
  static extractQuantities(text: string): PinnedEntry[] {
    const entries: PinnedEntry[] = [];
    const lines = text.split("\n");

    const patterns = [
      /\$[\d,]+(?:\.\d{1,2})?/,                                    // dollar amounts
      /\d+\s+(?:units?|people|attendees|developers?|meals?|engineers?|screens?|endpoints?|years?|months?|percent)/i, // counts with units
      /\d{2,3}[-.]?\d{3,4}[-.]?\d{4}/,                            // phone numbers
      /[A-Z]{2,}-\d{3,}/,                                          // IDs/codes (POL-2024, INC-4421)
      /\d+(?:\.\d+)?%/,                                             // percentages
      /\$[\d,]+(?:\.\d{2})?\s*(?:per|\/)\s*\w+/i,                  // rates ($12,400 per month)
    ];

    for (const line of lines) {
      const trimmed = line.replace(/^[-*•]\s+/, "").replace(/^\d+\.\s+/, "").trim();
      if (!trimmed) continue;

      for (const pattern of patterns) {
        if (pattern.test(trimmed)) {
          // Use first 50 chars as key for dedup
          const key = trimmed.slice(0, 50).toLowerCase().trim();
          entries.push({ key, value: trimmed });
          break; // one match per line is enough
        }
      }
    }

    return entries;
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

      // Include pinned buffer in sub-LLM context so it can update values
      const pinnedSection =
        this.pinnedBuffer.size > 0
          ? `\nPINNED QUANTITIES (protected — preserve these exact values unless explicitly corrected):\n${Array.from(this.pinnedBuffer.values()).map((v) => `- ${v}`).join("\n")}\n\n`
          : "";

      // Same RLM prompt — identical to base RLM
      const subLLMResult = await chat(
        [
          {
            role: "user",
            content: `${existingKnowledge}${pinnedSection}New conversation segment:\n${transcript}\n\nYou are a sub-agent processing a conversation segment. Your job is to extract a COMPLETE knowledge state from this conversation. Answer these specific questions:

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

      if (this.enableLogging) {
        this.delegationCycle++;
        this.delegationLog.push({
          cycle: this.delegationCycle,
          step: this.currentStep,
          content: subLLMResult.content,
          messagesCompressed: toDelegate.length,
        });
      }

      // Standard RLM: wholesale replace delegated knowledge
      this.delegatedKnowledge = [subLLMResult.content];

      // QPB addition: regex-scan and pin quantities
      const extracted = QPBStrategy.extractQuantities(subLLMResult.content);
      for (const entry of extracted) {
        // Merge by key similarity
        let found = false;
        for (const existingKey of Array.from(this.pinnedBuffer.keys())) {
          if (
            existingKey.includes(entry.key.slice(0, 25)) ||
            entry.key.includes(existingKey.slice(0, 25))
          ) {
            this.pinnedBuffer.delete(existingKey);
            this.pinnedBuffer.set(entry.key, entry.value);
            found = true;
            break;
          }
        }
        if (!found) {
          this.pinnedBuffer.set(entry.key, entry.value);
        }
      }

      // Also scan the raw transcript for quantities the sub-LLM may have missed
      const rawExtracted = QPBStrategy.extractQuantities(transcript);
      for (const entry of rawExtracted) {
        if (!this.pinnedBuffer.has(entry.key)) {
          let found = false;
          for (const existingKey of Array.from(this.pinnedBuffer.keys())) {
            if (
              existingKey.includes(entry.key.slice(0, 25)) ||
              entry.key.includes(existingKey.slice(0, 25))
            ) {
              found = true;
              break; // already have it, don't overwrite with raw version
            }
          }
          if (!found) {
            this.pinnedBuffer.set(entry.key, entry.value);
          }
        }
      }

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
    if (this.pinnedBuffer.size > 0) {
      systemParts.push(
        `PINNED QUANTITIES (exact values preserved across compression cycles):\n${Array.from(this.pinnedBuffer.values()).map((v) => `- ${v}`).join("\n")}`,
      );
    }

    return {
      messages: clean,
      system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
      memoryOverheadTokens: overheadThisStep,
    };
  }
}
