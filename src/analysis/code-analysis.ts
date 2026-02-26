/**
 * Code Analysis — What Did the LLM Discover? (CTX-4)
 *
 * Analyzes the JavaScript code the LLM wrote during CTX-3 to determine
 * whether it discovered type-specific extraction strategies.
 *
 * Zero API calls — pure offline analysis of code logs.
 *
 * Usage: bun src/analysis/code-analysis.ts <path-to-code-logs.json>
 */

// ── Types ──────────────────────────────────────────────────────────

type StrategyCategory =
  | "flat_extraction"       // Single prompt, no structure
  | "type_specific"         // Separate handling for numbers, names, IDs
  | "multi_pass"            // Extract → verify → refine
  | "chunking"              // Split text, parallel sub-queries, merge
  | "regex_augmented"       // Code-level pattern matching before LLM queries
  | "hybrid"                // Combines multiple approaches
  | "unknown";

interface CodeLogEntry {
  scenario: string;
  cycle: number;
  iteration: number;
  code: string;
  timestamp: number;
}

interface ClassifiedSnippet {
  scenario: string;
  cycle: number;
  iteration: number;
  categories: StrategyCategory[];
  hasSubLLMCalls: boolean;
  hasRegex: boolean;
  hasChunking: boolean;
  hasLooping: boolean;
  codeLength: number;
  code: string;
}

interface ScenarioSummary {
  scenario: string;
  totalSnippets: number;
  dominantCategory: StrategyCategory;
  categoryCounts: Record<StrategyCategory, number>;
  avgCodeLength: number;
  usesSubLLM: boolean;
  usesRegex: boolean;
  usesChunking: boolean;
}

// ── Classification ─────────────────────────────────────────────────

