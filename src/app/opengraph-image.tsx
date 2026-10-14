import { ImageResponse } from "next/og";

export const alt = "AutoScript Agent — describe the app, get a test framework that runs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const LINES: [string, boolean, string][] = [
  ["stack", false, "TypeScript + Playwright Test"],
  ["write", true, "pages/LoginPage.ts"],
  ["", true, "tests/checkout.spec.ts"],
  ["", true, ".github/workflows/e2e.yml"],
  ["check", true, "9 of 9 files pass syntax checks"],
];

/** Social preview (LinkedIn, X, Slack…) generated at build time. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", background: "#0b0f17", color: "#e5ebf5" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 34, fontWeight: 700 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "#22d3a6", color: "#04131a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>{"</>"}</div>
          AutoScript Agent
        </div>
        <div style={{ display: "flex", gap: 56, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", width: 560 }}>
            <div style={{ fontSize: 66, fontWeight: 800, lineHeight: 1.04, letterSpacing: -2 }}>Describe the app. Get a test framework that runs.</div>
            <div style={{ fontSize: 26, color: "#8a97ad", marginTop: 24 }}>54 stacks. Plans, writes, syntax-checks and fixes every file.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, border: "1px solid #1f2a3a", borderRadius: 16, background: "#070a10", padding: "24px 26px", fontSize: 22, gap: 10 }}>
            {LINES.map(([tag, mark, text], i) => (
              <div key={i} style={{ display: "flex", gap: 14 }}>
                <div style={{ width: 70, color: "#8a97ad" }}>{tag}</div>
                <div style={{ width: 22, display: "flex", alignItems: "center" }}>{mark ? <div style={{ width: 10, height: 10, borderRadius: 5, background: "#22d3a6" }} /> : null}</div>
                <div style={{ color: i === LINES.length - 1 ? "#22d3a6" : "#e5ebf5" }}>{text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size
  );
}
