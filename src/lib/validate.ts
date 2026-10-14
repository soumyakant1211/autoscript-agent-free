import "server-only";
import path from "node:path";
import { Parser, Language, type Node as TSNode } from "web-tree-sitter";
import YAML from "yaml";
import { XMLValidator } from "fast-xml-parser";
import { AstBuilder, GherkinClassicTokenMatcher, Parser as GherkinParser } from "@cucumber/gherkin";
import { IdGenerator } from "@cucumber/messages";

export type Issue = { path: string; line?: number; message: string; severity: "error" | "warning" };
export type ValidationReport = { checked: number; skipped: number; issues: Issue[]; errors: number; warnings: number };

const GRAMMAR: Record<string, string> = {
  java: "java", py: "python", cs: "c-sharp",
  ts: "typescript", mts: "typescript", cts: "typescript", tsx: "tsx",
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
};
const BRACKET_ONLY = new Set(["kt", "kts", "swift", "scala", "groovy", "gradle"]);
const XML_EXT = new Set(["xml", "jmx", "csproj", "props", "targets", "runsettings", "config", "resx", "xsd"]);

let initPromise: Promise<void> | null = null;
const languages = new Map<string, Promise<Language>>();
const grammarDir = () => path.join(process.cwd(), "node_modules", "@vscode", "tree-sitter-wasm", "wasm");

function language(name: string) {
  initPromise ??= Parser.init();
  if (!languages.has(name)) languages.set(name, initPromise.then(() => Language.load(path.join(grammarDir(), `tree-sitter-${name}.wasm`))));
  return languages.get(name)!;
}

function firstError(node: TSNode): TSNode | null {
  if (node.type === "ERROR" || node.isMissing) return node;
  for (const c of node.children) {
    if (c && (c.hasError || c.isMissing)) { const f = firstError(c); if (f) return f; }
  }
  return null;
}

async function syntaxTreeCheck(p: string, src: string, grammar: string): Promise<Issue | null> {
  const lang = await language(grammar);
  const parser = new Parser();
  try {
    parser.setLanguage(lang);
    const tree = parser.parse(src);
    if (!tree) return null;
    const root = tree.rootNode;
    if (!root.hasError) { tree.delete(); return null; }
    const e = firstError(root);
    const line = e ? e.startPosition.row + 1 : undefined;
    const near = e ? src.split("\n")[e.startPosition.row]?.trim().slice(0, 80) : "";
    const message = e?.isMissing ? `Syntax error: missing "${e.type}"` : `Syntax error${near ? ` near: ${near}` : ""}`;
    tree.delete();
    return { path: p, line, message, severity: "error" };
  } finally {
    parser.delete();
  }
}

/** Cheap check for languages without a bundled grammar: brackets must balance (strings/comments ignored). */
export function bracketCheck(p: string, src: string): Issue | null {
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  const stack: { ch: string; line: number }[] = [];
  let line = 1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\n") { line++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; line++; continue; }
    if (c === "/" && src[i + 1] === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") line++; i++; } i++; continue; }
    if (c === '"' && src.startsWith('"""', i)) { i += 3; while (i < src.length && !src.startsWith('"""', i)) { if (src[i] === "\n") line++; i++; } i += 2; continue; }
    if (c === '"' || c === "'") { const q = c; i++; while (i < src.length && src[i] !== q && src[i] !== "\n") { if (src[i] === "\\") i++; i++; } if (src[i] === "\n") line++; continue; }
    if (c === "(" || c === "[" || c === "{") stack.push({ ch: c, line });
    else if (c in pairs) {
      const top = stack.pop();
      if (!top || top.ch !== pairs[c]) return { path: p, line, message: `Unbalanced "${c}"`, severity: "error" };
    }
  }
  if (stack.length) { const t = stack[stack.length - 1]; return { path: p, line: t.line, message: `Unclosed "${t.ch}"`, severity: "error" }; }
  return null;
}

const stripJsonComments = (s: string) => s.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str ?? "").replace(/,(\s*[}\]])/g, "$1");

