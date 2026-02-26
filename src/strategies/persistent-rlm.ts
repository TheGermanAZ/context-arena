import type { LLMMessage } from "../utils/llm";
import { chat } from "../utils/llm";
import type { MemoryStrategy } from "./base";
import type { DelegationLogEntry } from "./rlm";

/**
 * Store entry: a key-value pair extracted from the sub-LLM output.
 * Key is used for deduplication/merge; value is the full content.
 */
interface StoreEntry {
  key: string;
  value: string;
}

/**
 * The 6 typed stores + 1 overflow, each with different merge semantics.
 */
interface TypedStores {
  /** Phone numbers, IDs, codes, reference numbers — keyed by label, exact values */
  identifiers: Map<string, string>;
  /** People, places, orgs, products — keyed by name, attributes as value */
  entities: Map<string, string>;
  /** Dollar amounts, counts, rates, measurements — keyed by context, value as value */
  quantities: Map<string, string>;
  /** Dates, times, deadlines — keyed by context */
  dates: Map<string, string>;
  /** Old→new changes — append-only, never drop corrections */
  corrections: string[];
  /** Decisions, spatial, relationships — keyed by subject */
  structural: Map<string, string>;
  /** Lines the parser couldn't route to a typed store — kept verbatim */
  overflow: string[];
}

/** Canonical section names */
const SECTION_NAMES = [
  "IDENTIFIERS",
  "ENTITIES",
  "QUANTITIES",
  "DATES",
  "CORRECTIONS",
  "STRUCTURAL",
] as const;

type SectionName = (typeof SECTION_NAMES)[number];

/**
 * Map common sub-LLM section header variations to our canonical names.
 * Case-insensitive matching is done in the parser.
 */
const SECTION_ALIASES: Record<string, SectionName> = {
  // Canonical
  "IDENTIFIERS": "IDENTIFIERS",
  "ENTITIES": "ENTITIES",
  "QUANTITIES": "QUANTITIES",
  "DATES": "DATES",
  "CORRECTIONS": "CORRECTIONS",
  "STRUCTURAL": "STRUCTURAL",
  // Common variations
  "NUMBERS": "QUANTITIES",
  "AMOUNTS": "QUANTITIES",
  "MEASUREMENTS": "QUANTITIES",
  "COUNTS": "QUANTITIES",
  "DATES/TIMES": "DATES",
  "DATES AND TIMES": "DATES",
  "TIMES": "DATES",
  "DEADLINES": "DATES",
  "SCHEDULE": "DATES",
  "IDS": "IDENTIFIERS",
  "CODES": "IDENTIFIERS",
  "REFERENCES": "IDENTIFIERS",
  "PHONE NUMBERS": "IDENTIFIERS",
  "PEOPLE": "ENTITIES",
  "ORGANIZATIONS": "ENTITIES",
  "PRODUCTS": "ENTITIES",
  "ITEMS": "ENTITIES",
  "UPDATES": "CORRECTIONS",
  "CHANGES": "CORRECTIONS",
  "REVISIONS": "CORRECTIONS",
  "MODIFIED": "CORRECTIONS",
  "SPATIAL": "STRUCTURAL",
  "LOCATIONS": "STRUCTURAL",
  "RELATIONSHIPS": "STRUCTURAL",
  "DECISIONS": "STRUCTURAL",
  "CURRENT STATE": "STRUCTURAL",
  "STATE": "STRUCTURAL",
  "LAYOUT": "STRUCTURAL",
};

/**
 * Persistent RLM Strategy
 *
 * Combines RLM's targeted extraction (task-directed sub-LLM queries) with
 * Hybrid's incremental persistence (typed stores that survive across cycles).
 *
 * The fix: instead of `this.delegatedKnowledge = [subLLMResult.content]`
 * (wholesale replacement), we parse the sub-LLM output into typed stores
 * and merge incrementally. Facts that the sub-LLM drops in cycle N survive
 * from cycle N-1 because the stores persist.
 *
 * Same single LLM call per cycle as base RLM — zero additional cost.
 */
