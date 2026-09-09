import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const roster = Array.from({ length: 16 }, (_, index) => `Viewer Player ${index + 1}`).join("\n");

async function start(context: BrowserContext, page: Page) {
  await context.route(/(?:googleapis\.com|firebaseio\.com|firebasedatabase\.app)/u, (route) => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem("curveFFA_admin_unlocked", "true");
    localStorage.setItem("curveFFA_admin_proof_hash", "test-proof");
  });
  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await page.getByRole("navigation").getByRole("button", { name: "Admin" }).click();
  await page.locator("#cfg-finals-games").selectOption("1");
  await page.locator("#cfg-roster").fill(roster);
  await page.getByRole("button", { name: "Load roster & reserves" }).click();
  await page.getByRole("button", { name: "Generate Schedule" }).click();
  await page.getByRole("button", { name: "Confirm & Start" }).click();
}

async function scoreRoomRound(page: Page) {
  const inputs = page.locator('#panel-running input.score-inp[data-key]:not([disabled])');
  const positions = new Map<string, number>();
  for (let index = 0; index < (await inputs.count()); index += 1) {
    const input = inputs.nth(index);
    const room = (await input.getAttribute("data-rm")) ?? "1";
    const position = (positions.get(room) ?? 0) + 1;
    positions.set(room, position);
    await input.fill(String(900 - position * 100));
  }
}

test("shows partial Scoreboard data and active Rankings without exposing Admin controls", async ({ context, page }) => {
  await start(context, page);
  const first = page.locator('#panel-running input.score-inp[data-key]').first();
  await first.fill("777");
  await page.getByRole("navigation").getByRole("button", { name: "Scoreboard" }).click();
  await expect(page.locator("#view-scoreboard .room-block").first()).toBeVisible();
  await expect(page.locator("#view-scoreboard").getByText("777", { exact: true })).toBeVisible();
  await expect(page.locator("#view-scoreboard input.score-inp")).toHaveCount(0);

  await page.getByRole("navigation").getByRole("button", { name: "Rankings" }).click();
  await expect(page.getByText("Still in tournament", { exact: true }).first()).toBeVisible();
  await expect(page.locator("#view-rankings .rk-row")).toHaveCount(16);
});

test("shows final champion and eliminated ranking order after completion", async ({ context, page }) => {
  await start(context, page);
  for (let guard = 0; guard < 10; guard += 1) {
    const next = page.getByRole("button", { name: "Next Round" });
    if (!(await next.count())) break;
    await scoreRoomRound(page);
    await next.click();
  }
  const finals = page.locator(".finals-card input.score-inp:not([disabled])");
  for (let index = 0; index < (await finals.count()); index += 1) {
    await finals.nth(index).fill(String(1000 - index * 100));
  }
  await page.getByRole("navigation").getByRole("button", { name: "Rankings" }).click();
  await expect(page.getByText("Final standings", { exact: true })).toBeVisible();
  await expect(page.locator(".rk-champion")).toHaveCount(1);
  await expect(page.getByText("Reached Final", { exact: false }).first()).toBeVisible();
  await expect(page.locator("#view-rankings .rk-row")).toHaveCount(16);
});

test("keeps the live Scoreboard within a 390-pixel viewport", async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(context, page);
  await page.getByRole("navigation").getByRole("button", { name: "Scoreboard" }).click();
  await expect(page.locator("#view-scoreboard .room-block").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
