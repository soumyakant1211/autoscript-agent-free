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
type Preset = (typeof PRESETS)[Provider];

export const PROVIDER = ((process.env.AI_PROVIDER || "gemini").toLowerCase() as Provider);
const P: Preset = PRESETS[PROVIDER] ?? PRESETS.gemini;
export const MODEL = process.env.AI_MODEL || P.model;
const MAX_TOKENS = Number(process.env.MAX_TOKENS || P.maxTokens);
export const CONTEXT_CHARS = Number(process.env.MAX_CONTEXT_CHARS || P.contextChars);
const keyFor = (p: Preset) => (p.keyEnv ? process.env[p.keyEnv] || "" : "ollama");
export const MOCK = process.env.MOCK_MODE === "1";

/**
 * When Gemini is overloaded (503) or rate-limited (429), try these models next, in order.
 * Override with AI_FALLBACK_MODELS="model-a,model-b" (empty string = no fallback models).
 */
const GEMINI_FALLBACKS = (process.env.AI_FALLBACK_MODELS ?? "gemini-3.5-flash-lite,gemini-3.1-flash-lite")
  .split(",").map((s) => s.trim()).filter(Boolean);
/** Last resort when every Gemini model is busy: Groq (free), if GROQ_API_KEY is set. */
const GROQ_FALLBACK = PROVIDER !== "groq" && !!process.env.GROQ_API_KEY && process.env.AI_FALLBACK_GROQ !== "0";

export type Msg = { role: "user" | "assistant"; content: string };
type StreamArgs = { system: string; messages: Msg[]; signal: AbortSignal; onText: (t: string) => void };
type StreamResult = { stopReason: "end_turn" | "max_tokens" };

class AIError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
/** Errors worth retrying or falling back on: overloaded, rate-limited, temporary server errors, network hiccups. */
const isTransient = (e: unknown) =>
  e instanceof AIError ? [429, 500, 502, 503, 504].includes(e.status) : e instanceof TypeError; // fetch network errors are TypeErrors

async function readErr(res: Response, name: string, keyEnv: string) {
  const t = await res.text().catch(() => "");
  let msg = t;
  try { const j = JSON.parse(t); msg = (Array.isArray(j) ? j[0] : j)?.error?.message || t; } catch {}
  if (res.status === 401 || res.status === 403) msg = `The AI provider rejected the API key — check ${keyEnv}. ${msg}`;
  return new AIError(`${name} ${res.status}: ${msg.slice(0, 300)}`, res.status);
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
async function streamGemini(model: string, { system, messages, signal, onText }: StreamArgs): Promise<StreamResult> {
  const base = process.env.GEMINI_NATIVE_URL || "https://generativelanguage.googleapis.com";
  const res = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": keyFor(PRESETS.gemini) },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: MAX_TOKENS },
    }),
  });
  if (!res.ok || !res.body) throw await readErr(res, `gemini (${model})`, "GEMINI_API_KEY");
  let stop: StreamResult["stopReason"] = "end_turn";
  await readSSE(res.body, (j) => {
    const c = j.candidates?.[0];
    for (const part of c?.content?.parts || []) if (part.text && !part.thought) onText(part.text);
    if (c?.finishReason === "MAX_TOKENS") stop = "max_tokens";
    if (c?.finishReason === "SAFETY" || c?.finishReason === "RECITATION") onText(`\n\n_(stopped early: ${c.finishReason})_`);
  });
  return { stopReason: stop };
}

async function streamOpenAICompatible(name: Provider, preset: Preset, model: string, maxTokens: number,
  { system, messages, signal, onText }: StreamArgs): Promise<StreamResult> {
  if (!model) throw new Error("AI_MODEL is not set (required for openrouter — pick a model ending in ':free').");
  const res = await fetch(preset.baseURL + "chat/completions", {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${keyFor(preset)}` },
    body: JSON.stringify({ model, max_tokens: maxTokens, stream: true, messages: [{ role: "system", content: system }, ...messages] }),
  });
  if (!res.ok || !res.body) throw await readErr(res, name, preset.keyEnv);
  let stop: StreamResult["stopReason"] = "end_turn";
  await readSSE(res.body, (j) => {
    const c = j.choices?.[0];
    if (c?.delta?.content) onText(c.delta.content);
    if (c?.finish_reason === "length") stop = "max_tokens";
  });
  return { stopReason: stop };
}

async function streamAnthropic(model: string, { system, messages, signal, onText }: StreamArgs): Promise<StreamResult> {
  const client = new Anthropic({ apiKey: keyFor(PRESETS.anthropic) });
  const stream = client.messages.stream({ model, max_tokens: MAX_TOKENS, system, messages }, { signal });
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

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
});

type Attempt = { label: string; run: (a: StreamArgs) => Promise<StreamResult>; retries: number };

/** The ordered list of things to try: primary model (with retries), fallback models, then Groq. */
function plan(): Attempt[] {
  if (PROVIDER === "gemini") {
    const models = [MODEL, ...GEMINI_FALLBACKS.filter((m) => m !== MODEL)];
    const list: Attempt[] = models.map((m, i) => ({ label: `gemini ${m}`, run: (a) => streamGemini(m, a), retries: i === 0 ? 2 : 1 }));
    if (GROQ_FALLBACK) list.push({ label: "groq fallback", run: (a) => streamOpenAICompatible("groq", PRESETS.groq, PRESETS.groq.model, PRESETS.groq.maxTokens, a), retries: 0 });
    return list;
  }
  if (PROVIDER === "anthropic") return [{ label: "anthropic", run: (a) => streamAnthropic(MODEL, a), retries: 2 }];
  const list: Attempt[] = [{ label: PROVIDER, run: (a) => streamOpenAICompatible(PROVIDER, P, MODEL, MAX_TOKENS, a), retries: 2 }];
  if (GROQ_FALLBACK) list.push({ label: "groq fallback", run: (a) => streamOpenAICompatible("groq", PRESETS.groq, PRESETS.groq.model, PRESETS.groq.maxTokens, a), retries: 0 });
  return list;
}

/**
 * Streams a completion. If the provider is busy (503/429/5xx) BEFORE any text has been sent,
 * it waits and retries, then moves on to fallback models / Groq. Once text is streaming it never
 * switches (that would mix two answers).
 */
export async function streamCompletion(args: StreamArgs): Promise<StreamResult> {
  if (MOCK) return streamMock(args);
  let started = false;
  const wrapped: StreamArgs = { ...args, onText: (t) => { started = true; args.onText(t); } };
  let lastErr: unknown;
  for (const attempt of plan()) {
    for (let i = 0; i <= attempt.retries; i++) {
      try {
        return await attempt.run(wrapped);
      } catch (e) {
        lastErr = e;
        if (started || args.signal.aborted || !isTransient(e)) throw friendly(e);
        console.warn(`[ai] ${attempt.label} attempt ${i + 1} failed: ${(e as Error).message.slice(0, 120)}`);
        if (i < attempt.retries) await sleep(1500 * 2 ** i + Math.random() * 500, args.signal);
      }
    }
  }
  throw friendly(lastErr);
}

function friendly(e: unknown) {
  if (e instanceof AIError && [429, 500, 502, 503, 504].includes(e.status)) {
    return new Error(
      e.status === 429
        ? "The free AI quota is used up for now (rate limit). Please wait a minute and try again — nothing was counted against your limit."
        : "The AI service is overloaded right now (Google reports high demand). Please try again in a minute — nothing was counted against your limit."
    );
  }
  return e instanceof Error ? e : new Error("Generation failed");
}