function jsonCheck(p: string, src: string): Issue | null {
  const lenient = /(^|\/)(tsconfig[^/]*|jsconfig[^/]*|\.eslintrc|settings|launch|extensions)\.json$/.test(p) || p.endsWith(".jsonc");
  try { JSON.parse(lenient ? stripJsonComments(src) : src); return null; } catch (e) {
    const m = /position (\d+)/.exec(String(e));
    const line = m ? src.slice(0, Number(m[1])).split("\n").length : undefined;
    return { path: p, line, message: `Invalid JSON: ${(e as Error).message.replace(/^JSON\.parse: /, "").slice(0, 120)}`, severity: "error" };
  }
}

function yamlCheck(p: string, src: string): Issue | null {
  for (const doc of YAML.parseAllDocuments(src)) {
    const err = "errors" in doc ? doc.errors[0] : undefined;
    if (err) return { path: p, line: err.linePos?.[0]?.line, message: `Invalid YAML: ${err.message.split("\n")[0].slice(0, 140)}`, severity: "error" };
  }
  return null;
}

function xmlCheck(p: string, src: string): Issue | null {
  const r = XMLValidator.validate(src, { allowBooleanAttributes: true });
  if (r === true) return null;
  return { path: p, line: r.err.line, message: `Invalid XML: ${r.err.msg}`, severity: "error" };
}

function gherkinCheck(p: string, src: string): Issue | null {
  try {
    new GherkinParser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher()).parse(src);
    return null;
  } catch (e) {
    const msg = (e as Error).message.split("\n")[0];
    const m = /\((\d+):\d+\)/.exec(msg);
    return { path: p, line: m ? Number(m[1]) : undefined, message: `Invalid Gherkin: ${msg.replace(/^Parser errors:\s*/, "").slice(0, 140)}`, severity: "error" };
  }
}

/** Syntax-check one file. Returns undefined if this file type isn't checked. */
export async function checkFile(p: string, src: string): Promise<Issue | null | undefined> {
  if (src.length > 400_000) return undefined;
  const name = p.split("/").pop()!.toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop()! : name;
  if (GRAMMAR[ext]) return syntaxTreeCheck(p, src, GRAMMAR[ext]);
  if (ext === "json" || ext === "jsonc") return jsonCheck(p, src);
  if (ext === "yml" || ext === "yaml") return yamlCheck(p, src);
  if (XML_EXT.has(ext)) return xmlCheck(p, src);
  if (ext === "feature") return gherkinCheck(p, src);
  if (BRACKET_ONLY.has(ext) || name === "jenkinsfile") return bracketCheck(p, src);
  return undefined;
}

const BUILD_FILES: Record<string, (paths: string[]) => boolean> = {
  Maven: (ps) => ps.some((p) => /(^|\/)pom\.xml$/.test(p)),
  Gradle: (ps) => ps.some((p) => /(^|\/)build\.gradle(\.kts)?$/.test(p)),
  npm: (ps) => ps.some((p) => /(^|\/)package\.json$/.test(p)),
  pip: (ps) => ps.some((p) => /(^|\/)(requirements[^/]*\.txt|pyproject\.toml|setup\.py)$/.test(p)),
  ".NET": (ps) => ps.some((p) => /\.csproj$/.test(p)),
};
const BUILD_LABEL: Record<string, string> = { Maven: "pom.xml", Gradle: "build.gradle(.kts)", npm: "package.json", pip: "requirements.txt or pyproject.toml", ".NET": "a .csproj file" };

/** Validate a whole project: syntax of every file + required project files. */
export async function validateProject(files: Record<string, string>, build?: string): Promise<ValidationReport> {
  const issues: Issue[] = [];
  let checked = 0, skipped = 0;
  const paths = Object.keys(files);
  for (const p of paths) {
    let r: Issue | null | undefined;
    try { r = await checkFile(p, files[p]); } catch (e) { console.warn("[validate]", p, (e as Error).message); r = undefined; }
    if (r === undefined) skipped++; else { checked++; if (r) issues.push(r); }
  }
  if (!paths.some((p) => /(^|\/)readme\.md$/i.test(p))) issues.push({ path: "README.md", message: "README.md is missing", severity: "warning" });
  if (build && BUILD_FILES[build] && !BUILD_FILES[build](paths))
    issues.push({ path: BUILD_LABEL[build], message: `Build file ${BUILD_LABEL[build]} is missing`, severity: "error" });
  const errors = issues.filter((i) => i.severity === "error").length;
  return { checked, skipped, issues, errors, warnings: issues.length - errors };
}
