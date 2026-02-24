import type { LLMMessage } from "../utils/llm";
import { chat, summarize } from "../utils/llm";
import type { MemoryStrategy } from "./base";

/**
 * A single fact in the versioned store.
 * The key is the topic (e.g. "hotel_name", "budget").
 * Tracks version history so corrections are explicit, not silent overwrites.
 */
interface FactEntry {
  key: string;
  current: string;
  version: number;
  corrected: boolean; // was this ever explicitly corrected?
  history: Array<{ value: string; step: number }>;
}

/**
 * Correction-Aware Memory Strategy (A+C mix).
 *
 * Architecture:
 *   Two extraction tracks populate a single versioned store.
 *
 *   Track 1 (Fact Extractor):  Extracts {key, value} pairs from conversation.
 *   Track 2 (Correction Detector): Scans for explicit corrections {key, old, new}.
 *     Correction detector has VETO POWER — it force-updates the store.
 *
 *   Both tracks run in parallel (Promise.all).
 *   A rolling narrative summary supplements the facts for context.
 *
 * Context injection format:
 *   [CORRECTED] hotel_name: Aman Tokyo (was: Park Hyatt)
 *   budget: $8,500
 *   ...
 *   CONVERSATION SUMMARY: <rolling narrative>
 *   <recent N messages>
 */
export class CorrectionAwareStrategy implements MemoryStrategy {
  name = "CorrectionAware";
  private messages: LLMMessage[] = [];
  private store: Map<string, FactEntry> = new Map();
  private narrativeSummary = "";
  private compressEvery: number;
  private recentWindow: number;
  private maxFacts: number;
  private totalOverheadTokens = 0;
  private messagesSinceCompression = 0;
  private currentStep = 0;

  constructor(compressEvery = 8, recentWindow = 4, maxFacts = 60) {
    this.compressEvery = compressEvery;
    this.recentWindow = recentWindow;
    this.maxFacts = maxFacts;
  }

  reset(): void {
    this.messages = [];
    this.store = new Map();
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

      // Build existing facts context for the extractors
      const existingFacts =
        this.store.size > 0
          ? `Currently known facts:\n${[...this.store.values()].map((f) => `${f.key}: ${f.current}`).join("\n")}\n\n`
          : "";

      // Run all three tracks in parallel
      const [factResult, correctionResult, summaryResult] = await Promise.all([
        this.extractFacts(transcript, existingFacts),
        this.detectCorrections(transcript, existingFacts),
        summarize(
          (this.narrativeSummary
            ? `Previous summary:\n${this.narrativeSummary}\n\nNew messages:\n`
            : "") + transcript,
        ),
      ]);

      overheadThisStep =
        factResult.inputTokens +
        factResult.outputTokens +
        correctionResult.inputTokens +
        correctionResult.outputTokens +
        summaryResult.inputTokens +
        summaryResult.outputTokens;
      this.totalOverheadTokens += overheadThisStep;

      // Step 1: Apply Track 1 (facts) — inserts and updates
      const facts = this.parseFacts(factResult.content);
      for (const { key, value } of facts) {
        this.upsertFact(key, value, false);
      }

      // Step 2: Apply Track 2 (corrections) — veto pass
      const corrections = this.parseCorrections(correctionResult.content);
      for (const { key, newValue } of corrections) {
        this.upsertFact(key, newValue, true);
      }

      // Step 3: Update narrative summary
      this.narrativeSummary = summaryResult.content;

      // Step 4: Trim if over capacity
      this.trimStore();

      // Keep only recent messages
      this.messages = this.messages.slice(-this.recentWindow);
      this.messagesSinceCompression = 0;
    }

    // Build context for the main LLM
    const messages: LLMMessage[] = [...this.messages];
    const startIdx = messages.findIndex((m) => m.role === "user");
    const clean = startIdx > 0 ? messages.slice(startIdx) : messages;

    const systemParts: string[] = [];

    if (this.store.size > 0) {
      const factLines = [...this.store.values()]
        .sort((a, b) => {
          // Corrected facts first (higher signal), then by version desc
          if (a.corrected !== b.corrected) return a.corrected ? -1 : 1;
          return b.version - a.version;
        })
        .map((f) => {
          if (f.corrected && f.history.length > 0) {
            const prev = f.history[f.history.length - 1]!.value;
            return `[CORRECTED] ${f.key}: ${f.current} (was: ${prev})`;
          }
          return `${f.key}: ${f.current}`;
        });
      systemParts.push(`KNOWN FACTS:\n${factLines.join("\n")}`);
    }

    if (this.narrativeSummary) {
      systemParts.push(`CONVERSATION SUMMARY:\n${this.narrativeSummary}`);
    }

