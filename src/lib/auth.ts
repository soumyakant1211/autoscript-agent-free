import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin as adminPlugin, anonymous, magicLink } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { ac, roles } from "./permissions";
import { sendMagicLinkEmail } from "./email";

const env = process.env;
const adminEmails = (env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

/** Only providers whose credentials are configured are enabled. */
export const enabledProviders = {
  google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  microsoft: !!(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET),
  github: !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
  magicLink: true, // without RESEND_API_KEY the link is printed to the server log (dev only)
  demo: env.DEMO_LOGINS === "1" && !!env.DEMO_PASSWORD,
  password: false,
};
// Email + password login is on when there's a private owner login and/or demo accounts.
enabledProviders.password = enabledProviders.demo || !!(env.OWNER_EMAIL && env.OWNER_PASSWORD);

export const auth = betterAuth({
  appName: "AutoScript Agent",
  // Render sets RENDER_EXTERNAL_URL automatically, so BETTER_AUTH_URL is only needed elsewhere or with a custom domain.
  baseURL: env.BETTER_AUTH_URL || env.RENDER_EXTERNAL_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),

  // Password login exists ONLY for the owner (OWNER_EMAIL/OWNER_PASSWORD) and the demo accounts; public sign-up is off.
  emailAndPassword: { enabled: enabledProviders.password, disableSignUp: true },

  socialProviders: {
    ...(enabledProviders.google && {
      google: { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET! },
    }),
    ...(enabledProviders.microsoft && {
      microsoft: {
        clientId: env.MICROSOFT_CLIENT_ID!,
        clientSecret: env.MICROSOFT_CLIENT_SECRET!,
        tenantId: env.MICROSOFT_TENANT_ID || "common", // "common" = personal + work accounts
      },
    }),
    ...(enabledProviders.github && {
      github: { clientId: env.GITHUB_CLIENT_ID!, clientSecret: env.GITHUB_CLIENT_SECRET! },
    }),
  },

  account: { accountLinking: { enabled: true, trustedProviders: ["google", "microsoft", "github"] } },

  databaseHooks: {
    user: {
      create: {
        // Emails listed in ADMIN_EMAILS become admin on first sign-in.
        before: async (user) => {
          const email = String(user.email || "").toLowerCase();
          if (adminEmails.includes(email)) return { data: { ...user, role: "admin" } };
          return { data: user };
        },
      },
    },
  },

  plugins: [
    adminPlugin({ ac, roles, defaultRole: "guest", adminRoles: ["admin"] }),
    anonymous({
      generateName: () => "Guest",
      // When an anonymous visitor signs in, carry their usage over so the quota can't be reset that way.
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        await db.update(schema.usageEvent).set({ userId: newUser.user.id })
          .where(eq(schema.usageEvent.userId, anonymousUser.user.id));
      },
    }),
    magicLink({
      sendMagicLink: async ({ email, url }) => sendMagicLinkEmail(email, url),
    }),
    nextCookies(), // must be last
  ],
});

export type Session = typeof auth.$Infer.Session;
