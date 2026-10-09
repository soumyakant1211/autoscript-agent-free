import { headers } from "next/headers";
import { enabledProviders } from "@/lib/auth";
import { MOCK, MODEL, PROVIDER } from "@/lib/ai";
import { LIMITS, generationsUsed, getViewer, ipHash, nextMonthStart } from "@/lib/quota";

/** Who am I, what can I do, and how much quota is left. Also tells the UI which login buttons to show. */
export async function GET() {
  const h = await headers();
  const viewer = await getViewer(h);
  const providers = enabledProviders;
  const ai = { provider: PROVIDER, model: MOCK ? "mock" : MODEL };
  if (!viewer) return Response.json({ user: null, providers, ai });

  const limit = LIMITS[viewer.tier];
  const used = await generationsUsed(viewer.user.id, viewer.tier, ipHash(h));
  return Response.json({
    user: { id: viewer.user.id, name: viewer.user.name, email: viewer.tier === "anonymous" ? null : viewer.user.email, image: viewer.user.image, role: viewer.user.role },
    tier: viewer.tier,
    tierLabel: limit.label,
    quota: {
      used,
      limit: Number.isFinite(limit.generations) ? limit.generations : null,
      refinesPerProject: Number.isFinite(limit.refinesPerProject) ? limit.refinesPerProject : null,
      resetsAt: nextMonthStart().toISOString(),
    },
    canSaveHistory: limit.history,
    canViewAdmin: viewer.tier === "admin" || viewer.tier === "demo_admin",
    canManageUsers: viewer.tier === "admin",
    providers,
    ai,
  });
}
