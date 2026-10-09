import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
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

/** Private owner login: OWNER_EMAIL + OWNER_PASSWORD (set only in your hosting env vars, never shown anywhere). */
export const ownerConfigured = () => !!(process.env.OWNER_EMAIL && process.env.OWNER_PASSWORD);

/** Create the user if missing, force its role, and set/refresh its email+password login. */
async function upsertPasswordUser(o: { email: string; name: string; role: string; passwordHash: string }) {
  const email = o.email.trim().toLowerCase();
  let existing = await db.query.user.findFirst({ where: eq(user.email, email) });
  if (existing) {
    await db.update(user).set({ role: o.role, banned: false }).where(eq(user.id, existing.id));
  } else {
    const id = randomUUID();
    await db.insert(user).values({ id, email, name: o.name, emailVerified: true, role: o.role });
    existing = { id } as typeof existing & { id: string };
  }
  const uid = existing!.id;
  const cred = await db.query.account.findFirst({ where: and(eq(account.userId, uid), eq(account.providerId, "credential")) });
  if (cred) await db.update(account).set({ password: o.passwordHash }).where(eq(account.id, cred.id));
  else await db.insert(account).values({ id: randomUUID(), accountId: uid, providerId: "credential", userId: uid, password: o.passwordHash });
}

let ensured: Promise<void> | null = null;

/** Creates/refreshes the owner account and demo accounts once per server start (idempotent). */
export function ensurePasswordAccounts() {
  ensured ??= (async () => {
    if (ownerConfigured()) {
      await upsertPasswordUser({
        email: process.env.OWNER_EMAIL!, name: process.env.OWNER_NAME || "Owner", role: "admin",
        passwordHash: await hashPassword(process.env.OWNER_PASSWORD!),
      });
    }
    if (process.env.DEMO_LOGINS === "1" && process.env.DEMO_PASSWORD) {
      const hash = await hashPassword(process.env.DEMO_PASSWORD);
      // also undoes any change a visitor made to a demo account
      for (const d of Object.values(DEMO_ACCOUNTS)) await upsertPasswordUser({ email: d.email, name: d.name, role: d.role, passwordHash: hash });
    }
  })().catch((e) => { ensured = null; throw e; });
  return ensured;
}

/** Kept for the one-click demo endpoint. */
export const ensureDemoUsers = ensurePasswordAccounts;

export function demoAccountsForDisplay() {
  return Object.values(DEMO_ACCOUNTS).map((d) => ({ label: d.label, note: d.note, email: d.email, password: process.env.DEMO_PASSWORD || "" }));
}