    return {
      messages: clean,
      system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
      memoryOverheadTokens: overheadThisStep,
    };
  }

  // ── Track 1: Fact Extractor ──────────────────────────────────

  private extractFacts(transcript: string, existingFacts: string) {
    return chat(
      [
        {
          role: "user",
          content: `${existingFacts}New conversation segment:\n${transcript}\n\nExtract every discrete fact from this conversation as key-value pairs.
Use consistent, descriptive keys in snake_case.
Group related facts under a common prefix (e.g. hotel_name, hotel_rate, hotel_total).

Output format (one per line):
key: value

If a fact was updated during this segment, output ONLY the latest value.
Do NOT include opinions, chit-chat, or hypotheticals — only stated facts.`,
        },
      ],
      "You extract structured key-value facts from conversations. Output one fact per line in the format 'key: value'. Be exhaustive and precise. Every specific detail matters.",
    );
  }

  // ── Track 2: Correction Detector ─────────────────────────────

  private detectCorrections(transcript: string, existingFacts: string) {
    return chat(
      [
        {
          role: "user",
          content: `${existingFacts}New conversation segment:\n${transcript}\n\nYour ONLY job is to find corrections, updates, and changes in this conversation.
A correction is when a previously stated fact is changed to a new value.
This includes EXPLICIT corrections ("actually", "wait", "change that") AND
IMPLICIT corrections (simply restating a value that differs from what was said before).

Compare the new conversation against the currently known facts above.
If a new statement contradicts a known fact, that IS a correction.

Output format (one per line):
key: old_value -> new_value

If nothing was corrected, output exactly: NO_CORRECTIONS`,
        },
      ],
      "You are a correction detector. Your ONLY job is finding where facts changed. Compare new statements against known facts. Report every discrepancy. Do NOT invent corrections — only report actual changes. Be thorough: implicit corrections (restating a different value without saying 'actually') count too.",
    );
  }

  // ── Store Operations ─────────────────────────────────────────

  private upsertFact(key: string, value: string, isCorrection: boolean): void {
    const normalizedKey = key.toLowerCase().trim();
    const trimmedValue = value.trim();

    // Try to find existing entry by exact key match first
    let existing = this.store.get(normalizedKey);

    // If no exact match, try fuzzy key matching (e.g. "hotel" matches "hotel_name")
    if (!existing) {
      for (const [k, v] of this.store) {
        if (
          k.includes(normalizedKey) ||
          normalizedKey.includes(k) ||
          this.keysSimilar(k, normalizedKey)
        ) {
          existing = v;
          // Use the more specific key
          if (normalizedKey.length > k.length) {
            this.store.delete(k);
            existing.key = normalizedKey;
          }
          break;
        }
      }
    }

    if (existing) {
      // Key exists — check if value actually changed
      if (existing.current.toLowerCase() === trimmedValue.toLowerCase()) {
        return; // Same value, skip
      }
      // Value changed — push old to history, update current
      existing.history.push({
        value: existing.current,
        step: this.currentStep,
      });
      existing.current = trimmedValue;
      existing.version++;
      if (isCorrection) existing.corrected = true;
      this.store.set(existing.key, existing);
    } else {
      // New fact
      this.store.set(normalizedKey, {
        key: normalizedKey,
        current: trimmedValue,
        version: 1,
        corrected: isCorrection,
        history: [],
      });
    }
  }

  private keysSimilar(a: string, b: string): boolean {
    // Check if keys share a meaningful prefix (at least 5 chars)
    const minLen = Math.min(a.length, b.length);
    if (minLen < 5) return false;
    let shared = 0;
    for (let i = 0; i < minLen; i++) {
      if (a[i] === b[i]) shared++;
      else break;
    }
    return shared >= 5;
  }

  private trimStore(): void {
    if (this.store.size <= this.maxFacts) return;

    // Sort entries: corrected facts are protected, then by version (lower = less important)
    const entries = [...this.store.entries()].sort(([, a], [, b]) => {
      // Corrected facts always survive
      if (a.corrected !== b.corrected) return a.corrected ? 1 : -1;
      // Higher version = more important (updated more often)
      return a.version - b.version;
    });

    // Remove lowest-priority entries until under limit
    while (entries.length > this.maxFacts) {
      const [key] = entries.shift()!;
      this.store.delete(key);
    }
  }

  // ── Parsers ──────────────────────────────────────────────────

  private parseFacts(output: string): Array<{ key: string; value: string }> {
    const results: Array<{ key: string; value: string }> = [];
    for (const line of output.split("\n")) {
      // Match "key: value" but not "key: old -> new" (that's corrections format)
      const match = line.match(/^([a-z_][a-z0-9_]*)\s*:\s*(.+)$/i);
      if (match && !match[2]!.includes("->")) {
        results.push({ key: match[1]!.trim(), value: match[2]!.trim() });
      }
    }
    return results;
  }

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
}
