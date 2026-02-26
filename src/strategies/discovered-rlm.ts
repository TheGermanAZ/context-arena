import type { LLMMessage } from "../utils/llm";
import { chat } from "../utils/llm";
import type { MemoryStrategy } from "./base";
import type { DelegationLogEntry } from "./rlm";

function buildChunkedTranscript(messages: LLMMessage[], targetChunks = 6): string {
  if (messages.length === 0) return "";
  const lines = messages.map((m) => `${m.role}: ${m.content}`);
  const chunkSize = Math.max(1, Math.ceil(lines.length / targetChunks));
  const chunks: string[] = [];

  for (let i = 0; i < lines.length; i += chunkSize) {
    chunks.push(`Chunk ${chunks.length + 1}:\n${lines.slice(i, i + chunkSize).join("\n")}`);
  }

  return chunks.join("\n\n");
}

/**
 * Discovered RLM Strategy (CTX-5)
 *
 * Reverse-engineered from the best patterns found in CTX-4.
 * This encodes the LLM's discovered extraction approach as fixed prompts,
 * giving the same quality as agentic extraction at fixed-strategy cost.
 *
 * CTX-4 pattern encoded here:
 * 1) Chunk-level exhaustive extraction
 * 2) Consolidated knowledge synthesis
 * 3) Verification pass against source transcript
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
      const chunkedTranscript = buildChunkedTranscript(toCompress, 6);

      const existingKnowledge =
        this.delegatedKnowledge.length > 0
          ? `Previously extracted knowledge:\n${this.delegatedKnowledge.join("\n")}\n\n`
          : "";

      // ── Pass 1: Structured extraction ──
      const pass1 = await chat(
        [
          {
            role: "user",
            content: `${existingKnowledge}New conversation segment:\n${transcript}\n\nChunked view for extraction:\n${chunkedTranscript}\n\nApply the CTX-4 extraction pipeline:

1) Sweep each chunk independently and capture every concrete fact.
2) Merge chunk facts into one consolidated knowledge state.

Return ONLY the consolidated state using these exact sections:
IDENTIFIERS:
- IDs, phone numbers, confirmation codes, references (exact string form)

ENTITIES:
- people, places, orgs, products with key attributes/status

QUANTITIES:
- numeric values with the subject and unit/context

DATES:
- dates, times, deadlines, schedule anchors

CORRECTIONS:
- explicit old -> new transitions with both values preserved

STRUCTURAL:
- decisions, relationships, location assignments, and constraints

OPEN_QUESTIONS:
- unresolved asks/blockers from the transcript

NEXT_STEPS:
- concrete follow-up actions or commitments

Rules:
- Keep associations intact (e.g., item + quantity + status should stay linked).
- Never drop identifiers or corrected values.
- Use one bullet per fact in "key: value" form when possible.`,
          },
        ],
        "You perform chunk-first extraction then consolidated synthesis. Be exhaustive, precise, and association-preserving.",
      );

      // ── Pass 2: Verification ──
      const pass2 = await chat(
        [
          {
            role: "user",
            content: `Original transcript:\n${transcript}\n\nChunked transcript:\n${chunkedTranscript}\n\nDraft consolidated state:\n${pass1.content}\n\nAudit the draft against the source transcript.

Checklist:
1) Missing facts: add anything omitted.
2) Incorrect facts: fix any wrong value.
3) Broken associations: repair any split links (subject/value/status/location).
4) Corrections: ensure old and new values are both present.
5) High-risk anchors: verify all identifiers, dates, and quantities are exact.

Output only the FINAL corrected consolidated state with the same section headings as pass 1.`,
          },
        ],
        "You are a strict verification agent. Correct omissions and errors, then return the final state only.",
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
