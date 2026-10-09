"use client";
import { useCallback, useEffect, useState } from "react";
import { useMe } from "@/components/MeProvider";

type U = { id: string; name: string; email: string; role: string; tier: string; banned: boolean; isDemo: boolean; isSelf: boolean; generationsThisMonth: number; createdAt: string };
type Data = { readOnly: boolean; roles: string[]; users: U[]; stats: { generationsThisMonth: number; refinesThisMonth: number; usersByTier: Record<string, number>; topStacks: { label: string; count: number }[] } };

const ROLE_LABEL: Record<string, string> = { admin: "Admin", demo_admin: "Demo admin", member: "Member", guest: "Guest" };

export default function AdminPage() {
  const { me, loading } = useMe();
  const [data, setData] = useState<Data | null>(null);
  const [q, setQ] = useState("");
  const [showAnon, setShowAnon] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}&anon=${showAnon ? 1 : 0}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) { setMsg({ kind: "err", text: j.error }); return; }
    setData(j);
  }, [q, showAnon]);

  useEffect(() => { if (me?.canViewAdmin) { const t = setTimeout(load, 250); return () => clearTimeout(t); } }, [me?.canViewAdmin, load]);

  async function patch(userId: string, body: object, okText: string) {
    setMsg(null);
    const r = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, ...body }) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? { kind: "ok", text: okText } : { kind: "err", text: j.error || j.message || "Failed" });
    load();
  }

  if (loading) return <div className="p-8 text-muted">Loading…</div>;
  if (!me?.canViewAdmin) return <div className="mx-auto max-w-xl p-8"><div className="panel">Admins only.</div></div>;

  const s = data?.stats;
  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-bold">Admin</h1>
        {data?.readOnly && <span className="rounded-lg border border-accent2/40 bg-accent2/10 px-3 py-1.5 text-xs text-accent2">Demo admin · read-only · emails are masked</span>}
      </div>

      {s && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Generations this month", s.generationsThisMonth],
            ["Follow-up changes", s.refinesThisMonth],
            ["Members + admins", (s.usersByTier.member || 0) + (s.usersByTier.admin || 0) + (s.usersByTier.demo_admin || 0)],
            ["Guests (signed in / anonymous)", `${s.usersByTier.guest || 0} / ${s.usersByTier.anonymous || 0}`],
          ].map(([label, v]) => (
            <div key={label as string} className="panel py-3"><div className="text-xs text-muted">{label}</div><div className="mt-1 text-2xl font-bold">{v}</div></div>
          ))}
        </div>
      )}
      {s && s.topStacks.length > 0 && (
        <div className="panel mb-4 py-3">
          <div className="mb-2 text-xs text-muted">Top stacks this month</div>
          <div className="flex flex-wrap gap-2">{s.topStacks.map((t) => <span key={t.label} className="tag">{t.label} · {t.count}</span>)}</div>
        </div>
      )}

      <div className="panel">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <input className="input max-w-xs" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={showAnon} onChange={(e) => setShowAnon(e.target.checked)} /> Show anonymous guests</label>
          {msg && <span className={`text-xs ${msg.kind === "ok" ? "text-accent" : "text-danger"}`}>{msg.text}</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line"><th className="py-2 pr-3">User</th><th className="pr-3">Role</th><th className="pr-3">This month</th><th className="pr-3">Joined</th><th className="pr-3">Status</th></tr>
            </thead>
            <tbody>
              {data?.users.map((u) => {
                const locked = data.readOnly || u.isSelf || u.isDemo || u.tier === "anonymous";
                return (
                  <tr key={u.id} className="border-b border-line/60">
                    <td className="py-2 pr-3"><div className="font-medium">{u.name}{u.isSelf && <span className="text-muted"> (you)</span>}{u.isDemo && <span className="tag ml-2">demo</span>}</div><div className="text-xs text-muted">{u.email}</div></td>
                    <td className="pr-3">
                      {u.tier === "anonymous" ? <span className="text-xs text-muted">Anonymous</span> : (
                        <select className="input w-auto py-1" value={u.role.split(",")[0]} disabled={locked}
                          onChange={(e) => patch(u.id, { role: e.target.value }, `${u.name} is now ${ROLE_LABEL[e.target.value]}.`)}>
                          {data.roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="pr-3">{u.generationsThisMonth}</td>
                    <td className="pr-3 text-xs text-muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="pr-3">
                      {locked ? (u.banned ? <span className="text-xs text-danger">Banned</span> : <span className="text-xs text-muted">Active</span>) : (
                        <button className={`btn px-2 py-1 text-xs ${u.banned ? "" : "btn-danger"}`}
                          onClick={() => patch(u.id, { banned: !u.banned }, u.banned ? `${u.name} unbanned.` : `${u.name} banned.`)}>{u.banned ? "Unban" : "Ban"}</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data && data.users.length === 0 && <p className="py-4 text-sm text-muted">No users found.</p>}
        </div>
      </div>
    </div>
  );
}
