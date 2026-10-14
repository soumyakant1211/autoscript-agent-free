import "server-only";
import { completeText, FILES_PER_BATCH, type Msg } from "./ai";
import { SYSTEM_PROMPT, firstMessage, type Stack } from "./prompt";
import { parseFiles } from "./client-utils";
import { validateProject, type ValidationReport } from "./validate";

export type PlannedFile = { path: string; purpose: string; exports?: string };
export type ProjectPlan = { summary: string[]; files: PlannedFile[]; howToRun: string };
export type Emit = (event: "delta" | "status", data: unknown) => void;
type Status = { stage: "planning" | "writing" | "validating" | "fixing" | "done"; done?: number; total?: number; message: string };

const MAX_FILES = 40;
const CONCURRENCY = Number(process.env.GEN_CONCURRENCY || 2);
const FIX_ROUNDS = Number(process.env.GEN_FIX_ROUNDS || 2);

const PLANNER_PROMPT = `You are AutoScript Agent's architect. Design a complete, runnable test automation project.
Respond with ONLY a JSON object (no prose, no markdown fences) of this exact shape:
{
  "summary": ["3-8 short bullets: architecture, key decisions, assumptions"],
  "files": [
    { "path": "relative/path/File.ext", "purpose": "what this file contains", "exports": "class/function/fixture names other files depend on, with key method signatures (or empty)" }
  ],
  "howToRun": "markdown: prerequisites, install, run commands, where reports are, how to run in CI"
}
Rules:
- Include the build/dependency file, README.md and .gitignore, plus config, page objects / helpers, tests, data and CI files the features need.
- Use current stable library versions and modern idioms. Externalize config; no hard-coded secrets.
- Keep it focused: at most ${MAX_FILES} files. List files so that shared/base files come first.
- "exports" is the contract other files will rely on — be specific (e.g. "class LoginPage { open(): Promise<void>; login(user: string, pass: string): Promise<void> }").`;

/** Pull the first JSON object out of a model response (tolerates ```json fences and stray prose). */
export function extractJson<T>(text: string): T | null {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)) as T; } catch { return null; }
}

export function normalisePlan(raw: ProjectPlan | null): ProjectPlan | null {
  if (!raw || !Array.isArray(raw.files) || !raw.files.length) return null;
  const seen = new Set<string>();
  const files = raw.files
    .filter((f) => f && typeof f.path === "string" && f.path.trim())
    .map((f) => ({ path: f.path.trim().replace(/^\.?\//, "").replace(/\\/g, "/"), purpose: String(f.purpose || ""), exports: f.exports ? String(f.exports) : "" }))
    .filter((f) => !f.path.includes("..") && !seen.has(f.path) && seen.add(f.path))
    .slice(0, MAX_FILES);
  if (!files.length) return null;
  return {
    summary: (Array.isArray(raw.summary) ? raw.summary : []).map(String).slice(0, 10),
    files,
    howToRun: String(raw.howToRun || ""),
  };
}

export function batchFiles(files: PlannedFile[], size = FILES_PER_BATCH): PlannedFile[][] {
  const out: PlannedFile[][] = [];
  for (let i = 0; i < files.length; i += size) out.push(files.slice(i, i + size));
  return out;
}

const block = (p: string, c: string) => `<<<FILE: ${p}>>>\n${c}\n<<<END FILE>>>\n`;
const planText = (plan: ProjectPlan) => plan.files.map((f) => `- ${f.path} — ${f.purpose}${f.exports ? `\n    exports: ${f.exports}` : ""}`).join("\n");

/** Run tasks with limited parallelism, calling onDone as each finishes. */
async function pool<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>, onDone: (r: R, i: number) => void) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; onDone(await fn(items[i], i), i); }
  });
  await Promise.all(workers);
}

/** Ask the model to fix the files with errors. Returns the corrected files (only those it returned). */
async function fixFiles(files: Record<string, string>, report: ValidationReport, context: string, signal: AbortSignal) {
  const broken = [...new Set(report.issues.filter((i) => i.severity === "error" && files[i.path] !== undefined).map((i) => i.path))].slice(0, 8);
  const missing = report.issues.filter((i) => i.severity === "error" && files[i.path] === undefined);
  if (!broken.length && !missing.length) return {};
  const problems = report.issues.filter((i) => i.severity === "error").map((i) => `- ${i.path}${i.line ? ` (line ${i.line})` : ""}: ${i.message}`).join("\n");
  const msg: Msg = {
    role: "user",
    content: `${context}\n\nAn automatic syntax check found these problems:\n${problems}\n\n` +
      (broken.length ? `Current contents of the affected files:\n${broken.map((p) => `<<<CURRENT: ${p}>>>\n${files[p]}\n<<<END>>>`).join("\n")}\n\n` : "") +
      `Return ONLY the corrected or missing files, each complete, using the <<<FILE: path>>> ... <<<END FILE>>> format. Do not change anything else.`,
  };
  const { text } = await completeText(SYSTEM_PROMPT, [msg], signal);
  return Object.fromEntries(parseFiles(text).files);
}