function classifySnippet(entry: CodeLogEntry): ClassifiedSnippet {
  const code = entry.code;
  const lower = code.toLowerCase();

  const hasSubLLMCalls = /llm_query\s*\(/.test(code) || /llm_query_batched\s*\(/.test(code);
  const hasRegex = /new RegExp|\/.*\/[gimsu]|\.match\(|\.replace\(|\.search\(|\.test\(/.test(code);
  const hasChunking = /chunk|split|slice|substring|\.slice\(/.test(lower) && /for|while|map|forEach/.test(code);
  const hasLooping = /for\s*\(|while\s*\(|\.map\(|\.forEach\(|\.reduce\(/.test(code);

  const categories: StrategyCategory[] = [];

  // Check for type-specific extraction (mentions categories of facts)
  const typeSpecificPatterns = [
    /number|quantit|amount|price|cost/i,
    /name|person|entity|people/i,
    /id\b|identifier|phone|code/i,
    /date|time|deadline|schedule/i,
    /correct|update|change|revis/i,
  ];
  const typeSpecificHits = typeSpecificPatterns.filter((p) => p.test(code)).length;
  if (typeSpecificHits >= 2 && hasSubLLMCalls) {
    categories.push("type_specific");
  }

  // Multi-pass: multiple sequential llm_query calls
  const llmCallCount = (code.match(/llm_query\s*\(/g) || []).length +
    (code.match(/llm_query_batched\s*\(/g) || []).length;
  if (llmCallCount >= 2 && /await/.test(code)) {
    categories.push("multi_pass");
  }

  // Chunking-based: splits text then processes chunks
  if (hasChunking && (hasSubLLMCalls || /llm_query_batched/.test(code))) {
    categories.push("chunking");
  }

  // Regex-augmented: uses regex to find patterns before/alongside LLM
  if (hasRegex) {
    categories.push("regex_augmented");
  }

  // If no specific pattern detected, it's flat extraction
  if (categories.length === 0) {
    if (hasSubLLMCalls) {
      categories.push("flat_extraction");
    } else {
      categories.push("unknown");
    }
  }

  // If multiple patterns, also mark as hybrid
  if (categories.length >= 2) {
    categories.push("hybrid");
  }

  return {
    scenario: entry.scenario,
    cycle: entry.cycle,
    iteration: entry.iteration,
    categories,
    hasSubLLMCalls,
    hasRegex,
    hasChunking,
    hasLooping,
    codeLength: code.length,
    code,
  };
}

// ── Summarize per scenario ─────────────────────────────────────────

function summarizeByScenario(snippets: ClassifiedSnippet[]): ScenarioSummary[] {
  const byScenario = new Map<string, ClassifiedSnippet[]>();
  for (const s of snippets) {
    const arr = byScenario.get(s.scenario) || [];
    arr.push(s);
    byScenario.set(s.scenario, arr);
  }

  return Array.from(byScenario.entries()).map(([scenario, snips]) => {
    const categoryCounts: Record<StrategyCategory, number> = {
      flat_extraction: 0,
      type_specific: 0,
      multi_pass: 0,
      chunking: 0,
      regex_augmented: 0,
      hybrid: 0,
      unknown: 0,
    };

    for (const s of snips) {
      for (const cat of s.categories) {
        categoryCounts[cat]++;
      }
    }

    const dominant = (Object.entries(categoryCounts) as [StrategyCategory, number][])
      .filter(([cat]) => cat !== "hybrid" && cat !== "unknown")
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

    return {
      scenario,
      totalSnippets: snips.length,
      dominantCategory: dominant,
      categoryCounts,
      avgCodeLength: snips.reduce((s, x) => s + x.codeLength, 0) / snips.length,
      usesSubLLM: snips.some((s) => s.hasSubLLMCalls),
      usesRegex: snips.some((s) => s.hasRegex),
      usesChunking: snips.some((s) => s.hasChunking),
    };
  });
}

// ── Report ─────────────────────────────────────────────────────────

function printReport(
  snippets: ClassifiedSnippet[],
  summaries: ScenarioSummary[],
): void {
  console.log("\n" + "═".repeat(70));
  console.log("  CTX-4: CODE ANALYSIS — WHAT DID THE LLM DISCOVER?");
  console.log("═".repeat(70));

  // 1. Overall strategy distribution
  console.log("\n── Strategy Distribution (all scenarios) ──\n");
  const globalCounts: Record<StrategyCategory, number> = {
    flat_extraction: 0, type_specific: 0, multi_pass: 0,
    chunking: 0, regex_augmented: 0, hybrid: 0, unknown: 0,
  };
  for (const s of snippets) {
    for (const cat of s.categories) {
      globalCounts[cat]++;
    }
  }
  const total = snippets.length;
  for (const [cat, count] of Object.entries(globalCounts).sort((a, b) => b[1] - a[1])) {
    if (count === 0) continue;
    const pct = ((count / total) * 100).toFixed(0);
    const bar = "█".repeat(Math.round((count / total) * 30)).padEnd(30, "░");
    console.log(`  ${cat.padEnd(20)} ${bar} ${pct.padStart(3)}% (${count}/${total})`);
  }

  // 2. Per-scenario breakdown
  console.log("\n── Per-Scenario Strategy ──\n");
  console.log(
    "  " +
    "Scenario".padEnd(28) +
    "Dominant".padEnd(20) +
    "Snippets".padStart(8) +
    "SubLLM".padStart(8) +
    "Regex".padStart(8) +
    "Chunk".padStart(8),
  );
  console.log("  " + "─".repeat(80));
  for (const s of summaries) {
    console.log(
      "  " +
      s.scenario.padEnd(28) +
      s.dominantCategory.padEnd(20) +
      String(s.totalSnippets).padStart(8) +
      (s.usesSubLLM ? "  yes" : "  no").padStart(8) +
      (s.usesRegex ? "  yes" : "  no").padStart(8) +
      (s.usesChunking ? "  yes" : "  no").padStart(8),
    );
  }

  // 3. Does the LLM adapt per scenario?
  const uniqueStrategies = new Set(summaries.map((s) => s.dominantCategory));
  console.log("\n── Key Finding ──\n");
  if (uniqueStrategies.size >= 3) {
    console.log("  FINDING: LLM ADAPTS strategy per scenario (" + uniqueStrategies.size + " distinct strategies)");
    console.log("  This suggests the LLM is discovering context-dependent extraction.");
  } else if (uniqueStrategies.size === 2) {
    console.log("  FINDING: LLM shows PARTIAL adaptation (" + uniqueStrategies.size + " distinct strategies)");
  } else {
    console.log("  FINDING: LLM CONVERGES on one strategy: " + [...uniqueStrategies][0]);
    console.log("  This validates hand-designed approaches — the LLM defaults to generic patterns.");
  }

  // 4. Did it address CTX-1's 0% categories?
  const hasTypeSpecific = snippets.some((s) => s.categories.includes("type_specific"));
  const hasRegexForIDs = snippets.some(
    (s) => s.hasRegex && /phone|id\b|code|number/i.test(s.code),
  );
  console.log("\n── CTX-1 Gap Analysis ──\n");
  console.log(`  phone/ID (0% in CTX-1): ${hasRegexForIDs ? "LLM added regex extraction ✓" : "NOT addressed ✗"}`);
  console.log(`  spatial (0% in CTX-1):   ${hasTypeSpecific ? "Type-specific extraction present ?" : "NOT addressed ✗"}`);
  console.log(`  Type-specific overall:   ${hasTypeSpecific ? "DISCOVERED ✓" : "NOT discovered ✗"}`);

  console.log("\n" + "═".repeat(70));
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const codeLogsPath = process.argv[2];
  if (!codeLogsPath) {
    console.error("Usage: bun src/analysis/code-analysis.ts <path-to-code-logs.json>");
    console.error("  e.g.: bun src/analysis/code-analysis.ts results/rllm-code-logs-12345.json");
    process.exit(1);
  }

  const file = Bun.file(codeLogsPath);
  if (!(await file.exists())) {
    console.error(`File not found: ${codeLogsPath}`);
    process.exit(1);
  }

  const codeLogs: CodeLogEntry[] = await file.json();
  console.log(`Loaded ${codeLogs.length} code blocks from ${codeLogsPath}`);

  const classified = codeLogs.map(classifySnippet);
  const summaries = summarizeByScenario(classified);

  printReport(classified, summaries);

  // Save classified data
  const outputPath = `results/code-analysis-${Date.now()}.json`;
  await Bun.write(
    outputPath,
    JSON.stringify({ classified, summaries }, null, 2),
  );
  console.log(`\nClassified data saved to ${outputPath}`);
}

main().catch(console.error);
