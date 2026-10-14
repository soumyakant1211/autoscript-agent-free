import { describe, expect, it } from "vitest";
import { bracketCheck, checkFile, validateProject } from "@/lib/validate";

describe("checkFile — syntax checks per language", () => {
  const cases: [string, string, string][] = [
    ["LoginTest.java", "public class LoginTest { @Test public void ok() { int x = 1; } }", "public class LoginTest {\n  void f() {\n    int x = ;\n  }\n"],
    ["test_login.py", "import pytest\n\ndef test_ok(page):\n    assert page is not None\n", "def test_ok(page)\n    assert page\n"],
    ["LoginTests.cs", "using NUnit.Framework;\npublic class T { [Test] public void Go() { Assert.That(1, Is.EqualTo(1)); } }", "public class T { void Go() { var x = ; }"],
    ["login.spec.ts", "import { test } from '@playwright/test';\ntest('x', async ({ page }) => { await page.goto('/'); });", "test('x', async ({ page }) => { await page.goto('/';\n});"],
    ["cypress.config.js", "module.exports = { e2e: { baseUrl: 'x' } };", "module.exports = { e2e: { "],
    ["package.json", '{ "name": "x", "scripts": { "test": "jest" } }', '{ "name": "x", }'],
    ["ci.yml", "name: CI\non: [push]\njobs:\n  t:\n    runs-on: ubuntu-latest\n", "name: CI\non: [push\njobs:\n"],
    ["pom.xml", "<project><modelVersion>4.0.0</modelVersion></project>", "<project><modelVersion>4.0.0</project>"],
    ["login.feature", "Feature: Login\n  Scenario: ok\n    Given I am on the login page\n", "Given I am logged in\nFeature: Login\n"],
    ["LoginScreen.kt", "class LoginScreen { fun open() { println(\"(\") } }", "class LoginScreen { fun open() { }"],
  ];

  for (const [file, good, bad] of cases) {
    it(`${file}: accepts valid code`, async () => {
      expect(await checkFile(file, good)).toBeNull();
    });
    it(`${file}: reports invalid code`, async () => {
      const issue = await checkFile(file, bad);
      expect(issue).toBeTruthy();
      expect(issue!.severity).toBe("error");
      expect(issue!.path).toBe(file);
    });
  }

  it("reports the line of a Java syntax error", async () => {
    const issue = await checkFile("A.java", "public class A {\n  void f() {\n    int x = ;\n  }\n}\n");
    expect(issue?.line).toBe(3);
  });

  it("accepts tsconfig.json with comments and trailing commas", async () => {
    expect(await checkFile("tsconfig.json", '{\n  // strict mode\n  "compilerOptions": { "strict": true, },\n}')).toBeNull();
  });

  it("skips files it cannot check", async () => {
    expect(await checkFile("README.md", "# hi")).toBeUndefined();
    expect(await checkFile("config.properties", "a=b")).toBeUndefined();
  });
});

describe("bracketCheck", () => {
  it("ignores brackets inside strings and comments", () => {
    expect(bracketCheck("a.kt", 'val s = "(" // )\n/* } */ fun f() {}')).toBeNull();
  });
  it("finds an unclosed bracket and its line", () => {
    expect(bracketCheck("a.kt", "fun f() {\n  if (x) {\n}\n")).toMatchObject({ line: 1, message: 'Unclosed "{"' });
  });
});

describe("validateProject", () => {
  it("flags a missing build file and README", async () => {
    const r = await validateProject({ "src/test/java/A.java": "class A {}" }, "Maven");
    expect(r.errors).toBe(1);
    expect(r.issues.map((i) => i.message)).toEqual(expect.arrayContaining([expect.stringContaining("pom.xml"), "README.md is missing"]));
  });
  it("passes a small valid npm project", async () => {
    const r = await validateProject({ "package.json": '{"name":"x"}', "README.md": "# x", "tests/a.spec.ts": "export const a = 1;" }, "npm");
    expect(r).toMatchObject({ errors: 0, warnings: 0, checked: 2, skipped: 1 });
  });
});
