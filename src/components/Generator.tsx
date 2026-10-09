"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import hljs from "highlight.js/lib/common";
import stacksData from "@/lib/stacks.json";
import { authClient } from "@/lib/auth-client";
import { FEATURES, TYPE_NAME, compactForHistory, langFor, md, parseFiles } from "@/lib/client-utils";
import { useMe } from "./MeProvider";

type StackItem = { id: string; label: string; type: string; build: string; hint: string; added?: boolean };
type Group = { group: string; items: StackItem[] };
const STACKS = stacksData as Group[];
const STACK_INDEX: Record<string, StackItem & { group: string }> = Object.fromEntries(
  STACKS.flatMap((g) => g.items.map((i) => [i.id, { ...i, group: g.group }]))
);

type ApiMsg = { role: "user" | "assistant"; content: string };
type Bubble = { id: number; who: "user" | "agent"; html: string; streaming?: boolean; writing?: string | null; error?: string; errorCode?: string; canContinue?: boolean };

const recFor = (type: string) => new Set(FEATURES.filter((f) => (f.types === "*" || f.types.includes(type)) && f.rec).map((f) => f.name));
let bubbleId = 1;

export default function Generator() {
  const { me, refresh } = useMe();

  // ---------- configuration ----------
  const [filter, setFilter] = useState("");
  const [stackId, setStackId] = useState("ts-playwright");
  const stack = STACK_INDEX[stackId];
  const [features, setFeatures] = useState<Set<string>>(() => recFor(STACK_INDEX["ts-playwright"].type));
  const [description, setDescription] = useState("");
  const [appUrl, setAppUrl] = useState("");
  const [extra, setExtra] = useState("");

  // ---------- project state ----------
  const [projectId, setProjectId] = useState<string>("");
  const [files, setFiles] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string | null>(null);
  const [writing, setWriting] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([
    { id: 0, who: "agent", html: 'Hi! Pick a stack, describe your app and choose features, then hit <b>Generate</b>. Afterwards, ask me for changes — <i>"add a negative login test"</i>, <i>"switch reports to Extent"</i>.' },
  ]);
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState("");
  const historyRef = useRef<ApiMsg[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  // Restore the last stack after hydration (localStorage isn't available during prerender).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { try { const s = localStorage.getItem("as_stack"); if (s && STACK_INDEX[s]) { setStackId(s); setFeatures(recFor(STACK_INDEX[s].type)); } } catch {} }, []);

  // Open a saved project from History (?project=<id>)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("project");
    if (!id) return;
    fetch(`/api/projects/${encodeURIComponent(id)}`).then((r) => r.json()).then(({ project }) => {
      if (!project) return;
      setProjectId(project.id); setStackId(project.stackId); setFiles(project.files || {});
      historyRef.current = project.messages || [];
      const paths = Object.keys(project.files || {}).sort();
      setActive(paths.includes("README.md") ? "README.md" : paths[0] || null);
      setBubbles([{ id: bubbleId++, who: "agent", html: `Opened saved project <b>${project.title.replace(/</g, "&lt;")}</b>. Ask me for changes or download the ZIP.` }]);
    }).catch(() => {});
  }, []);

  const groups = useMemo(() => {
    const f = filter.trim().toLowerCase(); let n = 0;
    return STACKS.map((g) => ({ ...g, items: g.items.filter((i) => !f || i.label.toLowerCase().includes(f) || g.group.toLowerCase().includes(f)).map((i) => ({ ...i, n: ++n })) }))
      .filter((g) => g.items.length);
  }, [filter]);
  const visibleFeatures = FEATURES.filter((f) => f.types === "*" || f.types.includes(stack.type));
  const paths = useMemo(() => Object.keys(files).sort(), [files]);

  function chooseStack(id: string) {
    setStackId(id); setFeatures(recFor(STACK_INDEX[id].type));
    try { localStorage.setItem("as_stack", id); } catch {}
  }
  function toggleFeature(name: string) {
    setFeatures((s) => { const n = new Set(s); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  }

  useEffect(() => {
    const el = messagesRef.current; if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) el.scrollTop = el.scrollHeight;
  }, [bubbles]);

  const updateBubble = (id: number, patch: Partial<Bubble>) => setBubbles((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  /** Make sure there is a session — anonymous guests are created on first use. */
  async function ensureSession() {
    if (me?.user) return true;
    const { error } = await authClient.signIn.anonymous();
    if (error) return false;
    await refresh();
    return true;
  }

  const saveProject = useCallback(async (id: string, sId: string, f: Record<string, string>, title: string) => {
    if (!me?.canSaveHistory) return;
    await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, stackId: sId, title, files: f, messages: historyRef.current }) }).catch(() => {});
  }, [me?.canSaveHistory]);

  async function run(body: object, userText: string | null, baseFiles: Record<string, string>, pid: string, title: string) {
    setBusy(true);
    const bid = bubbleId++;
    setBubbles((bs) => [...bs, { id: bid, who: "agent", html: "", streaming: true }]);
    let full = ""; let firstUserMessage: string | null = null; let stopReason = "end_turn"; let failed = false; let last = 0;
    const ac = new AbortController(); abortRef.current = ac;

    const apply = (streaming: boolean) => {
      const { files: found, writing: w } = parseFiles(full);
      const merged = { ...baseFiles, ...Object.fromEntries(found) };
      setFiles(merged);
      setWriting(streaming ? w : null);
      if (w && streaming) setActive(w);
      else if (!streaming) setActive((a) => (a && merged[a] !== undefined ? a : merged["README.md"] !== undefined ? "README.md" : Object.keys(merged).sort()[0] || null));
      updateBubble(bid, { html: md(full), streaming, writing: streaming ? w : null });
      return merged;
    };

    let finalFiles = baseFiles;
    try {
      const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ac.signal });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw Object.assign(new Error(j.error || `HTTP ${res.status}`), { code: j.code });
      }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const ev = /^event: (.+)$/m.exec(chunk)?.[1]; const data = /^data: (.+)$/m.exec(chunk)?.[1];
          if (!ev || !data) continue;
          const j = JSON.parse(data);
          if (ev === "delta") { full += j.text; if (performance.now() - last > 120) { apply(true); last = performance.now(); } }
          else if (ev === "done") { firstUserMessage = j.firstUserMessage; stopReason = j.stopReason; }
          else if (ev === "error") throw new Error(j.error);
        }
      }
      finalFiles = apply(false);
    } catch (e) {
      failed = true;
      const err = e as Error & { code?: string };
      if (err.name === "AbortError") { updateBubble(bid, { streaming: false }); }
      else { if (full) finalFiles = apply(false); updateBubble(bid, { streaming: false, error: err.message, errorCode: err.code }); }
    } finally {
      setBusy(false); setWriting(null); abortRef.current = null;
    }
    refresh();
    if (!failed && full) {
      historyRef.current = [...historyRef.current,
        { role: "user", content: firstUserMessage || userText || "" },
        { role: "assistant", content: compactForHistory(full, Object.keys(finalFiles).sort()) }];
      if (stopReason === "max_tokens") updateBubble(bid, { canContinue: true });
      saveProject(pid, stackId, finalFiles, title);
    }
  }

  async function generate() {
    const d = description.trim();
    if (d.length < 10) { setBubbles((bs) => [...bs, { id: bubbleId++, who: "agent", html: "", error: "Please describe what to automate first (at least a sentence)." }]); return; }
    if (historyRef.current.length && !confirm("Start a new project? Current files will be replaced.")) return;
    if (!(await ensureSession())) { setBubbles((bs) => [...bs, { id: bubbleId++, who: "agent", html: "", error: "Couldn't start a guest session. Try signing in instead." }]); return; }
    const pid = crypto.randomUUID();
    setProjectId(pid); setFiles({}); setActive(null); historyRef.current = [];
    const feats = [...features].filter((f) => visibleFeatures.some((v) => v.name === f));
    setBubbles((bs) => [...bs, { id: bubbleId++, who: "user", html: md(`Generate a **${stack.label}** framework.\n\n${d}`) + (feats.length ? `<div class="text-xs text-muted mt-1">${feats.length} features selected</div>` : "") }]);
    const title = `${stack.label} — ${d.slice(0, 60)}`;
    await run({ projectId: pid, stackId, description: d, features: feats, appUrl: appUrl.trim(), extra: extra.trim() }, null, {}, pid, title);
  }

  async function sendChat(override?: string) {
    const text = (override ?? chat).trim();
    if (!text || busy || !projectId) return;
    setChat("");
    if (!override) setBubbles((bs) => [...bs, { id: bubbleId++, who: "user", html: md(text) }]);
    await run({ projectId, stackId, history: historyRef.current, message: text, files }, text, files, projectId, `${stack.label} — ${description.slice(0, 60) || "project"}`);
  }

  function newProject() {
    abortRef.current?.abort();
    setProjectId(""); setFiles({}); setActive(null); historyRef.current = [];
    setBubbles([{ id: bubbleId++, who: "agent", html: "New project started. Configure on the left and hit <b>Generate</b>." }]);
    window.history.replaceState(null, "", "/");
  }

  async function downloadZip() {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip(); const root = `${stackId}-framework`;
    Object.entries(files).forEach(([p, c]) => zip.file(`${root}/${p}`, c));
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${root}.zip`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const code = active ? files[active] : undefined;
  const highlighted = useMemo(() => {
    if (code === undefined) return "";
    const lang = langFor(active!);
    if (writing === active || !lang || !hljs.getLanguage(lang)) return code.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
    try { return hljs.highlight(code, { language: lang }).value; } catch { return code.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!); }
  }, [code, active, writing]);

  // file tree rows
  const treeRows = useMemo(() => {
    const rows: { kind: "dir" | "file"; depth: number; name: string; path?: string }[] = [];
    let lastDirs: string[] = [];
    for (const p of paths) {
      const parts = p.split("/"); const dirs = parts.slice(0, -1);
      dirs.forEach((d, i) => { if (lastDirs[i] !== d) { rows.push({ kind: "dir", depth: i, name: d }); lastDirs = dirs.slice(0, i + 1); } });
      lastDirs = dirs;
      rows.push({ kind: "file", depth: dirs.length, name: parts.at(-1)!, path: p });
    }
    return rows;
  }, [paths]);

  const quotaLeft = me?.quota ? (me.quota.limit === null ? null : Math.max(0, me.quota.limit - me.quota.used)) : undefined;

  return (
    <div className="grid flex-1 gap-3 p-3 lg:grid-cols-[330px_1fr] xl:h-[calc(100vh-64px)] xl:flex-none xl:grid-cols-[330px_1fr_370px] xl:grid-rows-[minmax(0,1fr)]">
      {/* LEFT: configure */}
      <section className="panel flex min-h-0 flex-col overflow-y-auto lg:max-h-[calc(100vh-88px)] xl:max-h-none">
        <h2 className="h2">1 · Configure</h2>
        <div className="mb-3.5">
          <label className="label" htmlFor="stack">Tech stack</label>
          <input className="input mb-1.5" type="search" placeholder="Filter stacks… (playwright, appium, k6)" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <select id="stack" className="input" value={groups.some((g) => g.items.some((i) => i.id === stackId)) ? stackId : ""} onChange={(e) => chooseStack(e.target.value)}>
            {!groups.some((g) => g.items.some((i) => i.id === stackId)) && <option value="" disabled>— pick a stack —</option>}
            {groups.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map((i) => <option key={i.id} value={i.id}>{`${i.n}. ${i.label}${i.added ? "  ★ new" : ""}`}</option>)}
              </optgroup>
            ))}
          </select>
          <div className="mt-2 flex flex-wrap gap-1.5 text-muted">
            <span className="tag">{stack.group}</span><span className="tag">{TYPE_NAME[stack.type] || stack.type}</span><span className="tag">{stack.build}</span>
            {stack.added && <span className="tag border-warn text-warn">★ added</span>}
          </div>
        </div>

        <div className="mb-3.5">
          <label className="label" htmlFor="desc">What should be automated? <span className="text-danger">*</span></label>
          <textarea id="desc" className="input resize-y" rows={6} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. E-commerce web app. Automate: login (valid/invalid), search, add to cart, guest checkout, order confirmation. Also GET/POST /api/orders." />
        </div>
        <div className="mb-3.5">
          <label className="label" htmlFor="url">Application URL / Base URI <span className="font-normal text-muted">(optional)</span></label>
          <input id="url" className="input" value={appUrl} onChange={(e) => setAppUrl(e.target.value)} placeholder="https://www.saucedemo.com" />
        </div>
        <div className="mb-3.5">
          <div className="label">Features <span className="font-normal text-muted">({[...features].filter((f) => visibleFeatures.some((v) => v.name === f)).length} selected)</span></div>
          <div className="mb-2 flex gap-3 text-xs text-accent2">
            <button type="button" onClick={() => setFeatures(recFor(stack.type))}>Recommended</button>
            <button type="button" onClick={() => setFeatures(new Set(visibleFeatures.map((f) => f.name)))}>All</button>
            <button type="button" onClick={() => setFeatures(new Set())}>None</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {visibleFeatures.map((f) => (
              <button type="button" key={f.name} className={`chip ${features.has(f.name) ? "chip-on" : ""}`} onClick={() => toggleFeature(f.name)} aria-pressed={features.has(f.name)}>{f.name}</button>
            ))}
          </div>
        </div>
        <div className="mb-3.5">
          <label className="label" htmlFor="extra">Extra instructions <span className="font-normal text-muted">(optional)</span></label>
          <textarea id="extra" className="input resize-y" rows={2} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="e.g. Java 21, package com.acme.qa, headless Chrome & Firefox" />
        </div>
        <button className="btn btn-primary w-full py-3 text-[15px]" onClick={generate} disabled={busy || quotaLeft === 0}>
          {busy ? "⏳ Generating…" : quotaLeft === 0 ? "Monthly limit reached" : "⚡ Generate framework"}
        </button>
        <p className="mt-2 text-center text-xs text-muted">
          {!me?.user ? "No sign-in needed to try — guests get 2 free generations." :
            quotaLeft === null ? "Unlimited generations." :
            `${quotaLeft} generation${quotaLeft === 1 ? "" : "s"} left this month.`}
          {me && (!me.user || me.tier === "anonymous") && <> <Link href="/login" className="text-accent2">Sign in</Link> for 5/month.</>}
        </p>
      </section>

      {/* CENTER: files */}
      <section className="panel flex h-[600px] min-h-0 flex-col lg:h-[calc(100vh-88px)] xl:h-auto">
        <div className="flex items-center justify-between">
          <h2 className="h2">2 · Project files {paths.length > 0 && <span className="normal-case">({paths.length})</span>}</h2>
          <div className="mb-3 flex gap-2">
            <button className="btn px-2.5 py-1 text-xs" disabled={code === undefined} onClick={() => code !== undefined && navigator.clipboard.writeText(code)}>Copy file</button>
            <button className="btn px-2.5 py-1 text-xs" onClick={newProject} disabled={!projectId && !paths.length}>New</button>
            <button className="btn btn-primary px-2.5 py-1 text-xs" disabled={!paths.length} onClick={downloadZip}>⬇ ZIP</button>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-rows-[180px_1fr] gap-2.5 md:grid-cols-[220px_1fr] md:grid-rows-1">
          <nav className="overflow-auto rounded-lg border border-line bg-panel2 p-1.5 font-mono text-xs">
            {!paths.length && <p className="p-2 font-sans text-muted">Files appear here as the agent writes them.</p>}
            {treeRows.map((r, i) => r.kind === "dir"
              ? <div key={i} className="px-1.5 py-0.5 text-muted" style={{ paddingLeft: 6 + r.depth * 12 }}>▾ {r.name}/</div>
              : <div key={i} title={r.path} onClick={() => setActive(r.path!)}
                  className={`cursor-pointer truncate rounded-md px-1.5 py-0.5 hover:bg-[#1a2333] ${active === r.path ? "bg-accent2/15 text-accent2" : ""} ${writing === r.path ? "writing" : ""}`}
                  style={{ paddingLeft: 6 + r.depth * 12 }}>{r.name}</div>)}
          </nav>
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-line">
            <div className="border-b border-line bg-panel2 px-2.5 py-1.5 font-mono text-xs text-muted">{active || "—"}</div>
            <pre className="hljs m-0 flex-1 overflow-auto p-3 font-mono text-[12.5px]"><code dangerouslySetInnerHTML={{ __html: highlighted }} /></pre>
          </div>
        </div>
      </section>

      {/* RIGHT: chat */}
      <section className="panel flex h-[520px] min-h-0 flex-col lg:col-span-2 xl:col-span-1 xl:h-auto">
        <h2 className="h2">3 · Talk to the agent</h2>
        <div ref={messagesRef} className="flex flex-1 flex-col gap-2.5 overflow-y-auto pr-1"
          onClick={(e) => { const t = e.target as HTMLElement; if (t.dataset.path) setActive(t.dataset.path); }}>
          {bubbles.map((b) => (
            <div key={b.id} className={`flex ${b.who === "user" ? "justify-end" : ""}`}>
              <div className={`md max-w-[92%] break-words rounded-xl border px-3 py-2.5 ${b.who === "user" ? "border-accent2/35 bg-accent2/10" : "border-line bg-panel2"}`}>
                {b.html && <div dangerouslySetInnerHTML={{ __html: b.html }} />}
                {b.streaming && <span className="typing text-xs text-muted">{b.writing ? ` writing ${b.writing}` : b.html ? "" : "Thinking"}</span>}
                {b.error && (
                  <div className="mt-1 text-xs text-danger">⚠ {b.error}
                    {(b.errorCode === "MONTHLY_LIMIT" && me?.tier === "anonymous") && <> <Link href="/login" className="text-accent2 underline">Sign in now</Link></>}
                  </div>
                )}
                {b.canContinue && (
                  <button className="btn mt-2 px-2.5 py-1 text-xs" onClick={() => { updateBubble(b.id, { canContinue: false }); sendChat("You were cut off. Continue exactly where you left off: re-emit the last incomplete file in full, then the remaining files and the \"How to run\" section."); }}>↪ Continue generating</button>
                )}
              </div>
            </div>
          ))}
        </div>
        <form className="mt-2.5 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); sendChat(); }}>
          <textarea className="input flex-1 resize-none" rows={2} value={chat} disabled={!projectId || busy}
            placeholder={projectId ? "Ask for changes… (Enter to send)" : "Generate a project first"}
            onChange={(e) => setChat(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }} />
          <button className="btn btn-primary" disabled={!projectId || busy || !chat.trim()}>Send</button>
        </form>
        {me?.quota?.refinesPerProject != null && projectId && <p className="mt-1 text-[11px] text-muted">Up to {me.quota.refinesPerProject} follow-up changes per project on your plan.</p>}
      </section>
    </div>
  );
}
