import { test, expect } from "./fixtures";

test.describe("Landing page", () => {
  test("shows the product and a working call to action", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Describe the app. Get a test framework that runs.");
    await expect(page.getByText("9 of 9 files pass syntax checks")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /54 stacks/ })).toBeVisible();
    await page.getByRole("link", { name: "Try it free" }).first().click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("has no horizontal scroll", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  test("serves social preview and icons", async ({ request }) => {
    for (const [path, type] of [["/opengraph-image", "image/png"], ["/icon", "image/png"], ["/apple-icon", "image/png"], ["/favicon.ico", "image/x-icon"]]) {
      const r = await request.get(path);
      expect(r.status(), path).toBe(200);
      expect(r.headers()["content-type"], path).toContain(type);
    }
  });
});

test("keep-alive endpoint answers without the database", async ({ request }) => {
  const r = await request.get("/api/ping");
  expect(r.ok()).toBe(true);
  expect((await r.json()).ok).toBe(true);
});
