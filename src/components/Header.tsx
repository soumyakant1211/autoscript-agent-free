"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useMe } from "./MeProvider";

const TIER_COLOR: Record<string, string> = {
  admin: "border-accent text-accent",
  demo_admin: "border-accent2 text-accent2",
  member: "border-accent2 text-accent2",
  guest: "border-line text-muted",
  anonymous: "border-line text-muted",
};

export function Header() {
  const { me, refresh } = useMe();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const signedIn = me?.user && me.tier !== "anonymous";
  if (path === "/login") return null; // the sign-in page has its own full-screen layout

  const nav = [
    { href: "/", label: "Generator", show: true },
    { href: "/history", label: "History", show: !!me?.canSaveHistory },
    { href: "/admin", label: "Admin", show: !!me?.canViewAdmin },
  ].filter((n) => n.show);

  async function logout() {
    await authClient.signOut();
    setOpen(false);
    await refresh();
    router.push("/login");
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-gradient-to-r from-[#0d1422] to-bg px-4 py-3 sm:px-5">
      <div className="flex items-center gap-5">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent2 font-mono font-bold text-[#04131a]">⟨/⟩</span>
          <span className="leading-tight">
            <span className="block text-[17px] font-bold">AutoScript Agent</span>
            <span className="hidden text-xs text-muted sm:block">AI test-automation framework generator · 54 stacks</span>
          </span>
        </Link>
        <nav className="flex gap-1">
          {nav.map((n) => (
            <Link key={n.href} href={n.href}
              className={`rounded-md px-3 py-1.5 text-sm ${path === n.href ? "bg-panel2 text-ink" : "text-muted hover:text-ink"}`}>
              {n.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2">
        {me?.quota && (
          <span className="hidden text-xs text-muted sm:inline" title={`Resets ${new Date(me.quota.resetsAt).toLocaleDateString()}`}>
            {me.quota.limit === null ? "Unlimited generations" : `${Math.max(0, me.quota.limit - me.quota.used)} of ${me.quota.limit} left this month`}
          </span>
        )}
        {me?.tier && <span className={`tag ${TIER_COLOR[me.tier]}`}>{me.tierLabel}</span>}
        {signedIn ? (
          <div className="relative">
            <button className="btn px-2 py-1.5" onClick={() => setOpen((o) => !o)} aria-label="Account menu">
              {me.user!.image
                // eslint-disable-next-line @next/next/no-img-element -- avatars come from many OAuth hosts
                ? <img src={me.user!.image} alt="" className="h-6 w-6 rounded-full" />
                : <span className="grid h-6 w-6 place-items-center rounded-full bg-accent2/20 text-xs font-bold text-accent2">{me.user!.name?.[0]?.toUpperCase() || "U"}</span>}
              <span className="hidden max-w-[140px] truncate sm:inline">{me.user!.name}</span>
            </button>
            {open && (
              <div className="absolute right-0 z-20 mt-2 w-60 rounded-lg border border-line bg-panel p-2 shadow-xl">
                <div className="px-2 py-1.5 text-xs text-muted">{me.user!.email}</div>
                <button className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-panel2" onClick={logout}>Sign out</button>
              </div>
            )}
          </div>
        ) : (
          <Link href="/login" className="btn btn-primary">Sign in</Link>
        )}
      </div>
    </header>
  );
}
