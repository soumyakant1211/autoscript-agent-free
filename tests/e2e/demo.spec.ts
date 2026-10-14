import { test, expect, useDemoAccount, generate } from "./fixtures";

test.describe("Demo accounts for recruiters", () => {
  test("credentials are shown on the sign-in page", async ({ page }) => {
    await page.goto("/login#demo");
    const box = page.locator("#demo");
    await expect(box).toContainText("demo-admin@autoscript.demo");
    await expect(box).toContainText("demo-member@autoscript.demo");
    await expect(box).toContainText("Recruiter@2026");
    await expect(box).toContainText("private copy");
  });

  test("each visitor gets a private copy of the demo member", async ({ page, browser }) => {
    await useDemoAccount(page, "Demo Member");
    await expect(page.locator("header")).toContainText("Member · private demo");
    await expect(page.locator("header")).toContainText("5 of 5 left today");
    const mine = (await (await page.request.get("/api/me")).json()).user.email as string;
    expect(mine).toMatch(/@sandbox\.autoscript\.demo$/);

    // A second visitor (different IP) using the same credentials lands in a different sandbox.
    const other = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "10.250.250.250" } });
    const p2 = await other.newPage();
    await useDemoAccount(p2, "Demo Member");
    const theirs = (await (await p2.request.get("/api/me")).json()).user.email as string;
    expect(theirs).not.toBe(mine);
    await other.close();
  });

  test("demo member work is saved to their own history", async ({ page }) => {
    await useDemoAccount(page, "Demo Member");
    await generate(page);
    await expect(page.getByTestId("validation-badge")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("link", { name: "History" }).click();
    await expect(page.getByRole("heading", { name: "Your projects" })).toBeVisible();
    await expect(page.getByRole("link", { name: /TypeScript \+ Playwright Test/ }).first()).toBeVisible();
  });

  test("demo admin can look but not change anything", async ({ page }) => {
    await useDemoAccount(page, "Demo Admin");
    await page.getByRole("link", { name: "Admin" }).click();
    await expect(page.getByText("Demo admin · read-only · emails are masked")).toBeVisible();
    const selects = page.locator("table select");
    const n = await selects.count();
    for (let i = 0; i < n; i++) await expect(selects.nth(i)).toBeDisabled();
    // The API refuses changes too, not just the UI
    const r = await page.request.patch("/api/admin/users", { data: { userId: "x", role: "admin" } });
    expect(r.status()).toBe(403);
  });
});
