"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useMe } from "@/components/MeProvider";

type Provider = "google" | "microsoft" | "github";

const PLANS = [
  { name: "Guest", detail: "2 frameworks / month, no sign-in" },
  { name: "Signed-in", detail: "5 frameworks / month" },
  { name: "Member", detail: "50 / month + saved history" },
  { name: "Admin", detail: "Unlimited + user management" },
];

const HIGHLIGHTS = [
  "54 stacks — Selenium, Playwright, Cypress, Appium, RestAssured, Karate, k6, JMeter, ZAP…",
  "Complete, runnable projects: build files, page objects, config, CI, README",
  "Chat with the agent to refine, then download as ZIP",
];

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 23 23" className="h-5 w-5" aria-hidden="true">
      <path fill="#f35325" d="M1 1h10v10H1z" /><path fill="#81bc06" d="M12 1h10v10H12z" />
      <path fill="#05a6f0" d="M1 12h10v10H1z" /><path fill="#ffba08" d="M12 12h10v10H12z" />
    </svg>
  );
}
function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-5 w-5" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export default function LoginPage() {
  const { me, loading, refresh } = useMe();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "link">("password");
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const p = me?.providers;

  const next = () => {
    const n = new URLSearchParams(window.location.search).get("next");
    return n && n.startsWith("/") && !n.startsWith("//") ? n : "/";
  };

  // Already signed in (not as an anonymous guest) → go straight to the app.
  useEffect(() => {
    if (!loading && me?.user && me.tier !== "anonymous") router.replace(next());
  }, [loading, me, router]);

  async function social(provider: Provider) {
    if (!p?.[provider]) {
      setStatus({ kind: "err", text: `${provider[0].toUpperCase() + provider.slice(1)} sign-in hasn't been set up on this server yet. Use email, a demo account or continue as guest.` });
      return;
    }
    setBusy(provider); setStatus(null);
    const { error } = await authClient.signIn.social({ provider, callbackURL: next() });
    if (error) { setStatus({ kind: "err", text: error.message || "Sign-in failed" }); setBusy(null); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setStatus(null);
    if (mode === "link") {
      setBusy("email");
      const { error } = await authClient.signIn.magicLink({ email, callbackURL: next() });
      setBusy(null);
      setStatus(error ? { kind: "err", text: error.message || "Couldn't send the link" } : { kind: "ok", text: `Check ${email} for a sign-in link (expires in 5 minutes).` });
      return;
    }
    setBusy("password");
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      setBusy(null);
      setStatus({ kind: "err", text: error.status === 401 || /invalid/i.test(error.message || "") ? "Wrong email or password. Personal accounts sign in with Google, Microsoft, GitHub or an email link." : error.message || "Sign-in failed" });
      return;
    }
    await refresh(); router.replace(next());
  }

  async function guest() {
    setBusy("guest"); setStatus(null);
    if (!me?.user) {
      const { error } = await authClient.signIn.anonymous();
      if (error) { setBusy(null); setStatus({ kind: "err", text: error.message || "Couldn't start a guest session" }); return; }
    }
    await refresh(); router.replace("/");
  }

  function fillDemo(d: { email: string; password: string }) {
    setMode("password"); setEmail(d.email); setPassword(d.password); setStatus(null);
  }
  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 1200); });
  }

  const socialBtn = (provider: Provider, label: string, icon: React.ReactNode) => (
    <button type="button" onClick={() => social(provider)} disabled={!!busy}
      className={`btn w-full justify-center py-2.5 ${p && !p[provider] ? "opacity-60" : ""}`}
      title={p && !p[provider] ? "Not set up yet" : undefined}>
      {icon}<span>{busy === provider ? "Redirecting…" : label}</span>
    </button>
  );

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Left: product */}
      <section className="relative hidden overflow-hidden border-r border-line bg-gradient-to-br from-[#0d1422] via-bg to-[#071a1a] p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent2 font-mono font-bold text-[#04131a]">⟨/⟩</span>
          <span className="text-lg font-bold">AutoScript Agent</span>
        </div>
        <div className="max-w-lg">
          <h1 className="text-4xl font-bold leading-tight">Describe your app.<br /><span className="text-accent">Get a ready-to-run test framework.</span></h1>
          <ul className="mt-8 grid gap-3 text-[15px] text-muted">
            {HIGHLIGHTS.map((h) => <li key={h} className="flex gap-3"><span className="text-accent">✓</span>{h}</li>)}
          </ul>
          <div className="mt-10 grid grid-cols-2 gap-3">
            {PLANS.map((pl) => (
              <div key={pl.name} className="rounded-lg border border-line bg-panel/60 p-3">
                <div className="text-sm font-semibold">{pl.name}</div>
                <div className="text-xs text-muted">{pl.detail}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted">Built with Next.js · Better Auth · PostgreSQL · Gemini</p>
      </section>

      {/* Right: sign in */}
      <section className="flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent2 font-mono font-bold text-[#04131a]">⟨/⟩</span>
            <div><div className="text-lg font-bold">AutoScript Agent</div><div className="text-xs text-muted">AI test-automation framework generator</div></div>
          </div>

          <h2 className="text-2xl font-bold">Sign in</h2>
          <p className="mb-6 mt-1 text-sm text-muted">
            {me?.tier === "anonymous" ? "You're browsing as a guest. Sign in to raise your limit — what you've used carries over." : "Choose how you'd like to sign in."}
          </p>

          <div className="grid gap-2.5">
            {socialBtn("google", "Continue with Google", <GoogleIcon />)}
            {socialBtn("microsoft", "Continue with Microsoft", <MicrosoftIcon />)}
            {socialBtn("github", "Continue with GitHub", <GitHubIcon />)}
          </div>

          <div className="my-5 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or with email<span className="h-px flex-1 bg-line" /></div>

          <form onSubmit={submit} className="grid gap-3">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" className="input" type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {mode === "password" && (
              <div>
                <label className="label" htmlFor="password">Password</label>
                <input id="password" className="input" type="password" autoComplete="current-password" required placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            )}
            <button className="btn btn-primary w-full py-2.5" disabled={!!busy}>
              {busy === "password" ? "Signing in…" : busy === "email" ? "Sending…" : mode === "password" ? "Sign in" : "Email me a sign-in link"}
            </button>
            <button type="button" className="text-left text-xs text-accent2 hover:underline" onClick={() => { setMode(mode === "password" ? "link" : "password"); setStatus(null); }}>
              {mode === "password" ? "No password? Email me a sign-in link instead" : "Sign in with a password instead"}
            </button>
          </form>

          {status && <p role="alert" className={`mt-4 text-sm ${status.kind === "ok" ? "text-accent" : "text-danger"}`}>{status.text}</p>}

          {!!me?.demoAccounts?.length && (
            <div className="mt-6 rounded-xl border border-dashed border-accent2/40 bg-accent2/5 p-4">
              <div className="text-sm font-semibold text-accent2">Demo accounts for recruiters</div>
              <p className="mb-3 mt-0.5 text-xs text-muted">Click <b>Use</b> to fill the form, then <b>Sign in</b>. These accounts are shared with other visitors.</p>
              <ul className="grid gap-2">
                {me.demoAccounts.map((d) => (
                  <li key={d.email} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-panel2 px-3 py-2">
                    <div className="min-w-0 text-xs">
                      <div className="font-semibold text-ink">{d.label} <span className="font-normal text-muted">· {d.note}</span></div>
                      <button type="button" className="block truncate font-mono text-muted hover:text-ink" onClick={() => copy(d.email, d.email)} title="Copy email">{copied === d.email ? "copied!" : d.email}</button>
                      <button type="button" className="font-mono text-muted hover:text-ink" onClick={() => copy(d.password, d.email + "pw")} title="Copy password">{copied === d.email + "pw" ? "copied!" : d.password}</button>
                    </div>
                    <button type="button" className="btn shrink-0 px-3 py-1 text-xs" onClick={() => fillDemo(d)}>Use</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="my-5 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
          <button type="button" className="btn w-full py-2.5" disabled={!!busy} onClick={guest}>
            {busy === "guest" ? "Starting…" : me?.tier === "anonymous" ? "Continue as guest" : "Continue as guest — no sign-in"}
          </button>
          <p className="mt-2 text-center text-xs text-muted">Guests get 2 free frameworks per month.</p>
        </div>
      </section>
    </div>
  );
}
