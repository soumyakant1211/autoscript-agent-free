import { describe, expect, it } from "vitest";
import { batchFiles, extractJson, normalisePlan, type ProjectPlan } from "@/lib/pipeline";

describe("extractJson", () => {
  it("parses JSON wrapped in prose and code fences", () => {
    expect(extractJson<{ a: number }>('Sure!\n```json\n{ "a": 1 }\n```\nDone.')).toEqual({ a: 1 });
  });
  it("returns null for invalid JSON", () => {
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson("{ broken")).toBeNull();
  });
});

describe("normalisePlan", () => {
  const plan = (files: unknown[]): ProjectPlan => ({ summary: ["s"], files: files as ProjectPlan["files"], howToRun: "run" });

  it("deduplicates paths, strips ./ and Windows slashes", () => {
    const p = normalisePlan(plan([{ path: "./a/B.java", purpose: "x" }, { path: "a\\B.java", purpose: "dup" }, { path: "c.md", purpose: "y" }]));
    expect(p!.files.map((f) => f.path)).toEqual(["a/B.java", "c.md"]);
  });
  it("drops path traversal and empty entries", () => {
    const p = normalisePlan(plan([{ path: "../etc/passwd", purpose: "" }, { path: "  ", purpose: "" }, { path: "ok.ts", purpose: "" }]));
    expect(p!.files.map((f) => f.path)).toEqual(["ok.ts"]);
  });
  it("caps the plan at 40 files", () => {
    const p = normalisePlan(plan(Array.from({ length: 60 }, (_, i) => ({ path: `f${i}.ts`, purpose: "" }))));
    expect(p!.files).toHaveLength(40);
  });
  it("rejects a plan with no files", () => {
    expect(normalisePlan(plan([]))).toBeNull();
    expect(normalisePlan(null)).toBeNull();
  });
});

describe("batchFiles", () => {
  it("splits files into fixed-size batches", () => {
    const files = Array.from({ length: 11 }, (_, i) => ({ path: `f${i}`, purpose: "" }));
    expect(batchFiles(files, 5).map((b) => b.length)).toEqual([5, 5, 1]);
  });
});
