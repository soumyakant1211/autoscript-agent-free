import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STACKS = JSON.parse(readFileSync(path.join(__dirname, 'stacks.json'), 'utf8'));
const STACK_INDEX = Object.fromEntries(STACKS.flatMap(g => g.items.map(i => [i.id, { ...i, group: g.group }])));

const PORT = process.env.PORT || 8080;
const APP_PASSWORD = process.env.APP_PASSWORD || ''; // optional: protects your API key on a public URL

// ---- AI provider presets. Free options: gemini (default), groq, openrouter, ollama (local). Paid: anthropic. ----
const PRESETS = {
  gemini:     { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', keyEnv: 'GEMINI_API_KEY', model: 'gemini-3.8-flash', maxTokens: 32000, contextChars: 250000 },
  groq:       { baseURL: 'https://api.groq.com/openai/v1/', keyEnv: 'GROQ_API_KEY', model: 'openai/gpt-oss-120b', maxTokens: 6000, contextChars: 6000 }, // free tier ≈ 8k tokens/min incl. input
  openrouter: { baseURL: 'https://openrouter.ai/api/v1/', keyEnv: 'OPENROUTER_API_KEY', model: '', maxTokens: 16000, contextChars: 100000 },   // set AI_MODEL to any ":free" model
  ollama:     { baseURL: (process.env.OLLAMA_URL || 'http://localhost:11434') + '/v1/', keyEnv: null, model: 'qwen2.5-coder:7b', maxTokens: 8000, contextChars: 40000 },
  anthropic:  { keyEnv: 'ANTHROPIC_API_KEY', model: 'claude-sonnet-5-5', maxTokens: 16000, contextChars: 250000 }
};
const PROVIDER = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
const P = PRESETS[PROVIDER];
if (!P) throw new Error(`Unknown AI_PROVIDER "${PROVIDER}". Use one of: ${Object.keys(PRESETS).join(', ')}`);
const MODEL = process.env.AI_MODEL || P.model;
const MAX_TOKENS = Number(process.env.MAX_TOKENS || P.maxTokens);
const API_KEY = P.keyEnv ? process.env[P.keyEnv] : 'ollama';
if (!API_KEY && process.env.MOCK_MODE !== '1') console.warn(`⚠️  ${P.keyEnv} is not set — generation will fail until it is (or run with MOCK_MODE=1).`);
if (!MODEL) console.warn('⚠️  AI_MODEL is not set — required for openrouter (pick a model ending in ":free").');
const anthropic = PROVIDER === 'anthropic' ? new Anthropic({ apiKey: API_KEY }) : null;

// Gemini native streaming endpoint. Works with both new "AQ." auth keys and older "AIza" keys
// (AQ. keys are rejected by Gemini's OpenAI-compatible endpoint).
async function streamGeminiNative({ system, messages, signal, onText }) {
  const url = `${process.env.GEMINI_NATIVE_URL || 'https://generativelanguage.googleapis.com'}/v1beta/models/${encodeURIComponent(MODEL)}:streamGenerateContent?alt=sse`;
  const res = await fetch(url, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: MAX_TOKENS }
    })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    let msg = t; try { const j = JSON.parse(t); msg = (Array.isArray(j) ? j[0] : j)?.error?.message || t; } catch {}
    if (res.status === 429) msg = `Free-tier rate limit reached (gemini). Wait a minute and try again. Details: ${msg}`;
    if (res.status === 401 || res.status === 403) msg = `Gemini rejected the API key — check GEMINI_API_KEY. Details: ${msg}`;
    throw new Error(`gemini ${res.status}: ${msg.slice(0, 400)}`);
  }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''; let stop = 'end_turn';
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      try {
        const j = JSON.parse(line.slice(5).trim()); const c = j.candidates?.[0];
        for (const part of c?.content?.parts || []) if (part.text && !part.thought) onText(part.text);
        if (c?.finishReason === 'MAX_TOKENS') stop = 'max_tokens';
        if (c?.finishReason === 'SAFETY' || c?.finishReason === 'RECITATION') onText(`\n\n_(Gemini stopped early: ${c.finishReason})_`);
      } catch {}
    }
  }
  return { stop_reason: stop };
}

