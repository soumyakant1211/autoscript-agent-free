"use client";
import Link from "next/link";
import { useMe } from "@/components/MeProvider";

/** Primary call to action that adapts to whether the visitor is already signed in. */
export function LandingCta({ secondary = true }: { secondary?: boolean }) {
  const { me } = useMe();
  const signedIn = !!me?.user;
  return (
    <div className="lp-ctas">
      <Link href={signedIn ? "/app" : "/login"} className="lp-btn lp-btn-main">{signedIn ? "Open the generator" : "Try it free"}</Link>
      {secondary && !signedIn && <Link href="/login#demo" className="lp-btn lp-btn-ghost">Use a demo account</Link>}
    </div>
  );
}

export function LandingNavAuth() {
  const { me } = useMe();
  if (me?.user) return <Link href="/app" className="lp-nav-link lp-nav-strong">Open the generator</Link>;
  return (
    <>
      <Link href="/login" className="lp-nav-link lp-signin">Sign in</Link>
      <Link href="/login" className="lp-btn lp-btn-main lp-btn-sm">Try it free</Link>
    </>
  );
}
