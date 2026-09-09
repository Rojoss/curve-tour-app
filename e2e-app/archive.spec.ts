import { readFile } from "node:fs/promises";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const roster = Array.from({ length: 16 }, (_, index) => `Player ${index + 1}`).join("\n");

async function prepare(context: BrowserContext, page: Page, finalsGames = "3") {
  await context.route(/(?:googleapis\.com|firebaseio\.com|firebasedatabase\.app)/u, (route) => route.abort());
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
  const roomPositions = new Map<string, number>();
  for (let index = 0; index < await inputs.count(); index += 1) {
    const input = inputs.nth(index);
    const room = (await input.getAttribute("data-rm")) ?? "1";
    const position = (roomPositions.get(room) ?? 0) + 1;
    roomPositions.set(room, position);
    await input.fill(String(900 - position * 100));
  }
}

test("saves, annotates, exports, downloads rankings, and preserves notes on overwrite", async ({ context, page }) => {
  await prepare(context, page);
  await page.locator("nav").getByRole("button", { name: "Rankings" }).click();
  const livePngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download rankings PNG" }).click();
  const livePngPath = await (await livePngDownload).path();
  const liveBytes = await readFile(livePngPath as string);
  expect(liveBytes.subarray(1, 4).toString()).toBe("PNG");
  await page.locator("nav").getByRole("button", { name: "Admin" }).click();
  await page.getByRole("button", { name: "Save to Archive" }).click();
  await expect(page.locator("#archive-save-status")).toContainText("saved");
  await page.getByRole("button", { name: "🗄 Archive", exact: true }).click();
  await page.locator("#ar-list .archive-row").click();

  await page.locator("#ar-note-input").fill("Referee note");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(page.getByText("Referee note")).toBeVisible();

  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  expect((await jsonDownload).suggestedFilename()).toMatch(/^curve-tournament_.*\.json$/u);

  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Rankings PNG" }).click();
  const png = await pngDownload;
  expect(png.suggestedFilename()).toMatch(/-rankings\.png$/u);
  const pngPath = await png.path();
  expect(pngPath).not.toBeNull();
  const bytes = await readFile(pngPath as string);
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  expect(bytes.readUInt32BE(16)).toBeGreaterThan(0);
  expect(bytes.readUInt32BE(20)).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Admin" }).click();
  await page.getByRole("button", { name: "Save to Archive" }).click();
  await expect(page.getByRole("dialog")).toContainText("Tournament already archived");
  await page.getByRole("button", { name: "Overwrite existing" }).click();
  await page.getByRole("button", { name: "🗄 Archive", exact: true }).click();
  await page.locator("#ar-list .archive-row").click();
  await expect(page.getByText("Referee note")).toBeVisible();
  await page.getByRole("button", { name: "Back to Archive" }).click();
  const bundleDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export full archive" }).click();
  const bundlePath = await (await bundleDownload).path();
  const bundle = JSON.parse(await readFile(bundlePath as string, "utf8"));
  expect(bundle).toMatchObject({ tournaments: [{ title: "Unnamed Tournament" }] });
});

test("auto-saves a completed one-game Final exactly once", async ({ context, page }) => {
  await prepare(context, page, "1");
  for (let guard = 0; guard < 10; guard += 1) {
    const next = page.getByRole("button", { name: "Next Round" });
    if (!(await next.count())) break;
    await scoreCurrentRound(page);
    await next.click();
  }
  const finalsInputs = page.locator(".finals-card input.score-inp:not([disabled])");
  for (let index = 0; index < await finalsInputs.count(); index += 1) {
    await finalsInputs.nth(index).fill(String(1000 - index * 100));
  }
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("curveFFA_archive_index") ?? "[]").length)).toBe(1);
  const after = await page.evaluate(() => ({
    index: JSON.parse(localStorage.getItem("curveFFA_archive_index") ?? "[]"),
    live: JSON.parse(localStorage.getItem("curveFFA_state_v1") as string).T,
  }));
  expect(after.live.autoSaved).toBe(true);
  expect(after.live.needsSave).toBe(false);
  await finalsInputs.first().fill("1100");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("curveFFA_archive_index") ?? "[]").length)).toBe(1);
  await expect(page.locator("#archive-save-status")).toContainText("archived automatically");
});

