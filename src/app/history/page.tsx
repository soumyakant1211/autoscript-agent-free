"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useMe } from "@/components/MeProvider";

type Row = { id: string; title: string; stackLabel: string; updatedAt: string };

export default function HistoryPage() {
  const { me, loading } = useMe();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!me?.canSaveHistory) return;
    fetch("/api/projects").then((r) => r.json()).then((j) => setRows(j.projects || []));
  }, [me?.canSaveHistory]);

  async function remove(id: string) {
    if (!confirm("Delete this project?")) return;
    const r = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || "Couldn't delete"); return; }
    setRows((rs) => rs?.filter((x) => x.id !== id) || null);
  }

  if (loading) return <div className="p-8 text-muted">Loading…</div>;
  if (!me?.canSaveHistory)
    return (
      <div className="mx-auto max-w-xl p-8">
        <div className="panel">
          <h1 className="mb-2 text-lg font-bold">History is a Member feature</h1>
          <p className="text-sm text-muted">Members get saved projects they can reopen and keep refining. Ask an admin to upgrade your account{me?.tier === "anonymous" ? " — sign in first" : ""}.</p>
          {me?.tier === "anonymous" && <Link href="/login" className="btn btn-primary mt-4">Sign in</Link>}
        </div>
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-4xl p-4 md:p-8">
      <h1 className="mb-4 text-xl font-bold">Your projects</h1>
      {rows === null ? <p className="text-muted">Loading…</p> : rows.length === 0 ? (
        <div className="panel text-sm text-muted">No saved projects yet. <Link href="/" className="text-accent2">Generate one →</Link></div>
      ) : (
        <ul className="grid gap-2">
          {rows.map((r) => (
            <li key={r.id} className="panel flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <Link href={`/?project=${r.id}`} className="block truncate font-semibold hover:text-accent">{r.title}</Link>
                <div className="text-xs text-muted">{r.stackLabel} · updated {new Date(r.updatedAt).toLocaleString()}</div>
              </div>
              <div className="flex gap-2">
                <Link href={`/?project=${r.id}`} className="btn">Open</Link>
                {me.tier !== "demo_admin" && <button className="btn btn-danger" onClick={() => remove(r.id)}>Delete</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
