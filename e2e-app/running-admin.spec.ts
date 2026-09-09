import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const roster = Array.from({ length: 16 }, (_, index) => `Player ${index + 1}`).join("\n");

async function prepare(context: BrowserContext, page: Page, finalsGames = "3") {
  await context.route(
    /(?:googleapis\.com|firebaseio\.com|firebasedatabase\.app)/u,
    (route) => route.abort(),
  );
  await page.addInitScript(() => {
    localStorage.setItem("curveFFA_admin_unlocked", "true");
    localStorage.setItem("curveFFA_admin_proof_hash", "test-proof");
  });
  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Admin" }).click();
  await page.locator("#cfg-finals-games").selectOption(finalsGames);
  await page.locator("#cfg-roster").fill(roster);
  await page.getByRole("button", { name: "Load roster & reserves" }).click();
  await page.getByRole("button", { name: "Generate Schedule" }).click();
  await page.getByRole("button", { name: "Confirm & Start" }).click();
  await expect(page.locator("#panel-running")).toBeVisible();
}

async function scoreCurrentRound(page: Page) {
  const inputs = page.locator('#panel-running input.score-inp[data-key]:not([disabled])');
  const count = await inputs.count();
  const roomPositions = new Map<string, number>();
  for (let index = 0; index < count; index += 1) {
    const input = inputs.nth(index);
    const room = (await input.getAttribute("data-rm")) ?? "1";
    const position = (roomPositions.get(room) ?? 0) + 1;
    roomPositions.set(room, position);
    await input.fill(String(900 - position * 100));
  }
}

test("scores, advances, renames, and restores the running tournament", async ({
  context,
  page,
}) => {
  await prepare(context, page);
  await scoreCurrentRound(page);
  await expect(page.getByText("Advances", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Next Round" }).click();
  await expect(page.locator(".round-display .num")).toHaveText("2");

  const manage = page.getByText("Manage Players", { exact: false }).locator("..");
  const player = manage.locator(".seed-card").filter({
    has: page.getByText("Player 1", { exact: true }),
  });
  page.once("dialog", (dialog) => dialog.accept("Renamed Player"));
  await player.getByTitle("Rename").click();
  await expect(manage.getByText("Renamed Player", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await expect(page.locator(".round-display .num")).toHaveText("2");
  await expect(page.getByText("Renamed Player", { exact: true }).first()).toBeVisible();
});

test("a configured one-game Final records finalScores and completes normally", async ({
  context,
  page,
}) => {
  await prepare(context, page, "1");
  for (let guard = 0; guard < 10; guard += 1) {
    const next = page.getByRole("button", { name: "Next Round" });
    if (!(await next.count())) break;
    await scoreCurrentRound(page);
    await next.click();
  }
  await expect(page.getByRole("button", { name: "Game 1" })).toBeVisible();
  const finalsInputs = page.locator(".finals-card input.score-inp:not([disabled])");
  expect(await finalsInputs.count()).toBeGreaterThan(1);
  for (let index = 0; index < (await finalsInputs.count()); index += 1) {
    await finalsInputs.nth(index).fill(String(1000 - index * 100));
  }
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("curveFFA_state_v1") as string).T,
  );
  expect(Object.keys(saved.finalScores)).toHaveLength(await finalsInputs.count());
  expect(Object.keys(saved.finalScores).every((key) => key.startsWith("game1-"))).toBe(true);
});

test("keeps running Admin usable at 390 pixels", async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(context, page);
  await expect(page.locator(".room-block").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Next Round" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
