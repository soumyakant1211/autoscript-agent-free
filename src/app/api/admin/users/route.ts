import { desc, eq, gte, ilike, or, sql, and } from "drizzle-orm";
import { db } from "@/db";
import { usageEvent, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { DEMO_ACCOUNTS } from "@/lib/demo";
import { ROLE_ORDER } from "@/lib/permissions";
import { STACK_INDEX } from "@/lib/prompt";
import { getViewer, monthStart, tierOf, usageByUsers } from "@/lib/quota";

const mask = (email: string) => email.replace(/^(.{2})[^@]*(@.*)$/, "$1***$2");
const demoEmails = new Set<string>(Object.values(DEMO_ACCOUNTS).map((d) => d.email));

/** Users + usage. Admin sees everything; demo admin sees masked emails and cannot change anything. */
export async function GET(req: Request) {
  const viewer = await getViewer(req.headers);
  if (!viewer || (viewer.tier !== "admin" && viewer.tier !== "demo_admin")) return Response.json({ error: "Admins only." }, { status: 403 });
  const readOnly = viewer.tier !== "admin";
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").slice(0, 100);
  const showAnon = url.searchParams.get("anon") === "1";

  const where = and(
    showAnon ? undefined : eq(user.isAnonymous, false),
    q ? or(ilike(user.email, `%${q}%`), ilike(user.name, `%${q}%`)) : undefined
  );
  const rows = await db.select().from(user).where(where).orderBy(desc(user.createdAt)).limit(200);
  const usage = await usageByUsers(rows.map((r) => r.id));

  const since = monthStart();
  const [totals] = await db.select({
    generations: sql<number>`count(*) filter (where ${usageEvent.kind} = 'generate')::int`,
    refines: sql<number>`count(*) filter (where ${usageEvent.kind} = 'refine')::int`,
  }).from(usageEvent).where(gte(usageEvent.createdAt, since));
  const topStacks = await db.select({ stackId: usageEvent.stackId, n: sql<number>`count(*)::int` }).from(usageEvent)
    .where(and(gte(usageEvent.createdAt, since), eq(usageEvent.kind, "generate"))).groupBy(usageEvent.stackId)
    .orderBy(desc(sql`count(*)`)).limit(5);
  const byRole = await db.select({ role: user.role, anon: user.isAnonymous, n: sql<number>`count(*)::int` }).from(user).groupBy(user.role, user.isAnonymous);

  return Response.json({
    readOnly,
    roles: ROLE_ORDER,
    stats: {
      generationsThisMonth: totals?.generations ?? 0,
      refinesThisMonth: totals?.refines ?? 0,
      usersByTier: byRole.reduce<Record<string, number>>((acc, r) => {
        const t = tierOf({ role: r.role, isAnonymous: r.anon }); acc[t] = (acc[t] || 0) + Number(r.n); return acc;
      }, {}),
      topStacks: topStacks.map((s) => ({ label: STACK_INDEX[s.stackId]?.label || s.stackId, count: Number(s.n) })),
    },
    users: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.isAnonymous ? "—" : readOnly && !demoEmails.has(r.email) ? mask(r.email) : r.email,
      role: r.role || "guest",
      tier: tierOf(r),
      banned: !!r.banned,
      isDemo: demoEmails.has(r.email),
      isSelf: r.id === viewer.user.id,
      generationsThisMonth: usage[r.id] || 0,
      createdAt: r.createdAt,
    })),
  });
}

/** Change a user's role or ban state (real admins only; enforced again by Better Auth's access control). */
export async function PATCH(req: Request) {
  const viewer = await getViewer(req.headers);
  if (!viewer || viewer.tier !== "admin") return Response.json({ error: viewer?.tier === "demo_admin" ? "The demo admin is read-only." : "Admins only." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { userId?: string; role?: string; banned?: boolean };
  if (!b.userId) return Response.json({ error: "Missing userId." }, { status: 400 });
  if (b.userId === viewer.user.id) return Response.json({ error: "You can't change your own role or ban yourself." }, { status: 400 });
  const target = await db.query.user.findFirst({ where: eq(user.id, b.userId) });
  if (!target) return Response.json({ error: "User not found." }, { status: 404 });
  if (demoEmails.has(target.email)) return Response.json({ error: "Demo accounts are managed by configuration." }, { status: 400 });

  if (b.role !== undefined) {
    if (!ROLE_ORDER.includes(b.role as never)) return Response.json({ error: "Unknown role." }, { status: 400 });
    if (target.isAnonymous) return Response.json({ error: "Anonymous guests can't be given a role — they need to sign in first." }, { status: 400 });
    await auth.api.setRole({ body: { userId: b.userId, role: b.role as never }, headers: req.headers });
  }
  if (b.banned === true) await auth.api.banUser({ body: { userId: b.userId, banReason: "Banned by admin" }, headers: req.headers });
  if (b.banned === false) await auth.api.unbanUser({ body: { userId: b.userId }, headers: req.headers });
  return Response.json({ ok: true });
}
