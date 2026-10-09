import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { project } from "@/db/schema";
import { getViewer } from "@/lib/quota";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const viewer = await getViewer(req.headers);
  if (!viewer) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  const row = await db.query.project.findFirst({ where: and(eq(project.id, id), eq(project.userId, viewer.user.id)) });
  if (!row) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ project: row });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const viewer = await getViewer(req.headers);
  if (!viewer) return Response.json({ error: "Not signed in." }, { status: 401 });
  if (viewer.tier === "demo_admin") return Response.json({ error: "Demo accounts are read-only." }, { status: 403 });
  const { id } = await params;
  await db.delete(project).where(and(eq(project.id, id), eq(project.userId, viewer.user.id)));
  return Response.json({ ok: true });
}
