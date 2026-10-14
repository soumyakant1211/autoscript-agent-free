/** Private demo copies get emails on this domain and are deleted after SANDBOX_TTL_HOURS. */
export const SANDBOX_DOMAIN = "sandbox.autoscript.demo";
export const SANDBOX_TTL_HOURS = 24;
export const isSandboxEmail = (email?: string | null) => !!email && email.toLowerCase().endsWith("@" + SANDBOX_DOMAIN);
