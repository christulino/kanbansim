import { test, expect } from "@playwright/test";

test("landing renders hero and preset cards", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /lowered/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /The Sweet Spot/i })).toBeVisible();
});

test("preset run completes and shows charts", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /The Sweet Spot/i }).click();
  await expect(page.locator(".stamp")).toContainText(/Running/i, { timeout: 10_000 });
  await expect(page.locator(".stamp")).toContainText(/Run Complete/i, { timeout: 180_000 });
  await expect(page.locator(".card")).toHaveCount(4);
});

test("build configurator round-trip", async ({ page }) => {
  await page.goto("/#/build");
  await expect(page.getByRole("heading", { name: /Build an experiment/i })).toBeVisible();
  await page.getByRole("tab", { name: "Board" }).click();
  const wip = page.locator('input[type="number"]').first();
  await wip.fill("4");
  const hash = await page.evaluate(() => window.location.hash);
  expect(hash).toContain("?e=");
});

test("cancel mid-run leaves partial results", async ({ page }) => {
  await page.goto("/#/build");
  await page.getByRole("button", { name: /Run experiment/i }).click();
  await expect(page.locator(".stamp")).toContainText(/Running/i, { timeout: 10_000 });
  await page.getByRole("button", { name: /Cancel/i }).click();
  await expect(page.locator(".stamp")).toContainText(/Cancelled/i);
});