test("imports single exports with collision choices without changing live state", async ({ context, page }) => {
  await context.route(/(?:googleapis\.com|firebaseio\.com|firebasedatabase\.app)/u, (route) => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem("curveFFA_admin_unlocked", "true");
    localStorage.setItem("curveFFA_admin_proof_hash", "test-proof");
  });
  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await page.getByRole("button", { name: "🗄 Archive", exact: true }).click();
  const entry = {
    id: "import-1",
    title: "Imported Cup",
    dateSaved: "2026-01-02T03:04:05.000Z",
    tournamentId: "import-tour",
    snapshot: { title: "Imported Cup", tournamentId: "import-tour", players: [], rounds: [], assignments: [] },
    annotations: [],
  };
  const liveBefore = await page.evaluate(() => localStorage.getItem("curveFFA_state_v1"));
  await page.locator('input[type="file"]').setInputFiles({ name: "entry.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(entry)) });
  await expect(page.getByRole("button", { name: /Imported Cup/ })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({ name: "entry.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(entry)) });
  await expect(page.getByRole("dialog")).toContainText("Already in your archive");
  await page.getByRole("button", { name: "Import as new entry" }).click();
  await expect(page.getByRole("button", { name: /Imported Cup/ })).toHaveCount(2);
  const duplicateTournamentIds = await page.evaluate(() => {
    const index = JSON.parse(localStorage.getItem("curveFFA_archive_index") ?? "[]");
    return index.filter((item: { title: string }) => item.title === "Imported Cup").map((item: { tournamentId: string }) => item.tournamentId);
  });
  expect(duplicateTournamentIds).toEqual(["import-tour", "import-tour"]);

  const bundle = { exportedAt: "2026-01-03T00:00:00.000Z", tournaments: [{ ...entry, id: "bundle-1", title: "Bundle Cup" }] };
  await page.locator('input[type="file"]').setInputFiles({ name: "bundle.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(bundle)) });
  await expect(page.getByRole("button", { name: /Bundle Cup/ })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({ name: "bundle.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(bundle)) });
  await expect(page.getByRole("dialog")).toContainText("Some of these are already archived");
  await page.getByRole("button", { name: "Skip the duplicates" }).click();
  await expect(page.getByRole("button", { name: /Bundle Cup/ })).toHaveCount(1);

  await page.locator('input[type="file"]').setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{") });
  await expect(page.getByRole("status")).toContainText("isn't valid JSON");
  await page.locator('input[type="file"]').setInputFiles({ name: "too-large.json", mimeType: "application/json", buffer: Buffer.alloc(25 * 1024 * 1024 + 1) });
  await expect(page.getByRole("status")).toContainText("too large");
  expect(await page.evaluate(() => localStorage.getItem("curveFFA_state_v1"))).toBe(liveBefore);
});

test("offers save-as-new and protects a different tournament with the same title", async ({ context, page }) => {
  await prepare(context, page);
  await page.getByRole("button", { name: "Save to Archive" }).click();
  await page.getByRole("button", { name: "Save to Archive" }).click();
  await page.getByRole("button", { name: "Save as new entry" }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("curveFFA_archive_index") ?? "[]").length)).toBe(2);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset" }).click();
  await page.getByRole("button", { name: "Generate Schedule" }).click();
  await page.getByRole("button", { name: "Confirm & Start" }).click();
  await page.getByRole("button", { name: "Save to Archive" }).click();
  await expect(page.getByRole("dialog")).toContainText("Title already used");
  await page.getByRole("button", { name: "Save as new entry" }).click();
  const tournamentIds = await page.evaluate(() => {
    const index = JSON.parse(localStorage.getItem("curveFFA_archive_index") ?? "[]");
    return [...new Set(index.map((entry: { tournamentId: string }) => entry.tournamentId))];
  });
  expect(tournamentIds).toHaveLength(2);
});

test("confirms annotation and archive deletion", async ({ context, page }) => {
  await prepare(context, page);
  await page.getByRole("button", { name: "Save to Archive" }).click();
  await page.getByRole("button", { name: "🗄 Archive", exact: true }).click();
  await page.locator("#ar-list .archive-row").click();
  await page.locator("#ar-note-input").fill("Temporary note");
  await page.getByRole("button", { name: "Add annotation" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTitle("Delete").click();
  await expect(page.getByText("Temporary note")).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator("#ar-empty")).toBeVisible();
});

test("protects unsaved work before reset", async ({ context, page }) => {
  await prepare(context, page);
  await scoreCurrentRound(page);
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByRole("dialog")).toContainText("Unsaved tournament");
  await page.getByRole("button", { name: "Save & reset" }).click();
  await expect(page.locator("#panel-running")).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("curveFFA_archive_index") ?? "[]").length)).toBe(1);
});

test("keeps archive list and detail usable at 390 pixels", async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(context, page);
  await page.getByRole("button", { name: "Save to Archive" }).click();
  await page.getByRole("button", { name: "🗄 Archive", exact: true }).click();
  await expect(page.locator("#ar-list .archive-row")).toBeVisible();
  await page.locator("#ar-list .archive-row").click();
  await expect(page.getByRole("button", { name: "Rankings PNG" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
