import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const roster = Array.from({ length: 16 }, (_, index) => `Bracket Player ${index + 1}`).join("\n");

async function start(context: BrowserContext, page: Page, finalsGames = "3") {
  await context.route(/(?:googleapis\.com|firebaseio\.com|firebasedatabase\.app)/u, (route) => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem("curveFFA_admin_unlocked", "true");
    localStorage.setItem("curveFFA_admin_proof_hash", "test-proof");
  });
  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await page.getByRole("navigation").getByRole("button", { name: "Admin" }).click();
  await page.locator("#cfg-finals-games").selectOption(finalsGames);
  await page.locator("#cfg-roster").fill(roster);
  await page.getByRole("button", { name: "Load roster & reserves" }).click();
  await page.getByRole("button", { name: "Generate Schedule" }).click();
  await page.getByRole("button", { name: "Confirm & Start" }).click();
}

async function scoreAdminRound(page: Page) {
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

test("follows, collapses, and directly scores the current bracket round", async ({ context, page }) => {
  await start(context, page);
  await page.getByRole("navigation").getByRole("button", { name: "Bracket" }).click();
  await expect(page.locator(".bracket-round-col")).toHaveCount(5);
  await expect(page.locator("#view-bracket input.score-inp:not([disabled])")).toHaveCount(16);

  const firstScore = page.locator("#view-bracket input.score-inp:not([disabled])").first();
  await firstScore.fill("654");
  const key = await firstScore.getAttribute("data-key");
  expect(await page.evaluate((scoreKey) => JSON.parse(localStorage.getItem("curveFFA_state_v1") as string).T.scores[scoreKey as string], key)).toBe(654);

  await page.locator("#br-follow-input").fill("Bracket Player 1");
  await expect(page.locator(".bracket-follow-pill")).toContainText("Following Bracket Player 1");
  await expect(page.locator(".is-followed").first()).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("curveFFA_bracket_follow"))).toBe("Bracket Player 1");

  const current = page.locator(".bracket-round-col.current-col");
  await current.locator(".bracket-round-hdr").click();
  await expect(current).toHaveClass(/is-collapsed/u);

  await page.getByRole("navigation").getByRole("button", { name: "Admin" }).click();
  await page.getByRole("button", { name: "Lock Admin" }).click();
  await expect(page.locator("#view-bracket input.score-inp:not([disabled])")).toHaveCount(0);
});

test("enters the open one-game Final directly from Bracket", async ({ context, page }) => {
  await start(context, page, "1");
  for (let guard = 0; guard < 10; guard += 1) {
    const next = page.getByRole("button", { name: "Next Round" });
    if (!(await next.count())) break;
    await scoreAdminRound(page);
    await next.click();
  }
  await page.getByRole("navigation").getByRole("button", { name: "Bracket" }).click();
  await expect(page.getByText("Game 1 — enter scores", { exact: true })).toBeVisible();
  const inputs = page.locator(".bracket-final-next input.score-inp:not([disabled])");
  const finalCount = await inputs.count();
  for (let index = 0; index < finalCount; index += 1) await inputs.nth(index).fill(String(700 - index * 10));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("curveFFA_state_v1") as string).T.finalScores);
  expect(Object.keys(saved)).toHaveLength(finalCount);
  await expect(page.locator(".bracket-final-row.is-final-winner")).toHaveCount(1);
});

test("keeps the bracket scroller usable at 390 pixels", async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(context, page);
  await page.getByRole("navigation").getByRole("button", { name: "Bracket" }).click();
  await expect(page.locator(".bracket-scroll")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.locator(".bracket-scroll").evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
});
