import type { LLMMessage } from "../utils/llm";
import { chat } from "../utils/llm";
import type { MemoryStrategy } from "./base";

/**
 * A correction entry: tracks what changed and what it replaced.
 */
interface CorrectionEntry {
  key: string;
  current: string;
  previous: string;
  step: number;
}

/**
 * Correction-Aware Memory Strategy v2 — summary-primary architecture.
 *
 * v1 problem: key-value extraction destroyed structural relationships
 * and produced "TBD" placeholders, causing Multi-hop and Implicit
 * Correction failures.
 *
 * v2 fix: flip the hierarchy.
 *   - PRIMARY memory: detailed narrative summary (preserves relationships
 *     and specific values — the reason Hybrid scores 8/8)
 *   - OVERLAY: correction log (only tracks facts that *changed*, not all
 *     facts — highlights what the model must not regress on)
 *
 * Architecture:
 *   Two tracks run in parallel (Promise.all):
 *   Track 1 (Detailed Summarizer): Produces a thorough narrative that
 *     preserves ALL quantities, relationships, and structure.
 *   Track 2 (Correction Detector): Compares new transcript against
 *     the previous summary to find contradictions/updates.
 *
 * Context injection format:
 *   CONVERSATION SUMMARY: <detailed narrative>
 *
 *   CORRECTION LOG (values that changed — trust these over the summary):
 *   [CORRECTED] budget: $12,000 (was: $8,500)
 *   [CORRECTED] hotel: Aman Tokyo (was: Park Hyatt)
 *   <recent N messages>
 *
 * Key insight: 2 LLM calls instead of 3, less overhead, better fidelity.
 */
export class CorrectionAwareStrategy implements MemoryStrategy {
  name = "CorrectionAware";
  private messages: LLMMessage[] = [];
  private corrections: CorrectionEntry[] = [];
  private narrativeSummary = "";
  private compressEvery: number;
  private recentWindow: number;
  private maxCorrections: number;
  private totalOverheadTokens = 0;
  private messagesSinceCompression = 0;
  private currentStep = 0;

  constructor(compressEvery = 8, recentWindow = 4, maxCorrections = 30) {
    this.compressEvery = compressEvery;
    this.recentWindow = recentWindow;
    this.maxCorrections = maxCorrections;
  }

  reset(): void {
    this.messages = [];
    this.corrections = [];
    this.narrativeSummary = "";
    this.totalOverheadTokens = 0;
    this.messagesSinceCompression = 0;
    this.currentStep = 0;
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

      // Build correction context for the detector
      const existingCorrections =
        this.corrections.length > 0
          ? `Previously detected corrections:\n${this.corrections.map((c) => `${c.key}: ${c.previous} → ${c.current}`).join("\n")}\n\n`
          : "";

      // Run both tracks in parallel
      const [summaryResult, correctionResult] = await Promise.all([
        this.detailedSummarize(transcript),
        this.detectCorrections(transcript, existingCorrections),
      ]);

      overheadThisStep =
        summaryResult.inputTokens +
        summaryResult.outputTokens +
        correctionResult.inputTokens +
        correctionResult.outputTokens;
      this.totalOverheadTokens += overheadThisStep;

      // Update narrative summary (primary memory)
      this.narrativeSummary = summaryResult.content;

      // DEBUG: inspect what the summarizer and detector produce
      if (process.env.DEBUG_STRATEGY) {
        console.log(`\n  [DEBUG] Step ${this.currentStep} compression (${toCompress.length} messages compressed):`);
        console.log(`  [TRANSCRIPT] ${transcript.slice(0, 200)}...`);
        console.log(`  [SUMMARY]\n${summaryResult.content}\n  [/SUMMARY]`);
        console.log(`  [CORRECTIONS]\n${correctionResult.content}\n  [/CORRECTIONS]`);
        console.log(`  [STORE] ${JSON.stringify(this.corrections.map(c => `${c.key}: ${c.current} (was: ${c.previous})`))}`);
      }

      // Parse and accumulate corrections + missing details (overlay)
      const newCorrections = this.parseCorrections(correctionResult.content);
      for (const { key, oldValue, newValue } of newCorrections) {
        if (oldValue.toUpperCase() === "NEW") {
          this.upsertNewDetail(key, newValue);
        } else {
          this.upsertCorrection(key, oldValue, newValue);
        }
      }

      // Trim corrections if over capacity
      if (this.corrections.length > this.maxCorrections) {
        // Keep the most recent corrections
        this.corrections = this.corrections.slice(-this.maxCorrections);
      }

      // Keep only recent messages
      this.messages = this.messages.slice(-this.recentWindow);
      this.messagesSinceCompression = 0;
    }

    // Build context for the main LLM
    const messages: LLMMessage[] = [...this.messages];
    const startIdx = messages.findIndex((m) => m.role === "user");
    const clean = startIdx > 0 ? messages.slice(startIdx) : messages;

    const systemParts: string[] = [];

    // Summary FIRST — it's the primary memory
    if (this.narrativeSummary) {
      systemParts.push(`CONVERSATION SUMMARY:\n${this.narrativeSummary}`);
    }

    // Corrections + critical details SECOND — overlay
    if (this.corrections.length > 0) {
      const correctionLines = this.corrections.map((c) =>
        c.previous
          ? `[CORRECTED] ${c.key}: ${c.current} (was: ${c.previous})`
          : `[DETAIL] ${c.key}: ${c.current}`,
      );
      systemParts.push(
        `CORRECTION LOG (trust these over the summary if they conflict):\n${correctionLines.join("\n")}`,
      );
    }

