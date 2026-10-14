import { test, expect, continueAsGuest, signInWithPassword, OWNER } from "./fixtures";

test.describe("Sign-in and route protection", () => {
  test("the app, history and admin pages require a session", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/);
  });

  test("wrong password shows a clear error", async ({ page }) => {
    await signInWithPassword(page, "demo-member@autoscript.demo", "not-the-password");
    await expect(page.locator("p[role=alert]")).toContainText("Wrong email or password");
    await expect(page).toHaveURL(/\/login/);
  });

  test("social buttons explain when a provider isn't set up", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Continue with GitHub" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("hasn't been set up");
  });

  test("guest can enter the app and sign out", async ({ page }) => {
    await continueAsGuest(page);
    await expect(page.locator("header")).toContainText("Guest (not signed in)");
    await expect(page.locator("header")).toContainText("2 of 2 left this month");
  });

  test("owner login is a full admin and lands back on the app from /login", async ({ page }) => {
    await signInWithPassword(page, OWNER.email, OWNER.password);
    await page.waitForURL("**/app");
    await expect(page.locator("header")).toContainText("Admin");
    await expect(page.locator("header")).toContainText("Unlimited generations");
    await page.goto("/login");
    await expect(page).toHaveURL(/\/app$/);

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("owner sees the full admin panel", async ({ page }) => {
    await signInWithPassword(page, OWNER.email, OWNER.password);
    await page.waitForURL("**/app");
    await page.getByRole("link", { name: "Admin" }).click();
    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
    await expect(page.getByText("read-only")).toHaveCount(0);
    await expect(page.getByRole("cell", { name: /owner@e2e\.test/ })).toBeVisible(); // full, unmasked email
  });
});
