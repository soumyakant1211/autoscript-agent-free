import { auth, enabledProviders } from "@/lib/auth";
import { DEMO_ACCOUNTS, ensureDemoUsers, type DemoKind } from "@/lib/demo";

/** One-click demo sign-in (only when DEMO_LOGINS=1). Demo admin is read-only. */
export async function POST(req: Request) {
  if (!enabledProviders.demo) return Response.json({ error: "Demo logins are disabled." }, { status: 404 });
  const { as } = (await req.json().catch(() => ({}))) as { as?: DemoKind };
  const demo = as && DEMO_ACCOUNTS[as];
  if (!demo) return Response.json({ error: "Unknown demo account." }, { status: 400 });
  await ensureDemoUsers();
  return auth.api.signInEmail({
    body: { email: demo.email, password: process.env.DEMO_PASSWORD! },
    headers: req.headers,
    asResponse: true,
  });
}
