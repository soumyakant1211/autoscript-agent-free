export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const FILE_RE = /<<<FILE:\s*(.+?)>>>\r?\n([\s\S]*?)(<<<END FILE>>>|$)/g;

/** Extract files from streamed text. Returns files found and the one still being written (if any). */
export function parseFiles(text: string) {
  const files: [string, string][] = [];
  let writing: string | null = null;
  for (const m of text.matchAll(FILE_RE)) {
    const p = m[1].trim().replace(/^\.?\//, "");
    files.push([p, m[2].replace(/\r?\n$/, "")]);
    if (!m[3]) writing = p;
  }
  return { files, writing };
}

/** Tiny, safe markdown → HTML for chat bubbles (input is escaped first). File blocks become chips. */
export function md(src: string) {
  const prose = src.replace(FILE_RE, (_x, p) => `\n@@FILE ${String(p).trim()}@@\n`);
  const blocks: string[] = [];
  const s = prose.replace(/```\w*\n([\s\S]*?)```/g, (_m, code) => { blocks.push(code); return `\u0000${blocks.length - 1}\u0000`; });
  return esc(s.trim())
    .replace(/^@@FILE (.+?)@@$/gm, (_m, p) => `<span class="filechip" data-path="${p}">📄 ${p}</span>`)
    .replace(/^### (.+)$/gm, "<h4>$1</h4>").replace(/^##? (.+)$/gm, "<h3>$1</h3>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/^\s*(?:[-*]|\d+\.) (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, "<ul>$1</ul>")
    .replace(/(<\/span>)\n+(?=<span class="filechip")/g, "$1 ")
    .replace(/\n{2,}/g, "<br><br>").replace(/\n/g, "<br>")
    .replace(/<br>(<\/?(ul|li|h3|h4))/g, "$1").replace(/(<\/(ul|li|h3|h4)>)<br>/g, "$1")
    .replace(/\u0000(\d+)\u0000/g, (_m, i) => `<pre><code>${esc(blocks[Number(i)])}</code></pre>`);
}

/** Collapse file bodies so chat history sent back to the server stays small. */
export function compactForHistory(text: string, paths: string[]) {
  return text.replace(FILE_RE, (_m, p) => `[file ${String(p).trim()} written]`) + `\n\nProject files so far:\n${paths.map((p) => `- ${p}`).join("\n")}`;
}

export const LANG: Record<string, string> = {
  java: "java", kt: "kotlin", kts: "kotlin", ts: "typescript", tsx: "typescript", js: "javascript", mjs: "javascript", cjs: "javascript",
  py: "python", cs: "csharp", csproj: "xml", xml: "xml", jmx: "xml", json: "json", yml: "yaml", yaml: "yaml", md: "markdown",
  gradle: "groovy", groovy: "groovy", vbs: "vbscript", scala: "scala", swift: "swift", properties: "properties", toml: "ini", ini: "ini",
  sh: "bash", dockerfile: "dockerfile", feature: "plaintext", robot: "plaintext",
};

export function langFor(path: string) {
  const name = path.split("/").pop()!.toLowerCase();
  if (name === "dockerfile") return "dockerfile";
  if (name === "jenkinsfile") return "groovy";
  return LANG[name.split(".").pop() || ""];
}

export const FEATURES: { name: string; types: string[] | "*"; rec?: boolean }[] = [
  { name: "Page Object Model / Screenplay", types: ["ui", "ui-bdd", "ui-api", "mobile", "codeless"], rec: true },
  { name: "BDD feature files (Gherkin)", types: ["ui", "ui-bdd", "api", "api-bdd", "ui-api"] },
  { name: "Data-driven tests (CSV / JSON / Excel)", types: "*", rec: true },
  { name: "Environment config (dev / qa / prod)", types: "*", rec: true },
  { name: "Parallel execution", types: "*", rec: true },
  { name: "Cross-browser (Chrome, Firefox, Edge, WebKit)", types: ["ui", "ui-bdd", "ui-api"] },
  { name: "Headless mode toggle", types: ["ui", "ui-bdd", "ui-api"] },
  { name: "Android + iOS capabilities", types: ["mobile"], rec: true },
  { name: "Real-device cloud (BrowserStack / Sauce Labs / LambdaTest)", types: ["ui", "ui-bdd", "ui-api", "mobile"] },
  { name: "Selenium Grid / Docker Compose", types: ["ui", "ui-bdd"] },
  { name: "Allure reporting", types: "*", rec: true },
  { name: "Extent / HTML reports", types: "*" },
  { name: "Screenshots / video / trace on failure", types: ["ui", "ui-bdd", "ui-api", "mobile"], rec: true },
  { name: "Retry flaky tests", types: "*" },
  { name: "Structured logging", types: "*", rec: true },
  { name: "API auth (OAuth2 / JWT / API key)", types: ["api", "api-bdd", "ui-api", "perf", "security"] },
  { name: "JSON schema validation", types: ["api", "api-bdd", "ui-api"], rec: true },
  { name: "Request/response POJOs / models", types: ["api", "api-bdd", "ui-api"] },
  { name: "Test data generation (Faker)", types: "*" },
  { name: "Database validation (JDBC / SQL)", types: ["ui", "ui-bdd", "api", "api-bdd", "ui-api"] },
  { name: "Accessibility checks (axe-core)", types: ["ui", "ui-bdd", "ui-api"] },
  { name: "Visual regression snapshots", types: ["ui", "ui-bdd", "ui-api"] },
  { name: "Load profile: ramp-up / spike / soak", types: ["perf"], rec: true },
  { name: "SLA thresholds (p95, error rate)", types: ["perf"], rec: true },
  { name: "Grafana / InfluxDB / Prometheus output", types: ["perf"] },
  { name: "Baseline + full active scan", types: ["security"], rec: true },
  { name: "Authenticated scanning", types: ["security"] },
  { name: "GitHub Actions pipeline", types: "*", rec: true },
  { name: "Jenkinsfile", types: "*" },
  { name: "GitLab CI", types: "*" },
  { name: "Azure DevOps pipeline", types: "*" },
  { name: "Dockerfile to run tests", types: "*" },
  { name: "Slack / Teams notifications", types: "*" },
  { name: "Tagging & suites (smoke / regression)", types: "*", rec: true },
];

export const TYPE_NAME: Record<string, string> = {
  ui: "UI", "ui-bdd": "UI · BDD", "ui-api": "UI + API", api: "API", "api-bdd": "API · BDD",
  mobile: "Mobile", perf: "Performance", security: "Security", codeless: "Low-code",
};
