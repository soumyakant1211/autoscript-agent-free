import { describe, expect, it } from "vitest";
import { LIMITS, monthStart, nextMonthStart, tierOf } from "@/lib/quota";

describe("tierOf", () => {
  it("treats anonymous sessions as the anonymous tier regardless of role", () => {
    expect(tierOf({ isAnonymous: true, role: "admin" })).toBe("anonymous");
  });
  it("picks the most privileged role from a comma-separated list", () => {
    expect(tierOf({ role: "guest,member" })).toBe("member");
    expect(tierOf({ role: "member,admin" })).toBe("admin");
    expect(tierOf({ role: "demo_admin" })).toBe("demo_admin");
  });
  it("defaults to guest", () => {
    expect(tierOf({ role: null })).toBe("guest");
    expect(tierOf({})).toBe("guest");
  });
});

describe("LIMITS", () => {
  it("orders limits from least to most privileged", () => {
    expect(LIMITS.anonymous.generations).toBeLessThan(LIMITS.guest.generations);
    expect(LIMITS.guest.generations).toBeLessThan(LIMITS.member.generations);
    expect(LIMITS.admin.generations).toBe(Infinity);
  });
  it("gives history only to members and above", () => {
    expect(LIMITS.anonymous.history).toBe(false);
    expect(LIMITS.guest.history).toBe(false);
    expect(LIMITS.member.history).toBe(true);
  });
});

describe("month boundaries (UTC)", () => {
  it("computes the start of this and next month", () => {
    const d = new Date(Date.UTC(2026, 11, 31, 23, 59));
    expect(monthStart(d).toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(nextMonthStart(d).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});
