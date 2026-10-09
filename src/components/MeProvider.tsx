"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Me = {
  user: { id: string; name: string; email: string | null; image: string | null; role: string | null } | null;
  tier?: "anonymous" | "guest" | "member" | "demo_admin" | "admin";
  tierLabel?: string;
  quota?: { used: number; limit: number | null; refinesPerProject: number | null; resetsAt: string };
  canSaveHistory?: boolean;
  canViewAdmin?: boolean;
  canManageUsers?: boolean;
  providers: { google: boolean; microsoft: boolean; github: boolean; magicLink: boolean; demo: boolean; password: boolean };
  ai: { provider: string; model: string };
  demoAccounts?: { label: string; note: string; email: string; password: string }[];
};

const Ctx = createContext<{ me: Me | null; loading: boolean; refresh: () => Promise<Me | null> }>({
  me: null, loading: true, refresh: async () => null,
});

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/me", { cache: "no-store" });
      const j = (await r.json()) as Me;
      setMe(j); return j;
    } catch { return null; } finally { setLoading(false); }
  }, []);
  // Load the session once on mount (client-side fetch; pages are static shells).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refresh(); }, [refresh]);
  return <Ctx value={{ me, loading, refresh }}>{children}</Ctx>;
}

export const useMe = () => useContext(Ctx);
