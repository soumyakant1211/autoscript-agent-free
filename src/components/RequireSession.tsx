"use client";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useMe } from "./MeProvider";

/** Client-side guard (the proxy already redirects when there's no cookie; this catches expired sessions). */
export function RequireSession({ children }: { children: ReactNode }) {
  const { me, loading } = useMe();
  const router = useRouter();
  const ok = !!me?.user;
  useEffect(() => {
    if (!loading && !ok) {
      const path = window.location.pathname;
      router.replace(path === "/" ? "/login" : `/login?next=${encodeURIComponent(path)}`);
    }
  }, [loading, ok, router]);
  if (!ok) return <div className="grid flex-1 place-items-center p-10 text-muted">Loading…</div>;
  return <>{children}</>;
}
