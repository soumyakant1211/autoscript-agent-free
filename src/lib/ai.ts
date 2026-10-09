import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/** Provider presets. Free: gemini (default), groq, openrouter, ollama. Paid: anthropic. */
const PRESETS = {
  gemini: { keyEnv: "GEMINI_API_KEY", model: "gemini-3.8-flash", maxTokens: 32000, contextChars: 250000, baseURL: "" },
  groq: { keyEnv: "GROQ_API_KEY", model: "openai/gpt-oss-120b", maxTokens: 6000, contextChars: 6000, baseURL: "https://api.groq.com/openai/v1/" },
  openrouter: { keyEnv: "OPENROUTER_API_KEY", model: "", maxTokens: 16000, contextChars: 100000, baseURL: "https://openrouter.ai/api/v1/" },
  ollama: { keyEnv: "", model: "qwen2.5-coder:7b", maxTokens: 8000, contextChars: 40000, baseURL: (process.env.OLLAMA_URL || "http://localhost:11434") + "/v1/" },
  anthropic: { keyEnv: "ANTHROPIC_API_KEY", model: "claude-sonnet-5-5", maxTokens: 16000, contextChars: 250000, baseURL: "" },
} as const;
type Provider = keyof typeof PRESETS;

export const PROVIDER = ((process.env.AI_PROVIDER || "gemini").toLowerCase() as Provider);
const P = PRESETS[PROVIDER] ?? PRESETS.gemini;
export const MODEL = process.env.AI_MODEL || P.model;
const MAX_TOKENS = Number(process.env.MAX_TOKENS || P.maxTokens);
export const CONTEXT_CHARS = Number(process.env.MAX_CONTEXT_CHARS || P.contextChars);
const API_KEY = P.keyEnv ? process.env[P.keyEnv] || "" : "ollama";
export const MOCK = process.env.MOCK_MODE === "1";

export type Msg = { role: "user" | "assistant"; content: string };
type StreamArgs = { system: string; messages: Msg[]; signal: AbortSignal; onText: (t: string) => void };
type StreamResult = { stopReason: "end_turn" | "max_tokens" };

async function readErr(res: Response, name: string) {
  const t = await res.text().catch(() => "");
  let msg = t;
  try { const j = JSON.parse(t); msg = (Array.isArray(j) ? j[0] : j)?.error?.message || t; } catch {}
  if (res.status === 429) msg = `The free AI tier is busy (rate limit). Wait a minute and try again. ${msg}`;
  if (res.status === 401 || res.status === 403) msg = `The AI provider rejected the API key — check ${P.keyEnv}. ${msg}`;
  return new Error(`${name} ${res.status}: ${msg.slice(0, 400)}`);
}

/** Reads an SSE body line by line, passing each JSON `data:` payload to onData. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- provider JSON shapes differ; each caller reads only what it needs
async function readSSE(body: ReadableStream<Uint8Array>, onData: (j: any) => void) {
  const reader = body.getReader(); const dec = new TextDecoder(); let buf = "";
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim(); if (!data || data === "[DONE]") continue;
      try { onData(JSON.parse(data)); } catch {}
    }
  }
}

// Gemini native endpoint — works with the new "AQ." keys (the OpenAI-compatible endpoint rejects them).
async function streamGemini({ system, messages, signal, onText }: StreamArgs): Promise<StreamResult> {
  const base = process.env.GEMINI_NATIVE_URL || "https://generativelanguage.googleapis.com";
  const res = await fetch(`${base}/v1beta/models/${encodeURIComponent(MODEL)}:streamGenerateContent?alt=sse`, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: MAX_TOKENS },
    }),
  });
  if (!res.ok || !res.body) throw await readErr(res, "gemini");
  let stop: StreamResult["stopReason"] = "end_turn";
  await readSSE(res.body, (j) => {
    const c = j.candidates?.[0];
    for (const part of c?.content?.parts || []) if (part.text && !part.thought) onText(part.text);
    if (c?.finishReason === "MAX_TOKENS") stop = "max_tokens";
    if (c?.finishReason === "SAFETY" || c?.finishReason === "RECITATION") onText(`\n\n_(stopped early: ${c.finishReason})_`);
  });
  return { stopReason: stop };
}

async function streamOpenAICompatible({ system, messages, signal, onText }: StreamArgs): Promise<StreamResult> {
  if (!MODEL) throw new Error("AI_MODEL is not set (required for openrouter — pick a model ending in ':free').");
  const res = await fetch(P.baseURL + "chat/completions", {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, stream: true, messages: [{ role: "system", content: system }, ...messages] }),
  });
  if (!res.ok || !res.body) throw await readErr(res, PROVIDER);
  let stop: StreamResult["stopReason"] = "end_turn";
  await readSSE(res.body, (j) => {
    const c = j.choices?.[0];
    if (c?.delta?.content) onText(c.delta.content);
    if (c?.finish_reason === "length") stop = "max_tokens";
  });
  return { stopReason: stop };
}

async function streamAnthropic({ system, messages, signal, onText }: StreamArgs): Promise<StreamResult> {
  const client = new Anthropic({ apiKey: API_KEY });
  const stream = client.messages.stream({ model: MODEL, max_tokens: MAX_TOKENS, system, messages }, { signal });
  stream.on("text", onText);
  const final = await stream.finalMessage();
  return { stopReason: final.stop_reason === "max_tokens" ? "max_tokens" : "end_turn" };
}

async function streamMock({ messages, onText }: StreamArgs): Promise<StreamResult> {
  const last = messages[messages.length - 1]?.content.slice(0, 160) || "";
  const demo = `## Plan\n- Mock response (MOCK_MODE=1) — no AI call made\n- Page Object Model, env-based config\n\n<<<FILE: README.md>>>\n# Demo project\nGenerated in mock mode.\n<<<END FILE>>>\n<<<FILE: tests/example.spec.ts>>>\n// ${last.replace(/\n/g, " ")}\n<<<END FILE>>>\n\n## How to run\n1. Set GEMINI_API_KEY\n2. Unset MOCK_MODE`;
  for (let i = 0; i < demo.length; i += 16) { onText(demo.slice(i, i + 16)); await new Promise((r) => setTimeout(r, 10)); }
  return { stopReason: "end_turn" };
}

export function streamCompletion(args: StreamArgs): Promise<StreamResult> {
  if (MOCK) return streamMock(args);
  if (PROVIDER === "gemini") return streamGemini(args);
  if (PROVIDER === "anthropic") return streamAnthropic(args);
  return streamOpenAICompatible(args);
}
