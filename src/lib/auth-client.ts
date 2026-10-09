"use client";
import { createAuthClient } from "better-auth/react";
import { adminClient, anonymousClient, magicLinkClient } from "better-auth/client/plugins";
import { ac, roles } from "./permissions";

export const authClient = createAuthClient({
  plugins: [adminClient({ ac, roles }), anonymousClient(), magicLinkClient()],
});

export const { useSession, signIn, signOut } = authClient;