    return {
      messages: clean,
      system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
      memoryOverheadTokens: overheadThisStep,
    };
  }

  // ── Track 1: Detailed Summarizer (Primary Memory) ──────────

  private detailedSummarize(transcript: string) {
    const input = this.narrativeSummary
      ? `Previous summary:\n${this.narrativeSummary}\n\nNew conversation:\n${transcript}`
      : transcript;

    return chat(
      [
        {
          role: "user",
          content: `Produce a structured reference document from this conversation. This document is the ONLY record — omitted details are lost forever.\n\n${input}`,
        },
      ],
      `You produce structured reference documents from conversations. Format as organized sections with bullet points.

CRITICAL RULES:
- Group related information under topic headings (## People, ## Costs, ## Schedule, etc.)
- Preserve EVERY specific number, phone number, email, date, name, address, and measurement exactly as stated
- Preserve structural relationships (e.g. "Floor 1: Room A (capacity 200), Room B (capacity 50)")
- If the new conversation CONTRADICTS the previous summary, the NEW conversation is always correct — UPDATE the value in your output
- When a value was updated or corrected, output ONLY the final/current value — do NOT keep the old value
- Do NOT use placeholders like "TBD", "various", or "several" — use the exact values stated
- Do NOT summarize lists as counts — list every item
- Do NOT omit contact details, phone numbers, IDs, or reference numbers — these are critical
- Every person mentioned must include ALL their known details (name, location, phone, role, etc.)`,
      undefined, // model
      2048, // higher token limit for detailed summaries
    );
  }

  // ── Track 2: Diff Detector (corrections + missing details) ──

  private detectCorrections(transcript: string, existingCorrections: string) {
    const summaryContext = this.narrativeSummary
      ? `Current conversation summary:\n${this.narrativeSummary}\n\n`
      : "";

    return chat(
      [
        {
          role: "user",
          content: `${summaryContext}${existingCorrections}New conversation segment:\n${transcript}\n\nYou have TWO jobs:

JOB 1 — CORRECTIONS: Find facts that changed from a previous value.
This includes EXPLICIT corrections ("actually", "wait", "change that") AND
IMPLICIT corrections (restating a value that differs from what was said before).
Compare the new conversation against the summary above. If a statement contradicts the summary, that IS a correction.

JOB 2 — MISSING DETAILS: Find specific details in the transcript that are NOT in the summary above.
Focus on: phone numbers, email addresses, exact dollar amounts, dates, addresses, ID numbers, names of people/places.
These are details the summary might have dropped but that matter.

Output format:
For corrections: key: old_value -> new_value
For missing details: key: NEW -> value

If nothing found, output exactly: NO_CORRECTIONS`,
        },
      ],
      "You detect corrections and missing details. Compare the transcript against the summary. Report (1) any fact that changed from a previous value, and (2) any specific detail (phone numbers, dates, amounts, names) in the transcript but missing from the summary. Be thorough but do NOT invent — only report what's actually in the transcript.",
    );
  }

  // ── Correction Store ───────────────────────────────────────

  private upsertCorrection(
    key: string,
    oldValue: string,
    newValue: string,
  ): void {
    const normalizedKey = key.toLowerCase().trim();
    const trimmedNew = newValue.trim();
    const trimmedOld = oldValue.trim();

    // Find existing correction for this key
    const existing = this.corrections.find(
      (c) =>
        c.key === normalizedKey ||
        c.key.includes(normalizedKey) ||
        normalizedKey.includes(c.key),
    );

    if (existing) {
      // Update: keep the original "previous" if the key already exists,
      // unless the old value from this detection is different from current
      if (existing.current.toLowerCase() !== trimmedNew.toLowerCase()) {
        existing.previous = existing.current;
        existing.current = trimmedNew;
        existing.step = this.currentStep;
      }
    } else {
      this.corrections.push({
        key: normalizedKey,
        current: trimmedNew,
        previous: trimmedOld,
        step: this.currentStep,
      });
    }
  }

  // ── Parser ─────────────────────────────────────────────────

  private parseCorrections(
    output: string,
  ): Array<{ key: string; oldValue: string; newValue: string }> {
    if (output.includes("NO_CORRECTIONS")) return [];

    const results: Array<{
      key: string;
      oldValue: string;
      newValue: string;
    }> = [];
    for (const line of output.split("\n")) {
      const match = line.match(
        /^([a-z_][a-z0-9_]*)\s*:\s*(.+?)\s*->\s*(.+)$/i,
      );
      if (match) {
        results.push({
          key: match[1]!.trim(),
          oldValue: match[2]!.trim(),
          newValue: match[3]!.trim(),
        });
      }
    }
    return results;
  }

  /** Handle "NEW -> value" entries: store them as corrections with empty previous */
  private upsertNewDetail(key: string, value: string): void {
    const normalizedKey = key.toLowerCase().trim();
    const existing = this.corrections.find(
      (c) =>
        c.key === normalizedKey ||
        c.key.includes(normalizedKey) ||
        normalizedKey.includes(c.key),
    );
    if (!existing) {
      this.corrections.push({
        key: normalizedKey,
        current: value.trim(),
        previous: "",
        step: this.currentStep,
      });
    }
  }
}
