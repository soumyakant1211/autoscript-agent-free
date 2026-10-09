import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { project } from "@/db/schema";
import { STACK_INDEX } from "@/lib/prompt";
import { LIMITS, getViewer } from "@/lib/quota";

const MAX_BYTES = 2_000_000;

/** List my saved projects. */
export async function GET(req: Request) {
  const viewer = await getViewer(req.headers);
  if (!viewer || !LIMITS[viewer.tier].history) return Response.json({ projects: [] });
  const rows = await db.select({ id: project.id, title: project.title, stackId: project.stackId, updatedAt: project.updatedAt })
    .from(project).where(eq(project.userId, viewer.user.id)).orderBy(desc(project.updatedAt)).limit(100);
  return Response.json({ projects: rows.map((r) => ({ ...r, stackLabel: STACK_INDEX[r.stackId]?.label || r.stackId })) });
}

/** Save / update a project (members, demo admins and admins). */
export async function POST(req: Request) {
  const viewer = await getViewer(req.headers);
  if (!viewer) return Response.json({ error: "Not signed in." }, { status: 401 });
  if (!LIMITS[viewer.tier].history) return Response.json({ error: "History is available for Members." }, { status: 403 });

  const raw = await req.text();
  if (raw.length > MAX_BYTES) return Response.json({ error: "Project too large to save." }, { status: 413 });
  const b = JSON.parse(raw || "{}") as { id?: string; stackId?: string; title?: string; files?: Record<string, string>; messages?: { role: string; content: string }[] };
  if (!b.id || !/^[\w-]{8,64}$/.test(b.id) || !STACK_INDEX[b.stackId || ""]) return Response.json({ error: "Invalid project." }, { status: 400 });

  const values = {
    stackId: b.stackId!, title: String(b.title || "Untitled").slice(0, 120),
    files: b.files || {}, messages: (b.messages || []).slice(-30), updatedAt: new Date(),
  };
  const existing = await db.query.project.findFirst({ where: eq(project.id, b.id) });
  if (existing && existing.userId !== viewer.user.id) return Response.json({ error: "Not your project." }, { status: 403 });
  if (existing) await db.update(project).set(values).where(and(eq(project.id, b.id), eq(project.userId, viewer.user.id)));
  else await db.insert(project).values({ id: b.id, userId: viewer.user.id, ...values });
  return Response.json({ ok: true });
}
