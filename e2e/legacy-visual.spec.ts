import { expect, test, type BrowserContext } from "@playwright/test";

async function blockProductionSync(context: BrowserContext) {
  await context.route(/(?:gstatic\.com\/firebasejs|firebaseio\.com)/u, (route) =>
    route.abort(),
  );
}

test("desktop empty bracket baseline", async ({ context, page }) => {
  await blockProductionSync(context);
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("legacy-empty-bracket-desktop.png", {
    animations: "disabled",
    fullPage: true,
  });
});

test("desktop admin setup baseline", async ({ context, page }) => {
  await blockProductionSync(context);
  await context.addInitScript(() => {
    localStorage.setItem("curveFFA_admin_unlocked", "true");
  });
  await page.goto("/");
  await page.locator('nav button[data-tab="admin"]').click();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("legacy-admin-setup-desktop.png", {
    animations: "disabled",
    fullPage: true,
  });
});

test("narrow empty bracket baseline", async ({ context, page }) => {
  await blockProductionSync(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("legacy-empty-bracket-390px.png", {
    animations: "disabled",
    fullPage: true,
  });
});
