import { sql } from "drizzle-orm";
import { db } from "@/db";
import { MOCK, MODEL, PROVIDER } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function GET() {
  let database = "ok";
  try { await db.execute(sql`select 1`); } catch { database = "error"; }
  return Response.json({ ok: database === "ok", database, provider: PROVIDER, model: MOCK ? "mock" : MODEL }, { status: database === "ok" ? 200 : 503 });
}
