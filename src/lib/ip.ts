import { createHash } from "node:crypto";

/**
 * Best-effort real client IP behind Render's proxy.
 * - Cloudflare's CF-Connecting-IP / True-Client-IP are set by the edge and can't be spoofed by the client.
 * - Otherwise use X-Forwarded-For counted from the RIGHT: clients can prepend fake entries, but the
 *   entries added by our own proxies are trustworthy. TRUSTED_PROXY_HOPS = how many proxy entries sit at
 *   the end (Render: 1 → the client is the second-to-last entry).
 */
export function clientIp(h: Headers) {
  const edge = h.get("cf-connecting-ip") || h.get("true-client-ip");
  if (edge) return edge.trim();
  const xff = (h.get("x-forwarded-for") || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (xff.length) {
    const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 1);
    return xff[Math.max(0, xff.length - 1 - hops)] || xff[0];
  }
  return (h.get("x-real-ip") || "unknown").trim();
}

/** Salted hash so raw IPs are never stored. */
export function ipHash(h: Headers) {
  return createHash("sha256").update(clientIp(h) + (process.env.BETTER_AUTH_SECRET || "")).digest("hex").slice(0, 32);
}
