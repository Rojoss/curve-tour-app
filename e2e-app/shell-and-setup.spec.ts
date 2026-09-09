import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.route(
    /(?:googleapis\.com|firebaseio\.com|firebasedatabase\.app)/u,
    (route) =>
    route.abort(),
  );
});

test("opens on Bracket and canceling Admin unlock preserves the view", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await expect(page).toHaveTitle("Curve Fever Pro Tour Hub");
  await expect(page.getByText("Start a tournament in Admin to see the bracket overview.")).toBeVisible();
  await page.getByRole("button", { name: "Admin" }).click();
  const dialog = page.getByRole("dialog", { name: "Admin access" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByPlaceholder("Enter admin password")).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Start a tournament in Admin to see the bracket overview.")).toBeVisible();
});

test("loads a roster, generates a preview, persists it, and starts", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("curveFFA_admin_unlocked", "true");
    localStorage.setItem("curveFFA_admin_proof_hash", "test-proof");
  });
  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Admin" }).click();
  const roster = Array.from({ length: 16 }, (_, index) => `Player ${index + 1}`).join("\n");
  await page.locator("#cfg-roster").fill(roster);
  await page.getByRole("button", { name: "Load roster & reserves" }).click();
  await expect(page.locator("#cfg-n-display")).toContainText("16");
  await page.getByRole("button", { name: "Generate Schedule" }).click();
  await expect(page.locator("#preview-wrap")).toBeVisible();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("curveFFA_state_v1") as string),
  );
  expect(stored.T.players).toHaveLength(16);
  expect(stored.T.rounds.length).toBeGreaterThan(2);
  expect(stored.T.started).toBe(false);
  await page.getByRole("button", { name: "Confirm & Start" }).click();
  await expect(page.getByText("Tournament running")).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("curveFFA_state_v1") as string).T.started)).toBe(true);
});

test("fails closed when Admin verification is unavailable", async ({ context, page }) => {
  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Admin" }).click();
  const dialog = page.getByRole("dialog", { name: "Admin access" });
  await dialog.getByPlaceholder("Enter admin password").fill("offline-test");
  await context.setOffline(true);
  await dialog.getByRole("button", { name: "Unlock" }).click();
  await expect(dialog.getByText("Can't verify the password right now — check your connection and try again.")).toBeVisible({ timeout: 7_000 });
  await expect(dialog.getByPlaceholder("Enter admin password")).toBeFocused();
  await expect(page.getByText("Start a tournament in Admin to see the bracket overview.")).toBeVisible();
});

test("keeps navigation usable at 390 pixels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Tournament sections" });
  await expect(nav.getByRole("button", { name: "Rankings" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Archive" })).toBeVisible();
  await nav.getByRole("button", { name: "Scoreboard" }).click();
  await expect(page.getByText("Start a tournament in Admin to see the live scoreboard.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
