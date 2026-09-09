import { expect, test } from "@playwright/test";

test("characterizes bracket follow, collapse, and direct score entry", async ({ context, page }) => {
  await context.route(/(?:gstatic\.com\/firebasejs|firebaseio\.com)/u, (route) => route.abort());
  await context.addInitScript(() => {
    localStorage.setItem("curveFFA_admin_unlocked", "true");
    let randomState = 0x5eed1234;
    Math.random = () => {
      randomState = (1664525 * randomState + 1013904223) >>> 0;
      return randomState / 0x1_0000_0000;
    };
  });
  await page.goto("/");
  await page.locator('nav button[data-tab="admin"]').click();
  const roster = Array.from({ length: 16 }, (_, index) => `Follow Player ${index + 1}`).join("\n");
  await page.locator("#cfg-roster").fill(roster);
  await page.getByRole("button", { name: "Load roster & reserves" }).click();
  await page.getByRole("button", { name: /Generate Schedule/u }).click();
  await page.getByRole("button", { name: /Confirm & Start/u }).click();
  await page.locator('nav button[data-tab="bracket"]').click();

  await expect(page.locator("#br-content input.score-inp:not([disabled])")).toHaveCount(16);
  const input = page.locator("#br-content input.score-inp:not([disabled])").first();
  const scoreKey = await input.getAttribute("data-key");
  await input.fill("432");
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem("curveFFA_state_v1") as string).T.scores[key as string], scoreKey)).toBe(432);

  await page.locator("#br-follow-input").fill("Follow Player 1");
  await expect(page.locator(".bracket-follow-pill")).toContainText("Following Follow Player 1");
  await expect(page.locator(".is-followed").first()).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("curveFFA_bracket_follow"))).toBe("Follow Player 1");

  const current = page.locator(".bracket-round-col.current-col");
  await current.locator(".bracket-round-hdr").click();
  await expect(current).toHaveClass(/is-collapsed/u);
});
