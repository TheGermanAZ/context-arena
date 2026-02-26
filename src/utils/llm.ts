import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  console.error(
    "\n  Missing OPENAI_API_KEY. Set it before running:\n" +
      "  export OPENAI_API_KEY=sk-...\n",
  );
  process.exit(1);
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 120_000,
});

export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export async function chat(
  messages: LLMMessage[],
  system?: string,
  model = "gpt-5-nano",
  maxTokens = 1024,
): Promise<LLMResponse> {
  const start = performance.now();

  const systemMessages: OpenAI.ChatCompletionMessageParam[] = system
    ? [{ role: "system", content: system }]
    : [];

  const response = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: [
      ...systemMessages,
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ],
  });

  const latencyMs = performance.now() - start;

  const content = response.choices[0]?.message?.content ?? "";

  return {
    content,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    latencyMs,
  };
}

export async function summarize(text: string): Promise<LLMResponse> {
  return chat(
    [
      {
        role: "user",
        content: `Summarize the following conversation history into a concise summary that preserves ALL key facts, numbers, names, decisions, and state changes. Be precise — do not lose any specific details.\n\n${text}`,
      },
    ],
    "You are a precise summarizer. Preserve all specific facts, numbers, names, and state changes. Never generalize away details.",
  );
}

export async function extractFacts(
  messages: LLMMessage[],
): Promise<LLMResponse> {
  const transcript = messages.map((m) => `${m.role}: ${m.content}`).join("\n");

  return chat(
    [
      {
        role: "user",
        content: `Extract all key facts from this conversation as a structured list. Each fact should be a single, atomic statement. Include: names, numbers, preferences, decisions, state changes, relationships, and any corrections/updates to previous facts. If a fact was updated, only include the latest version and note it was updated.\n\n${transcript}`,
      },
    ],
    "You extract structured facts from conversations. Output a numbered list of atomic facts. Be exhaustive and precise.",
  );
}