// Streams text from any provider; calls onText(chunk) and resolves to { stop_reason }.
async function streamCompletion({ system, messages, signal, onText }) {
  if (anthropic) {
    const stream = anthropic.messages.stream({ model: MODEL, max_tokens: MAX_TOKENS, system, messages }, { signal });
    stream.on('text', onText);
    const final = await stream.finalMessage();
    return { stop_reason: final.stop_reason };
  }
  if (PROVIDER === 'gemini') return streamGeminiNative({ system, messages, signal, onText });
  const res = await fetch(P.baseURL + 'chat/completions', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, stream: true, messages: [{ role: 'system', content: system }, ...messages] })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    let msg = t; try { const j = JSON.parse(t); msg = (Array.isArray(j) ? j[0] : j)?.error?.message || t; } catch {}
    if (res.status === 429) msg = `Free-tier rate limit reached (${PROVIDER}). Wait a minute and try again. Details: ${msg}`;
    throw new Error(`${PROVIDER} ${res.status}: ${msg.slice(0, 400)}`);
  }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''; let stop = 'end_turn';
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim(); if (data === '[DONE]') continue;
      try {
        const j = JSON.parse(data); const c = j.choices?.[0];
        if (c?.delta?.content) onText(c.delta.content);
        if (c?.finish_reason === 'length') stop = 'max_tokens';
      } catch {}
    }
  }
  return { stop_reason: stop };
}

const app = express();
app.set('trust proxy', 1); // behind AWS load balancer / App Runner
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://cdnjs.cloudflare.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      connectSrc: ["'self'"],
      imgSrc: ["'self'", 'data:']
    }
  }
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => res.json({ ok: true, provider: PROVIDER, model: MODEL }));
app.get('/api/stacks', (_req, res) => res.json(STACKS));
app.get('/api/config', (_req, res) => res.json({ passwordRequired: Boolean(APP_PASSWORD), provider: PROVIDER, model: process.env.MOCK_MODE === '1' ? 'mock' : MODEL }));

const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: Number(process.env.RATE_LIMIT_PER_HOUR || 30), standardHeaders: 'draft-7', legacyHeaders: false });

function auth(req, res, next) {
  if (!APP_PASSWORD) return next();
  if (req.get('x-app-password') === APP_PASSWORD) return next();
  return res.status(401).json({ error: 'Invalid or missing access password.' });
}

const SYSTEM_PROMPT = `You are AutoScript Agent, a principal SDET who designs production-grade test automation frameworks.

You generate COMPLETE, RUNNABLE projects — never pseudo-code, never "// TODO implement", never "..." placeholders.
Use current stable versions of every library as of 2026 and modern idioms (e.g. Selenium Manager instead of WebDriverManager, Appium 2 options classes, Playwright role-based locators, Cypress cy.session, .NET 8).

OUTPUT FORMAT — follow exactly, the UI parses it:
1. Start with a short "## Plan" section (3-8 bullets: architecture, key decisions, assumptions).
2. Then emit every file using this exact delimiter format, one after another:

<<<FILE: relative/path/to/File.ext>>>
...full file contents...
<<<END FILE>>>

3. After all files, finish with a "## How to run" section: prerequisites, install, run commands, report location, and how to run in CI.

Rules:
- ALWAYS include the build/dependency file (pom.xml, build.gradle.kts, package.json, requirements.txt/pyproject.toml, .csproj) with pinned versions.
- ALWAYS include a README.md and a .gitignore.
- Externalize configuration (URLs, browsers, credentials via env vars) — never hard-code secrets.
- Use explicit waits / auto-waiting; no Thread.sleep / time.sleep / cy.wait(number).
- Apply every feature the user selected; if a feature does not apply to the stack, say so briefly in the Plan.
- For codeless tools (Tosca, Katalon, UFT, TestComplete, Leapwork, ACCELQ) produce the importable/scriptable artifacts the tool supports (e.g. Groovy for Katalon, VBScript for UFT, JS/Python script units for TestComplete) plus a structured step-by-step design document (Markdown) the user can recreate in the tool.
- For performance tools produce realistic load models with thresholds; for OWASP ZAP produce an Automation Framework plan and a Docker-based CI job. Only target applications the user owns or is authorised to test.
- On follow-up messages, return ONLY the files that changed or were added (same delimiter format, full file contents), plus a brief note of what changed.`;

