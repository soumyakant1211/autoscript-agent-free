import { test as base, expect, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "Recruiter@2026";
export const OWNER = { email: "owner@e2e.test", password: "Owner-E2E-password-1" };

const octet = () => 1 + Math.floor(Math.random() * 253);

/**
 * Every test is a different "visitor": it gets its own IP via X-Forwarded-For,
 * so per-visitor limits (guest quota, demo quota, sign-in rate limit) never leak between tests.
 */
export const test = base.extend({
  extraHTTPHeaders: async ({}, provide) => {
    await provide({ "x-forwarded-for": `10.${octet()}.${octet()}.${octet()}` });
  },
});
export { expect };

export async function signInWithPassword(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

export async function useDemoAccount(page: Page, label: "Demo Admin" | "Demo Member" | "Demo Guest") {
  await page.goto("/login");
  await page.locator("li", { hasText: label }).getByRole("button", { name: "Use" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/app");
}

export async function continueAsGuest(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /Continue as guest/ }).click();
  await page.waitForURL("**/app");
  await expect(page.locator("#stack")).toBeVisible();
}

/** Fill the form and generate; resolves when the agent has finished. */
export async function generate(page: Page, description = "Login to saucedemo with valid and invalid users, then add an item to the cart") {
  const accept = (d: import("@playwright/test").Dialog) => d.accept(); // "Start a new project?" when a project is open
  page.on("dialog", accept);
  await page.locator("#desc").fill(description);
  await page.getByRole("button", { name: /Generate framework/ }).click();
  page.off("dialog", accept);
}
