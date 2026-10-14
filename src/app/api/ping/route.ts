export const dynamic = "force-dynamic";

/**
 * Keep-alive endpoint for uptime monitors. Deliberately does NOT touch the database,
 * so pinging it every few minutes keeps the web server awake while Neon can still sleep
 * (an always-awake database would use up Neon's free compute hours).
 */
export function GET() {
  return Response.json({ ok: true, ts: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