export class PersistentRLMStrategy implements MemoryStrategy {
  name = "PersistentRLM";
  private messages: LLMMessage[] = [];
  private stores: TypedStores;
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
    this.stores = PersistentRLMStrategy.emptyStores();
  }

  private static emptyStores(): TypedStores {
    return {
      identifiers: new Map(),
      entities: new Map(),
      quantities: new Map(),
      dates: new Map(),
      corrections: [],
      structural: new Map(),
      overflow: [],
    };
  }

  reset(): void {
    this.messages = [];
    this.stores = PersistentRLMStrategy.emptyStores();
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

      // Build existing knowledge from stores for the sub-LLM
      const existingKnowledge = this.serializeStores();
      const existingPrefix = existingKnowledge
        ? `Previously extracted knowledge:\n${existingKnowledge}\n\n`
        : "";

      // Single sub-LLM call — same cost as base RLM
      const subLLMResult = await chat(
        [
          {
            role: "user",
            content: `${existingPrefix}New conversation segment:\n${transcript}\n\nExtract ALL information into these exact sections. Each entry must be on its own line starting with "- ". Use "key: value" format within each entry.

IDENTIFIERS:
Every ID, phone number, code, reference number, account number, policy number. Copy the EXACT format — do not reformat numbers.
Example: - Kenji's phone: 090-8765-4321

ENTITIES:
Every person, place, organization, product with ALL their attributes and current status.
Example: - Sarah Chen: project lead, based in Portland, reports to VP of Engineering

QUANTITIES:
Every quantity, price, measurement, count, percentage with its full context. Include the item name AND any status qualifiers (e.g. clearance, damaged, transferred).
Example: - Widget-A (main inventory): 370 units at $24.99 each
Example: - Gadget-X (clearance): 200 units

DATES:
Every date, time, deadline, schedule item.
Example: - project deadline: March 15, 2026

CORRECTIONS:
Every instance where a previous fact was updated or changed. State BOTH old and new values. This is critical.
Example: - Hotel changed: Marriott → Hilton Garden Inn

STRUCTURAL:
Every spatial relationship, location assignment, decision (what was chosen AND rejected), and relationship between entities.
Example: - Floor 3: conference room, capacity 50, has projector
Example: - Chose React over Vue for frontend (faster team ramp-up)

Be exhaustive. Every specific detail matters. Do NOT generalize or summarize. Include status qualifiers (clearance, damaged, discontinued) alongside quantities.`,
          },
        ],
        "You are a precise sub-agent in a Recursive Language Model system. Output structured facts using the exact section format requested. Your output will be parsed — follow the format exactly. If you miss a detail, it is lost forever.",
      );

      overheadThisStep = subLLMResult.inputTokens + subLLMResult.outputTokens;
      this.totalOverheadTokens += overheadThisStep;

      if (this.enableLogging) {
        this.delegationCycle++;
        this.delegationLog.push({
          cycle: this.delegationCycle,
          step: this.currentStep,
          content: subLLMResult.content,
          messagesCompressed: toCompress.length,
        });
      }

      // Parse and merge — NOT wholesale replace
      const parsed = PersistentRLMStrategy.parseSections(subLLMResult.content);
      this.mergeIntoStores(parsed);

      this.messages = this.messages.slice(-this.recentWindow);
      this.messagesSinceCompression = 0;
    }

    const messages: LLMMessage[] = [...this.messages];
    const startIdx = messages.findIndex((m) => m.role === "user");
    const clean = startIdx > 0 ? messages.slice(startIdx) : messages;

    const system = this.serializeStores();

    return {
      messages: clean,
      system: system
        ? `DELEGATED KNOWLEDGE (extracted from earlier conversation):\n${system}`
        : undefined,
      memoryOverheadTokens: overheadThisStep,
    };
  }

  // ── Parser ──────────────────────────────────────────────────────

  /**
   * Resolve a header string to a canonical section name using aliases.
   * Returns null if no match.
   */
  static resolveSection(header: string): SectionName | null {
    const normalized = header.trim().toUpperCase();
    return SECTION_ALIASES[normalized] ?? null;
  }

  /**
   * Parse sub-LLM output into section buckets.
   *
   * Fixes over v1:
   * - Section aliases: "NUMBERS:", "CURRENT STATE:", etc. map to canonical names
   * - Overflow bucket: lines before any section or under unrecognized headers
   *   are preserved in overflow instead of silently dropped
   * - Multi-line entries: indented continuation lines merge with previous entry
   * - Flexible header matching: handles "**SECTION**:", "## SECTION", markdown variants
   */
  static parseSections(
    output: string,
  ): Record<SectionName | "OVERFLOW", StoreEntry[]> {
    const result: Record<SectionName | "OVERFLOW", StoreEntry[]> = {
      IDENTIFIERS: [],
      ENTITIES: [],
      QUANTITIES: [],
      DATES: [],
      CORRECTIONS: [],
      STRUCTURAL: [],
      OVERFLOW: [],
    };

    let currentSection: SectionName | "OVERFLOW" = "OVERFLOW";
    let lastEntry: StoreEntry | null = null;
    let lastSection: SectionName | "OVERFLOW" | null = null;

    for (const rawLine of output.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;

      // Strip markdown formatting: **SECTION**, ## SECTION, ### SECTION
      const cleaned = line
        .replace(/^\*{1,3}/, "")
        .replace(/\*{1,3}$/, "")
        .replace(/^#{1,4}\s*/, "")
        .trim();

      // Check if this line is a section header (with or without trailing colon)
      const headerMatch = cleaned.match(/^([A-Z][A-Z\s/]+?)\s*:?\s*$/i);
      if (headerMatch) {
        const resolved = PersistentRLMStrategy.resolveSection(headerMatch[1]);
        // Recognized header → switch to that section
        // Unrecognized header → switch to OVERFLOW (don't stay in previous section)
        currentSection = resolved ?? "OVERFLOW";
        lastEntry = null;
        continue;
      }

      // Check for inline header: "SECTION: content..."
      const inlineMatch = cleaned.match(/^([A-Z][A-Z\s/]+?)\s*:\s+(.+)/i);
      if (inlineMatch) {
        const resolved = PersistentRLMStrategy.resolveSection(inlineMatch[1]);
        if (resolved) {
          currentSection = resolved;
          // Process the inline content below
        }
        // Don't switch to OVERFLOW for inline — could be a "key: value" entry
      }

      // Multi-line continuation: if line is indented and we have a previous entry,
      // append to it rather than creating a new entry
      if (rawLine.match(/^\s{2,}/) && lastEntry && lastSection === currentSection) {
        lastEntry.value += " " + line;
        // Update the entry in the result array (it's by reference)
        continue;
      }

      // Strip list prefix ("- ", "* ", "• ", numbered "1. ")
      const content = line
        .replace(/^[-*•]\s+/, "")
        .replace(/^\d+\.\s+/, "");

      // Skip lines that are just the section header repeated
      if (!content) continue;
      const asSection = PersistentRLMStrategy.resolveSection(content.replace(/:$/, ""));
      if (asSection) continue;

      // Parse key: value
      const entry = PersistentRLMStrategy.parseEntry(content);
      result[currentSection].push(entry);
      lastEntry = entry;
      lastSection = currentSection;
    }

    return result;
  }

  /**
   * Parse a single line into a key-value entry.
   * Handles "key: value", "key → value", and bare lines.
   */
  static parseEntry(line: string): StoreEntry {
    // Try "key: value" — require at least 2 non-colon chars before the first colon
    // that is followed by a space (avoids matching times like "3:00")
    const colonMatch = line.match(/^([^:]{2,}):\s+(.+)$/);
    if (colonMatch) {
      return { key: colonMatch[1].trim(), value: line };
    }

    // Try "old → new" for corrections
    const arrowMatch = line.match(/^(.+?)\s*(?:→|->)+\s*(.+)$/);
    if (arrowMatch) {
      return { key: arrowMatch[1].trim(), value: line };
    }

    // Bare line — use first 40 chars as key
    return { key: line.slice(0, 40).trim(), value: line };
  }

  // ── Merge ───────────────────────────────────────────────────────

  /**
   * Merge parsed sections into persistent stores.
   * Each store type has its own merge semantics.
   */
  private mergeIntoStores(
    parsed: Record<SectionName | "OVERFLOW", StoreEntry[]>,
  ): void {
    // Map-based stores: merge by key similarity
    this.mergeMap(this.stores.identifiers, parsed.IDENTIFIERS);
    this.mergeMap(this.stores.entities, parsed.ENTITIES);
    this.mergeMap(this.stores.quantities, parsed.QUANTITIES);
    this.mergeMap(this.stores.dates, parsed.DATES);
    this.mergeMap(this.stores.structural, parsed.STRUCTURAL);

    // Corrections: append-only, deduplicated
    for (const entry of parsed.CORRECTIONS) {
      const isDuplicate = this.stores.corrections.some(
        (existing) =>
          existing.toLowerCase().includes(entry.value.toLowerCase().slice(0, 30)) ||
          entry.value.toLowerCase().includes(existing.toLowerCase().slice(0, 30)),
      );
      if (!isDuplicate) {
        this.stores.corrections.push(entry.value);
      }
    }

    // Overflow: replace entirely each cycle (it's the catch-all for
    // content the parser couldn't route — newer is more relevant)
    if (parsed.OVERFLOW.length > 0) {
      this.stores.overflow = parsed.OVERFLOW.map((e) => e.value);
    }
  }

  /**
   * Merge entries into a Map store using key similarity.
   * If a similar key exists, overwrite the value (newer is more current).
   * Otherwise, add as new entry.
   */
  private mergeMap(store: Map<string, string>, entries: StoreEntry[]): void {
    for (const entry of entries) {
      const entryKeyLower = entry.key.toLowerCase();

      // Look for existing key that overlaps
      let found = false;
      for (const existingKey of Array.from(store.keys())) {
        const existingLower = existingKey.toLowerCase();
        if (
          existingLower.includes(entryKeyLower.slice(0, 25)) ||
          entryKeyLower.includes(existingLower.slice(0, 25))
        ) {
          // Update: delete old key, insert with new key (which may be more descriptive)
          store.delete(existingKey);
          store.set(entry.key, entry.value);
          found = true;
          break;
        }
      }

      if (!found) {
        store.set(entry.key, entry.value);
      }
    }
  }

  // ── Serializer ──────────────────────────────────────────────────

  /**
   * Serialize all stores into a single string for the system prompt.
   * Deterministic ordering: sections always appear in the same order.
   */
  private serializeStores(): string {
    const parts: string[] = [];

    const addSection = (name: string, store: Map<string, string>) => {
      if (store.size > 0) {
        const entries = Array.from(store.values()).map((v) => `- ${v}`).join("\n");
        parts.push(`${name}:\n${entries}`);
      }
    };

    addSection("IDENTIFIERS", this.stores.identifiers);
    addSection("ENTITIES", this.stores.entities);
    addSection("QUANTITIES", this.stores.quantities);
    addSection("DATES", this.stores.dates);

    if (this.stores.corrections.length > 0) {
      const entries = this.stores.corrections.map((c) => `- ${c}`).join("\n");
      parts.push(`CORRECTIONS:\n${entries}`);
    }

    addSection("STRUCTURAL", this.stores.structural);

    if (this.stores.overflow.length > 0) {
      const entries = this.stores.overflow.map((o) => `- ${o}`).join("\n");
      parts.push(`ADDITIONAL CONTEXT:\n${entries}`);
    }

    return parts.join("\n\n");
  }
}
