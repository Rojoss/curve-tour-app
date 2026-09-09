import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, page }) => {
  // Characterization must never read or write production Firebase data.
  await context.route(/(?:gstatic\.com\/firebasejs|firebaseio\.com)/u, (route) =>
    route.abort(),
  );
  await page.goto("/");
});

test("opens in the read-only bracket view", async ({ page }) => {
  await expect(page).toHaveTitle("Curve Fever Pro Tour Hub");
  await expect(page.locator('nav button[data-tab="bracket"]')).toHaveClass(
    /active/u,
  );
  await expect(page.locator("#br-empty")).toContainText(
    "Start a tournament in Admin",
  );
});

test("requires an admin secret without mutating viewer state", async ({ page }) => {
  await page.locator('nav button[data-tab="admin"]').click();
  await expect(page.locator("#admin-pw-overlay")).toBeVisible();
  await expect(page.locator("#admin-pw-input")).toBeFocused();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("#admin-pw-overlay")).toBeHidden();
  await expect(page.locator('nav button[data-tab="bracket"]')).toHaveClass(
    /active/u,
  );
});

test("exposes the baseline tournament configuration when already unlocked", async ({
  context,
  page,
}) => {
  await context.addInitScript(() => {
    localStorage.setItem("curveFFA_admin_unlocked", "true");
  });
  await page.reload();
  await page.locator('nav button[data-tab="admin"]').click();

  await expect(page.locator("#panel-setup")).toBeVisible();
  await expect(page.locator("#cfg-game-format")).toHaveValue("ffa-individual");
  await expect(page.locator("#cfg-schedule-logic")).toHaveValue(
    "single-elimination",
  );
  await expect(page.locator("#cfg-pooling-phase")).toHaveValue("none");
  await expect(page.locator("#cfg-finals-games")).toHaveValue("3");
});

test("loads an individual roster and creates a schedule preview", async ({
  context,
  page,
}) => {
  await context.addInitScript(() => {
    localStorage.setItem("curveFFA_admin_unlocked", "true");
  });
  await page.reload();
  await page.locator('nav button[data-tab="admin"]').click();
  await page
    .locator("#cfg-roster")
    .fill(Array.from({ length: 16 }, (_, index) => `Player ${index + 1}`).join("\n"));
  await page.getByRole("button", { name: "Load roster & reserves" }).click();
  await expect(page.locator("#cfg-n-display")).toHaveText("16");
  await page.getByRole("button", { name: /Generate Schedule/u }).click();
  await expect(page.locator("#preview-wrap")).toBeVisible();
  await expect(page.locator("#preview-content")).toContainText("Round");
});
