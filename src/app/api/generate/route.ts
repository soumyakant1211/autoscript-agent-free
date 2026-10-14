import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { usageEvent } from "@/db/schema";
import { CONTEXT_CHARS, streamCompletion, type Msg } from "@/lib/ai";
import { checkAfterRefine, generateProject } from "@/lib/pipeline";
import { parseFiles } from "@/lib/client-utils";
import type { ValidationReport } from "@/lib/validate";
import { STACK_INDEX, SYSTEM_PROMPT, firstMessage } from "@/lib/prompt";
import { LIMITS, getViewer, ipHash, quotaStatus, refinesUsed } from "@/lib/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = {
  projectId?: string; stackId?: string; description?: string; features?: string[]; appUrl?: string; extra?: string;
  history?: Msg[]; message?: string; files?: Record<string, string>;
};

const err = (status: number, error: string, extra: object = {}) => Response.json({ error, ...extra }, { status });
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const cleanFeatures = (v: unknown) => (Array.isArray(v) ? v : []).filter((f): f is string => typeof f === "string").slice(0, 40).map((f) => f.slice(0, 100));

export async function POST(req: Request) {
  const viewer = await getViewer(req.headers);
  if (!viewer) return err(401, "Please sign in or continue as guest first.", { code: "NO_SESSION" });

  const body = (await req.json().catch(() => ({}))) as Body;
  const stack = STACK_INDEX[body.stackId || ""];
  if (!stack) return err(400, "Unknown stack.");
  const projectId = str(body.projectId, 64);
  if (!/^[\w-]{8,64}$/.test(projectId)) return err(400, "Missing project id.");

  const history = Array.isArray(body.history) ? body.history.filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-12) : [];
  const isRefine = history.length > 0;
  const limit = LIMITS[viewer.tier];
  const ip = ipHash(req.headers);

  // ---- Quota checks (server-side; the UI only displays them) ----
  if (isRefine) {
    const used = await refinesUsed(viewer.user.id, projectId);
    if (used >= limit.refinesPerProject)
      return err(429, `You've used all ${limit.refinesPerProject} follow-up changes for this project on the ${limit.label} plan. Start a new project${viewer.tier === "anonymous" || viewer.tier === "guest" ? " or ask an admin to upgrade you to Member" : ""}.`, { code: "REFINE_LIMIT" });
  } else {
    const q = await quotaStatus(viewer, ip);
    if (viewer.sandbox && q.used >= q.limit)
      return err(429, `Demo accounts can generate ${q.limit} frameworks per day per visitor. Sign in with Google, Microsoft, GitHub or email to keep going.`, { code: "DEMO_LIMIT" });
    if (q.used >= q.limit)
      return err(429, viewer.tier === "anonymous"
        ? `Guests can generate ${limit.generations} frameworks per month without signing in. Sign in with Google, Microsoft, GitHub or email to get ${LIMITS.guest.generations} per month.`
        : `You've used all ${limit.generations} generations for this month on the ${limit.label} plan. It resets on the 1st${viewer.tier === "guest" ? ", or ask an admin to upgrade you to Member" : ""}.`,
        { code: "MONTHLY_LIMIT" });
  }

  // ---- Build the conversation ----
  const messages: Msg[] = [];
  if (!isRefine) {
    const description = str(body.description, 8000).trim();
    if (description.length < 10) return err(400, "Please describe what to automate (at least a sentence).");
    messages.push({ role: "user", content: firstMessage({ stack, description, features: cleanFeatures(body.features), appUrl: str(body.appUrl, 500), extra: str(body.extra, 2000) }) });
  } else {
    messages.push(...history.map((m) => ({ role: m.role, content: m.content.slice(0, 200000) })));
    let budget = CONTEXT_CHARS; const ctx: string[] = [];
    for (const [p, c] of Object.entries(body.files || {})) {
      if (typeof c !== "string") continue;
      const block = `<<<CURRENT: ${p}>>>\n${c}\n<<<END>>>`;
      if (block.length > budget) { ctx.push(`<<<CURRENT: ${p}>>> (omitted — too large)`); continue; }
      budget -= block.length; ctx.push(block);
    }
    const message = str(body.message, 4000).trim();
    if (!message) return err(400, "Empty message.");
    messages.push({ role: "user", content: `${message}\n\n(Stack is still ${stack.label}. Return only changed/new files in the <<<FILE>>> format, each in full.)${ctx.length ? `\n\nCURRENT PROJECT FILES:\n${ctx.join("\n")}` : ""}` });
  }

  // Record usage up-front (blocks parallel abuse); refunded if the AI call fails.
  const eventId = randomUUID();
  await db.insert(usageEvent).values({ id: eventId, userId: viewer.user.id, ipHash: ip, kind: isRefine ? "refine" : "generate", projectId, stackId: stack.id });

  const enc = new TextEncoder();
  const ac = new AbortController();
  req.signal.addEventListener("abort", () => ac.abort());

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try { controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch {}
      };
      const ping = setInterval(() => { try { controller.enqueue(enc.encode(": ping\n\n")); } catch {} }, 15000);
      let gotText = false;
      let filesProduced = 0;
      const emit = (event: "delta" | "status", data: unknown) => {
        if (event === "delta") { gotText = true; filesProduced += ((data as { text: string }).text.match(/<<<END FILE>>>/g) || []).length; }
        send(event, data);
      };
      try {
        let stopReason: "end_turn" | "max_tokens" = "end_turn";
        let report: ValidationReport | null = null;
        let planned = false;
        if (!isRefine && process.env.GEN_PIPELINE !== "0") {
          // Plan → write files in parallel → validate → auto-fix
          const r = await generateProject({ stack, description: str(body.description, 8000).trim(), features: cleanFeatures(body.features),
            appUrl: str(body.appUrl, 500), extra: str(body.extra, 2000), signal: ac.signal, emit });
          if (r) { planned = true; report = r.report; }
        }
        if (!planned) {
          // Refinement, or planning failed: single streamed answer, then validate + auto-fix what changed.
          let text = "";
          const result = await streamCompletion({ system: SYSTEM_PROMPT, messages, signal: ac.signal, onText: (t) => { text += t; emit("delta", { text: t }); } });
          stopReason = result.stopReason;
          if (stopReason !== "max_tokens") {
            const parsed = parseFiles(text);
            const changed = Object.fromEntries(parsed.files.filter(([p]) => p !== parsed.writing)); // complete files only
            report = await checkAfterRefine({ allFiles: body.files || {}, changed, stack, signal: ac.signal, emit,
              context: `${messages[messages.length - 1].content.slice(0, 20000)}` });
          }
        }
        send("done", {
          stopReason,
          firstUserMessage: isRefine ? null : messages[0].content,
          validation: report ? { checked: report.checked, errors: report.errors, warnings: report.warnings } : null,
        });
      } catch (e) {
        // Refund the attempt if nothing usable was produced.
        if (!gotText || filesProduced === 0) await db.delete(usageEvent).where(eq(usageEvent.id, eventId)).catch(() => {});
        if (!ac.signal.aborted) send("error", { error: e instanceof Error ? e.message : "Generation failed" });
      } finally {
        clearInterval(ping);
        try { controller.close(); } catch {}
      }
    },
    cancel() { ac.abort(); },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
