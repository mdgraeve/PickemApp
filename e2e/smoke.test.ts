import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Public page smoke tests — no auth required
// ---------------------------------------------------------------------------

test("homepage loads and shows get-started link", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/LockHub/i);
  await expect(page.getByRole("link", { name: /get started/i })).toBeVisible();
});

test("login page renders the email form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /LockHub/i })).toBeVisible();
  await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("unauthenticated visit to /leagues redirects to login", async ({ page }) => {
  await page.goto("/leagues/nonexistent");
  await expect(page).toHaveURL(/\/login/);
});

test("unauthenticated API calls return 401", async ({ request }) => {
  const res = await request.get("/api/leagues");
  expect(res.status()).toBe(401);
});

test("cron endpoint rejects missing secret", async ({ request }) => {
  const res = await request.post("/api/cron/sync-scores");
  expect(res.status()).toBe(401);
});

test("cron endpoint rejects wrong secret", async ({ request }) => {
  const res = await request.post("/api/cron/sync-scores", {
    headers: { "x-cron-secret": "wrong" },
  });
  expect(res.status()).toBe(401);
});