function validationMarkdown(r: ValidationReport, fixedRounds: number) {
  const head = r.errors === 0
    ? `## Validation\n- ✅ ${r.checked} files syntax-checked, no errors${fixedRounds ? ` (auto-fixed in ${fixedRounds} round${fixedRounds > 1 ? "s" : ""})` : ""}`
    : `## Validation\n- ⚠️ ${r.errors} problem${r.errors > 1 ? "s" : ""} remain after auto-fix — ask me to fix them in the chat`;
  const lines = r.issues.slice(0, 12).map((i) => `- ${i.severity === "error" ? "❌" : "⚠️"} \`${i.path}\`${i.line ? ` line ${i.line}` : ""}: ${i.message}`);
  const skipped = r.skipped ? [`- ${r.skipped} file${r.skipped > 1 ? "s" : ""} (docs, properties, scripts) not syntax-checked`] : [];
  return [head, ...lines, ...skipped].join("\n") + "\n";
}

/** Validate → auto-fix loop shared by new generations and refinements. Emits corrected file blocks. */
async function validateAndFix(files: Record<string, string>, build: string | undefined, context: string, signal: AbortSignal, emit: Emit) {
  emit("status", { stage: "validating", message: "Checking syntax of every file…" } satisfies Status);
  let report = await validateProject(files, build);
  let rounds = 0;
  while (report.errors > 0 && rounds < FIX_ROUNDS) {
    rounds++;
    emit("status", { stage: "fixing", message: `Fixing ${report.errors} problem${report.errors > 1 ? "s" : ""} (round ${rounds})…` } satisfies Status);
    let fixed: Record<string, string> = {};
    try { fixed = await fixFiles(files, report, context, signal); } catch (e) { if (signal.aborted) throw e; break; }
    if (!Object.keys(fixed).length) break;
    for (const [p, c] of Object.entries(fixed)) { files[p] = c; emit("delta", { text: block(p, c) }); }
    report = await validateProject(files, build);
  }
  return { report, rounds };
}

/**
 * New project: plan → write files in parallel batches → validate → auto-fix.
 * Streams the same <<<FILE>>> text format as before, so the UI and history keep working.
 * Returns null if planning failed (caller falls back to single-shot generation).
 */
export async function generateProject(o: {
  stack: Stack; description: string; features: string[]; appUrl: string; extra: string; signal: AbortSignal; emit: Emit;
}): Promise<{ report: ValidationReport; transcript: string } | null> {
  const { stack, signal, emit } = o;
  const request = firstMessage(o);
  let transcript = "";
  const out = (text: string) => { transcript += text; emit("delta", { text }); };

  emit("status", { stage: "planning", message: "Designing the project structure…" } satisfies Status);
  const planned = await completeText(PLANNER_PROMPT, [{ role: "user", content: request }], signal);
  const plan = normalisePlan(extractJson<ProjectPlan>(planned.text));
  if (!plan) return null;

  out(`## Plan\n${plan.summary.map((s) => `- ${s}`).join("\n")}\n- ${plan.files.length} files, written in parallel and syntax-checked\n\n`);

  const files: Record<string, string> = {};
  const batches = batchFiles(plan.files);
  let done = 0;
  emit("status", { stage: "writing", done, total: plan.files.length, message: `Writing ${plan.files.length} files…` } satisfies Status);

  const writeBatch = async (batch: PlannedFile[]) => {
    const ask = (list: PlannedFile[]) => completeText(SYSTEM_PROMPT, [{
      role: "user",
      content: `${request}\n\nPROJECT PLAN (all files, with the names each file must export):\n${planText(plan)}\n\n` +
        `Write ONLY these files now, complete and runnable, consistent with the plan's exports:\n${list.map((f) => `- ${f.path}`).join("\n")}\n\n` +
        `Output each file with <<<FILE: path>>> ... <<<END FILE>>>. No plan, no explanations, no other files.`,
    }], signal);
    const got = Object.fromEntries(parseFiles((await ask(batch)).text).files);
    const missing = batch.filter((f) => got[f.path] === undefined);
    if (missing.length) Object.assign(got, Object.fromEntries(parseFiles((await ask(missing)).text).files)); // one retry for skipped files
    return got;
  };

  await pool(batches, CONCURRENCY, writeBatch, (got) => {
    for (const [p, c] of Object.entries(got)) {
      if (files[p] === undefined) done++;
      files[p] = c;
      out(block(p, c));
    }
    emit("status", { stage: "writing", done, total: plan.files.length, message: `Wrote ${done} of ${plan.files.length} files` } satisfies Status);
  });

  const stillMissing = plan.files.filter((f) => files[f.path] === undefined);
  const { report, rounds } = await validateAndFix(files, stack.build, `${request}\n\nPROJECT PLAN:\n${planText(plan)}`, signal, (ev, data) => {
    if (ev === "delta") transcript += (data as { text: string }).text;
    emit(ev, data);
  });
  if (stillMissing.length)
    report.issues.unshift(...stillMissing.map((f) => ({ path: f.path, message: "Planned file was not generated", severity: "warning" as const })));

  out(`\n${validationMarkdown(report, rounds)}\n## How to run\n${plan.howToRun}\n`);
  emit("status", { stage: "done", message: "Done" } satisfies Status);
  return { report, transcript };
}

/** After a refinement (or a single-shot generation), validate the changed files and auto-fix them. */
export async function checkAfterRefine(o: {
  allFiles: Record<string, string>; changed: Record<string, string>; stack: Stack; context: string; signal: AbortSignal; emit: Emit;
}) {
  if (!Object.keys(o.changed).length) return null;
  // Only the changed files are validated (the build-file check doesn't apply to a partial change set).
  const { report, rounds } = await validateAndFix({ ...o.changed }, undefined, o.context, o.signal, o.emit);
  o.emit("delta", { text: `\n${validationMarkdown(report, rounds)}` });
  o.emit("status", { stage: "done", message: "Done" } satisfies Status);
  return report;
}
