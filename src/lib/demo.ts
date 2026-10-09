import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/db";
import { account, user } from "@/db/schema";

/** Shared demo accounts for recruiters/visitors. Their password (DEMO_PASSWORD) is shown on the sign-in page. */
export const DEMO_ACCOUNTS = {
  admin: { email: "demo-admin@autoscript.demo", name: "Demo Admin", role: "demo_admin", label: "Demo Admin", note: "Read-only admin panel" },
  member: { email: "demo-member@autoscript.demo", name: "Demo Member", role: "member", label: "Demo Member", note: "History + 50/month" },
  guest: { email: "demo-guest@autoscript.demo", name: "Demo Guest", role: "guest", label: "Demo Guest", note: "5/month, no history" },
} as const;
export type DemoKind = keyof typeof DEMO_ACCOUNTS;

let ensured: Promise<void> | null = null;

/** Creates/refreshes the demo accounts once per server start (idempotent). */
export function ensureDemoUsers() {
  ensured ??= (async () => {
    const password = process.env.DEMO_PASSWORD;
    if (!password) throw new Error("DEMO_PASSWORD is not set");
    const hash = await hashPassword(password);
    for (const d of Object.values(DEMO_ACCOUNTS)) {
      const existing = await db.query.user.findFirst({ where: eq(user.email, d.email) });
      if (existing) {
        // keep role and password in sync with config (also undoes any change a visitor made)
        await db.update(user).set({ role: d.role, banned: false, name: d.name }).where(eq(user.id, existing.id));
        const cred = await db.query.account.findFirst({ where: eq(account.userId, existing.id) });
        if (cred) await db.update(account).set({ password: hash }).where(eq(account.userId, existing.id));
        else await db.insert(account).values({ id: randomUUID(), accountId: existing.id, providerId: "credential", userId: existing.id, password: hash });
        continue;
      }
      const id = randomUUID();
      await db.insert(user).values({ id, email: d.email, name: d.name, emailVerified: true, role: d.role });
      await db.insert(account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash });
    }
  })().catch((e) => { ensured = null; throw e; });
  return ensured;
}

export function demoAccountsForDisplay() {
  return Object.values(DEMO_ACCOUNTS).map((d) => ({ label: d.label, note: d.note, email: d.email, password: process.env.DEMO_PASSWORD || "" }));
}
