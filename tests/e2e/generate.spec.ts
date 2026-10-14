import { test, expect, continueAsGuest, generate } from "./fixtures";

test.describe("Generating a framework (mock AI)", () => {
  test("plans, writes, finds and fixes a syntax error, then offers a ZIP", async ({ page }) => {
    await continueAsGuest(page);
    await generate(page, "Login to saucedemo with valid and invalid users [mock:broken]");

    // Plan → Write → Check → Fix progress, then the validation badge
    const chat = page.locator("section", { hasText: "Talk to the agent" });
    await expect(chat.getByTestId("validation-badge")).toBeVisible({ timeout: 20_000 });
    await expect(chat).toContainText("auto-fixed in 1 round");

    // File explorer shows the generated project
    const tree = page.locator("nav").filter({ hasText: "package.json" });
    for (const f of ["package.json", "playwright.config.ts", "login.spec.ts", "README.md"]) await expect(tree).toContainText(f);

    // The fixed file is what's shown, not the broken first draft
    await tree.getByText("login.spec.ts").click();
    await expect(page.locator("pre code")).toContainText('await page.goto("/");');

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "⬇ ZIP" }).click();
    expect((await download).suggestedFilename()).toBe("ts-playwright-framework.zip");
  });

  test("follow-up changes go through the chat", async ({ page }) => {
    await continueAsGuest(page);
    await generate(page);
    await expect(page.getByTestId("validation-badge")).toBeVisible({ timeout: 20_000 });
    const input = page.getByPlaceholder(/Ask for changes/);
    await input.fill("add a logout test");
    await input.press("Enter");
    await expect(page.getByText("add a logout test")).toBeVisible();
    await expect(page.getByTestId("validation-badge").nth(1)).toBeVisible({ timeout: 20_000 });
  });

  test("guest monthly limit is enforced and explained", async ({ page }) => {
    await continueAsGuest(page);
    for (let i = 0; i < 2; i++) {
      await generate(page);
      await expect(page.getByTestId("validation-badge").nth(i)).toBeVisible({ timeout: 20_000 });
    }
    await expect(page.getByRole("button", { name: "Monthly limit reached" })).toBeDisabled();
    await expect(page.locator("header")).toContainText("0 of 2 left this month");
  });
});
