import "server-only";
import { and, count, eq, gte, inArray, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { usageEvent, user } from "@/db/schema";
import { auth } from "./auth";
import { clientIp, ipHash } from "./ip";
import { SANDBOX_DOMAIN, SANDBOX_TTL_HOURS, isSandboxEmail } from "./sandbox-const";

export { clientIp, ipHash };

export type Tier = "anonymous" | "guest" | "member" | "demo_admin" | "admin";

const num = (v: string | undefined, d: number) => (v === undefined || v === "" ? d : Number(v));

/** Monthly new-framework limits and per-project refinement limits. Override with env vars. */
export const LIMITS: Record<Tier, { generations: number; refinesPerProject: number; history: boolean; label: string }> = {
  anonymous: { generations: num(process.env.LIMIT_ANON, 2), refinesPerProject: 3, history: false, label: "Guest (not signed in)" },
  guest: { generations: num(process.env.LIMIT_GUEST, 5), refinesPerProject: 5, history: false, label: "Guest" },
  member: { generations: num(process.env.LIMIT_MEMBER, 50), refinesPerProject: 30, history: true, label: "Member" },
  demo_admin: { generations: num(process.env.LIMIT_DEMO_ADMIN, 5), refinesPerProject: 5, history: true, label: "Demo admin (read-only)" },
  admin: { generations: Infinity, refinesPerProject: Infinity, history: true, label: "Admin" },
};

export function tierOf(u: { role?: string | null; isAnonymous?: boolean | null }): Tier {
  if (u.isAnonymous) return "anonymous";
  const roles = (u.role || "guest").split(",").map((r) => r.trim());
  for (const r of ["admin", "demo_admin", "member"] as const) if (roles.includes(r)) return r;
  return "guest";
}

/** Demo sandboxes: each visitor (by IP) gets this many new frameworks per rolling 24 hours, across all their demo copies. */
export const DEMO_DAILY_LIMIT = num(process.env.DEMO_DAILY_LIMIT, 5);

export function monthStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
export function nextMonthStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

/** Current viewer (session + tier), or null if no session at all. */
export async function getViewer(h: Headers) {
  const session = await auth.api.getSession({ headers: h });
  if (!session) return null;
  const u = session.user as typeof session.user & { role?: string | null; isAnonymous?: boolean | null; banned?: boolean | null };
  return { session, user: u, tier: tierOf(u), sandbox: isSandboxEmail(u.email) };
}
export type Viewer = NonNullable<Awaited<ReturnType<typeof getViewer>>>;

/** How many new frameworks this viewer may still generate, and over what period. */
export async function quotaStatus(viewer: Viewer, ip: string) {
  if (viewer.sandbox) {
    const since = new Date(Date.now() - SANDBOX_TTL_HOURS * 3600_000);
    const [{ n }] = await db.select({ n: count() }).from(usageEvent)
      .innerJoin(user, eq(user.id, usageEvent.userId))
      .where(and(eq(usageEvent.ipHash, ip), eq(usageEvent.kind, "generate"), gte(usageEvent.createdAt, since), like(user.email, `%@${SANDBOX_DOMAIN}`)));
    const limit = Math.min(DEMO_DAILY_LIMIT, LIMITS[viewer.tier].generations);
    return { used: Number(n), limit, period: "day" as const, resetsAt: new Date(Date.now() + SANDBOX_TTL_HOURS * 3600_000) };
  }
  const used = await generationsUsed(viewer.user.id, viewer.tier, ip);
  return { used, limit: LIMITS[viewer.tier].generations, period: "month" as const, resetsAt: nextMonthStart() };
}

/** New-framework generations used this month. Anonymous users are also counted per IP so clearing cookies doesn't reset it. */
export async function generationsUsed(userId: string, tier: Tier, ip: string) {
  const since = monthStart();
  const [{ n: byUser }] = await db.select({ n: count() }).from(usageEvent)
    .where(and(eq(usageEvent.userId, userId), eq(usageEvent.kind, "generate"), gte(usageEvent.createdAt, since)));
  if (tier !== "anonymous") return Number(byUser);
  const [{ n: byIp }] = await db.select({ n: count() }).from(usageEvent)
    .innerJoin(user, eq(user.id, usageEvent.userId))
    .where(and(eq(usageEvent.ipHash, ip), eq(usageEvent.kind, "generate"), gte(usageEvent.createdAt, since), eq(user.isAnonymous, true)));
  return Math.max(Number(byUser), Number(byIp));
}

export async function refinesUsed(userId: string, projectId: string) {
  const [{ n }] = await db.select({ n: count() }).from(usageEvent)
    .where(and(eq(usageEvent.userId, userId), eq(usageEvent.projectId, projectId), eq(usageEvent.kind, "refine")));
  return Number(n);
}

/** Generations this month for many users at once (admin panel). */
export async function usageByUsers(userIds: string[]) {
  if (!userIds.length) return {} as Record<string, number>;
  const rows = await db.select({ userId: usageEvent.userId, n: sql<number>`count(*)::int` }).from(usageEvent)
    .where(and(inArray(usageEvent.userId, userIds), eq(usageEvent.kind, "generate"), gte(usageEvent.createdAt, monthStart())))
    .groupBy(usageEvent.userId);
  return Object.fromEntries(rows.map((r) => [r.userId!, Number(r.n)]));
}
