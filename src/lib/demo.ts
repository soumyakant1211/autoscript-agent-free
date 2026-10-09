import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/db";
import { account, user } from "@/db/schema";

export const DEMO_ACCOUNTS = {
  admin: { email: "demo-admin@autoscript.demo", name: "Demo Admin", role: "demo_admin" },
  member: { email: "demo-member@autoscript.demo", name: "Demo Member", role: "member" },
} as const;
export type DemoKind = keyof typeof DEMO_ACCOUNTS;

let ensured = false;

/** Creates the demo accounts once (idempotent). Password comes from DEMO_PASSWORD. */
export async function ensureDemoUsers() {
  if (ensured) return;
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error("DEMO_PASSWORD is not set");
  const hash = await hashPassword(password);
  for (const d of Object.values(DEMO_ACCOUNTS)) {
    const existing = await db.query.user.findFirst({ where: eq(user.email, d.email) });
    if (existing) {
      // keep role and password in sync with config
      await db.update(user).set({ role: d.role }).where(eq(user.id, existing.id));
      await db.update(account).set({ password: hash }).where(eq(account.userId, existing.id));
      continue;
    }
    const id = randomUUID();
    await db.insert(user).values({ id, email: d.email, name: d.name, emailVerified: true, role: d.role });
    await db.insert(account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash });
  }
  ensured = true;
}
