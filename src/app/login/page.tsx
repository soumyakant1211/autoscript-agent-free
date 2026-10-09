"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useMe } from "@/components/MeProvider";

const TIERS = [
  { name: "Guest (no sign-in)", detail: "2 generations / month · 3 follow-ups per project" },
  { name: "Guest (signed in)", detail: "5 generations / month · 5 follow-ups per project" },
  { name: "Member", detail: "50 generations / month · saved history · granted by an admin" },
  { name: "Admin", detail: "Unlimited · manage users and roles" },
];

export default function LoginPage() {
  const { me, refresh } = useMe();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const p = me?.providers;

  async function social(provider: "google" | "microsoft" | "github") {
    setBusy(provider); setStatus(null);
    const { error } = await authClient.signIn.social({ provider, callbackURL: "/" });
    if (error) { setStatus({ kind: "err", text: error.message || "Sign-in failed" }); setBusy(null); }
  }

  async function magic(e: React.FormEvent) {
    e.preventDefault(); setBusy("email"); setStatus(null);
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: "/" });
    setBusy(null);
    setStatus(error ? { kind: "err", text: error.message || "Couldn't send the link" } : { kind: "ok", text: `Check ${email} for a sign-in link (it expires in 5 minutes).` });
  }

  async function demo(as: "admin" | "member") {
    setBusy(as); setStatus(null);
    const r = await fetch("/api/demo-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ as }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setStatus({ kind: "err", text: j.error || j.message || "Demo login failed" }); setBusy(null); return; }
    await refresh(); router.push(as === "admin" ? "/admin" : "/");
  }

  async function guest() {
    setBusy("guest");
    if (!me?.user) await authClient.signIn.anonymous();
    await refresh(); router.push("/");
  }

  const signedIn = me?.user && me.tier !== "anonymous";

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4 p-4 md:grid-cols-[1fr_300px] md:p-8">
      <section className="panel p-6">
        <h1 className="mb-1 text-xl font-bold">Sign in to AutoScript Agent</h1>
        <p className="mb-5 text-sm text-muted">
          {me?.tier === "anonymous" ? "You're using a guest session. Signing in keeps what you've used so far and raises your limit." : "Sign in to get a higher monthly limit."}
        </p>

        {signedIn ? (
          <p className="text-sm">You&apos;re signed in as <b>{me.user!.email}</b> ({me.tierLabel}). <Link href="/" className="text-accent2">Go to the generator →</Link></p>
        ) : (
          <>
            <div className="grid gap-2">
              {p?.google && <button className="btn w-full justify-start py-2.5" disabled={!!busy} onClick={() => social("google")}>Continue with Google</button>}
              {p?.microsoft && <button className="btn w-full justify-start py-2.5" disabled={!!busy} onClick={() => social("microsoft")}>Continue with Microsoft</button>}
              {p?.github && <button className="btn w-full justify-start py-2.5" disabled={!!busy} onClick={() => social("github")}>Continue with GitHub</button>}
              {p && !p.google && !p.microsoft && !p.github && <p className="text-xs text-muted">Google / Microsoft / GitHub sign-in isn&apos;t configured on this server yet.</p>}
            </div>

            {p?.magicLink && (
              <form onSubmit={magic} className="mt-5">
                <div className="mb-3 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or use email<span className="h-px flex-1 bg-line" /></div>
                <div className="flex gap-2">
                  <input className="input" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <button className="btn btn-primary shrink-0" disabled={!!busy}>{busy === "email" ? "Sending…" : "Email me a link"}</button>
                </div>
              </form>
            )}

            <div className="mt-5 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
            <button className="btn mt-3 w-full py-2.5" disabled={!!busy} onClick={guest}>Continue as guest (no sign-in)</button>

            {p?.demo && (
              <div className="mt-5 rounded-lg border border-dashed border-accent2/40 p-3">
                <div className="mb-1 text-xs font-semibold text-accent2">Try a demo account</div>
                <p className="mb-2 text-[11px] text-muted">Demo accounts are shared with other visitors — anything generated there is visible to them.</p>
                <div className="flex flex-wrap gap-2">
                  <button className="btn" disabled={!!busy} onClick={() => demo("admin")}>Demo admin (read-only)</button>
                  <button className="btn" disabled={!!busy} onClick={() => demo("member")}>Demo member</button>
                </div>
              </div>
            )}
          </>
        )}
        {status && <p className={`mt-4 text-sm ${status.kind === "ok" ? "text-accent" : "text-danger"}`}>{status.text}</p>}
      </section>

      <aside className="panel h-fit">
        <h2 className="h2">Plans</h2>
        <ul className="grid gap-3">
          {TIERS.map((t) => (
            <li key={t.name}><div className="text-sm font-semibold">{t.name}</div><div className="text-xs text-muted">{t.detail}</div></li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
