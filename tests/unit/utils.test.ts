import { describe, expect, it } from "vitest";
import { md, parseFiles, compactForHistory, langFor } from "@/lib/client-utils";
import { clientIp, ipHash } from "@/lib/ip";
import { isSandboxEmail, SANDBOX_DOMAIN } from "@/lib/sandbox-const";

describe("parseFiles", () => {
  it("extracts complete files and reports the one still being written", () => {
    const text = "## Plan\n<<<FILE: a.ts>>>\nconst a = 1;\n<<<END FILE>>>\n<<<FILE: b.ts>>>\nconst b";
    const r = parseFiles(text);
    expect(r.files).toEqual([["a.ts", "const a = 1;"], ["b.ts", "const b"]]);
    expect(r.writing).toBe("b.ts");
  });
  it("later blocks for the same path win (auto-fix overwrites)", () => {
    const r = parseFiles("<<<FILE: a.ts>>>\nbad(\n<<<END FILE>>>\n<<<FILE: a.ts>>>\ngood()\n<<<END FILE>>>\n");
    expect(Object.fromEntries(r.files)["a.ts"]).toBe("good()");
  });
});

describe("md (chat renderer)", () => {
  it("escapes HTML from the model so it can't inject markup", () => {
    const html = md('<img src=x onerror="alert(1)"> **bold**');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("<b>bold</b>");
  });
  it("turns file blocks into clickable chips", () => {
    expect(md("<<<FILE: src/a.ts>>>\nx\n<<<END FILE>>>")).toContain('data-path="src/a.ts"');
  });
});

describe("compactForHistory", () => {
  it("replaces file bodies with short markers", () => {
    const out = compactForHistory("<<<FILE: a.ts>>>\n" + "x".repeat(5000) + "\n<<<END FILE>>>", ["a.ts"]);
    expect(out.length).toBeLessThan(200);
    expect(out).toContain("[file a.ts written]");
  });
});

describe("langFor", () => {
  it("maps file names to highlighter languages", () => {
    expect(langFor("Dockerfile")).toBe("dockerfile");
    expect(langFor("Jenkinsfile")).toBe("groovy");
    expect(langFor("src/LoginTest.java")).toBe("java");
  });
});

describe("clientIp", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("prefers Cloudflare's header, which clients can't spoof", () => {
    expect(clientIp(h({ "cf-connecting-ip": "5.5.5.5", "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("5.5.5.5");
  });
  it("ignores entries a client prepends to X-Forwarded-For", () => {
    expect(clientIp(h({ "x-forwarded-for": "9.9.9.9, 1.1.1.1, 10.0.0.1" }))).toBe("1.1.1.1");
    expect(clientIp(h({ "x-forwarded-for": "1.1.1.1, 10.0.0.1" }))).toBe("1.1.1.1");
  });
  it("hashes IPs instead of storing them", () => {
    const a = ipHash(h({ "x-forwarded-for": "1.1.1.1, 10.0.0.1" }));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain("1.1.1.1");
    expect(ipHash(h({ "x-forwarded-for": "2.2.2.2, 10.0.0.1" }))).not.toBe(a);
  });
});

describe("isSandboxEmail", () => {
  it("recognises private demo copies only", () => {
    expect(isSandboxEmail(`member-ab12cd.0123456789@${SANDBOX_DOMAIN}`)).toBe(true);
    expect(isSandboxEmail("demo-member@autoscript.demo")).toBe(false);
    expect(isSandboxEmail(null)).toBe(false);
  });
});