function buildFirstUserMessage({ stack, description, features, appUrl, extra }) {
  return `Generate a test automation framework.

TECH STACK: ${stack.label}  (category: ${stack.group}; test type: ${stack.type}; build tool: ${stack.build})
STACK GUIDANCE: ${stack.hint}

APPLICATION / SCENARIOS TO AUTOMATE:
${description}

${appUrl ? `APPLICATION URL / BASE URI: ${appUrl}\n` : ''}SELECTED FEATURES:
${features.length ? features.map(f => `- ${f}`).join('\n') : '- (none selected — use sensible defaults: POM, config file, reporting, README)'}

${extra ? `ADDITIONAL INSTRUCTIONS:\n${extra}\n` : ''}Generate the complete project now.`;
}

app.post('/api/generate', limiter, auth, async (req, res) => {
  const { stackId, description = '', features = [], appUrl = '', extra = '', history = [], message = '', files = {} } = req.body || {};
  const stack = STACK_INDEX[stackId];
  if (!stack) return res.status(400).json({ error: 'Unknown stack.' });
  if (!history.length && description.trim().length < 10) return res.status(400).json({ error: 'Please describe what to automate (at least a sentence).' });

  // Build conversation: first turn is the structured request; later turns are chat refinements.
  const messages = [];
  if (!history.length) {
    messages.push({ role: 'user', content: buildFirstUserMessage({ stack, description, features, appUrl, extra }) });
  } else {
    for (const m of history.slice(-12)) {
      if ((m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content) messages.push({ role: m.role, content: m.content });
    }
    // Attach current file contents (bounded) so the agent edits the real code, not its memory of it.
    let budget = Number(process.env.MAX_CONTEXT_CHARS || P.contextChars);
    const fileCtx = [];
    for (const [p, c] of Object.entries(files || {})) {
      if (typeof c !== 'string') continue;
      const block = `<<<CURRENT: ${p}>>>\n${c}\n<<<END>>>`;
      if (block.length > budget) { fileCtx.push(`<<<CURRENT: ${p}>>> (omitted — too large)`); continue; }
      budget -= block.length; fileCtx.push(block);
    }
    messages.push({ role: 'user', content: `${message}\n\n(Stack is still ${stack.label}. Return only changed/new files in the <<<FILE>>> format, each in full.)${fileCtx.length ? `\n\nCURRENT PROJECT FILES:\n${fileCtx.join('\n')}` : ''}` });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);

  // MOCK_MODE=1 streams a canned answer — lets you test the UI/deployment without an API key or spend.
  if (process.env.MOCK_MODE === '1') {
    const demo = `## Plan\n- Mock response for **${stack.label}** (MOCK_MODE is on)\n- Page Object Model, config via env vars\n\n<<<FILE: README.md>>>\n# Demo project\nGenerated in mock mode for ${stack.label}.\n<<<END FILE>>>\n<<<FILE: src/test/LoginTest.txt>>>\n// Turn off MOCK_MODE and set GEMINI_API_KEY for real output\n${(message || description).slice(0, 200)}\n<<<END FILE>>>\n\n## How to run\n1. Set \`GEMINI_API_KEY\` (free at aistudio.google.com)\n2. Remove \`MOCK_MODE\``;
    for (let i = 0; i < demo.length; i += 12) { send('delta', { text: demo.slice(i, i + 12) }); await new Promise(r => setTimeout(r, 15)); }
    send('done', { stop_reason: 'end_turn', firstUserMessage: history.length ? null : messages[0].content });
    clearInterval(ping); return res.end();
  }

  const ac = new AbortController();
  let aborted = false;
  res.on('close', () => { if (!res.writableFinished) { aborted = true; ac.abort(); } });

  try {
    const final = await streamCompletion({ system: SYSTEM_PROMPT, messages, signal: ac.signal, onText: (t) => send('delta', { text: t }) });
    send('done', { stop_reason: final.stop_reason, firstUserMessage: history.length ? null : messages[0].content });
  } catch (err) {
    if (!aborted) send('error', { error: err?.error?.error?.message || err.message || 'Generation failed' });
  } finally {
    clearInterval(ping);
    res.end();
  }
});

app.listen(PORT, () => console.log(`AutoScript Agent running on http://localhost:${PORT} (provider: ${PROVIDER}, model: ${MODEL}${process.env.MOCK_MODE === '1' ? ', MOCK_MODE' : ''})`));