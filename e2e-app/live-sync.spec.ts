import { expect, test, type BrowserContext } from "@playwright/test";

const round = {
  roundNum: 1,
  players: 0,
  rooms: [],
  byeCount: 0,
  isQual: false,
  isNoElim: true,
  isSemis: false,
  isFinal: false,
  advPerRoom: null,
  advTotal: 0,
  luckyCount: 0,
};

async function installSyncMock(context: BrowserContext, initial: Record<string, unknown> = {}) {
  await context.addInitScript(({ seeded }) => {
    const listeners = new Map<string, { value(payload: unknown): void; error(error: unknown): void }>();
    const values: Record<string, unknown> = { ...seeded };
    const writes: Array<{ tournamentId: string; payload: any }> = [];
    (window as any).__SYNC_TEST__ = {
      writes,
      emit(id: string, payload: unknown) { values[id] = payload; listeners.get(id)?.value(payload); },
      fail(id: string) { listeners.get(id)?.error(new Error("test connection lost")); },
      listenerCount() { return listeners.size; },
    };
    window.__CURVE_TOUR_SYNC_TRANSPORT__ = {
      async write(tournamentId, payload) {
        writes.push({ tournamentId, payload });
        values[tournamentId] = payload;
        listeners.get(tournamentId)?.value(payload);
      },
      subscribe(tournamentId, onValue, onError) {
        listeners.set(tournamentId, { value: onValue, error: onError });
        queueMicrotask(() => onValue(values[tournamentId] ?? null));
        return () => { listeners.delete(tournamentId); };
      },
    };
  }, { seeded: initial });
}

test("writer debounces an authorized full-state push and preserves null positions on the wire", async ({ context, page }) => {
  await installSyncMock(context);
  await page.addInitScript(({ initialRound }) => {
    localStorage.setItem("curveFFA_admin_unlocked", "true");
    localStorage.setItem("curveFFA_admin_proof_hash", "test-proof");
    localStorage.setItem("curveFFA_state_v1", JSON.stringify({
      T: {
        title: "Writer",
        tournamentId: "sync-writer",
        started: true,
        gameFormat: "team-3v3",
        players: [{ teamId: "team-1", teamName: "Team One", members: [{ name: "One" }, null, { name: "Three" }] }],
        rounds: [initialRound],
        assignments: [[]],
        scores: {},
        finalScores: {},
      },
      setup: {},
      activeTab: "admin",
    }));
  }, { initialRound: round });
  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await page.locator("#running-title").fill("Writer A");
  await page.locator("#running-title").fill("Writer AB");
  await expect.poll(() => page.evaluate(() => (window as any).__SYNC_TEST__.writes.length)).toBe(1);
  const pushed = await page.evaluate(() => (window as any).__SYNC_TEST__.writes[0]);
  expect(pushed.tournamentId).toBe("sync-writer");
  expect(pushed.payload).toMatchObject({ title: "Writer AB", adminProof: "test-proof" });
  expect(pushed.payload.players[0].members[1]).toEqual({ __ffaNull: true });
  await expect(page.locator("#sync-status-panel")).toContainText("Live sync active");
  await expect(page).toHaveURL(/\?t=sync-writer$/u);
});

test("viewer waits, receives live state without persistence or writes, and keeps stale data visible", async ({ context, page }) => {
  await installSyncMock(context);
  await page.addInitScript(() => localStorage.setItem("curveFFA_state_v1", "organiser-state"));
  await page.goto("/?t=viewer-1");
  await expect(page.getByText("Waiting for the tournament to start…")).toBeVisible();
  await page.evaluate(({ initialRound }) => (window as any).__SYNC_TEST__.emit("viewer-1", {
    title: "Live Viewer Cup",
    tournamentId: "viewer-1",
    started: true,
    players: [],
    rounds: [initialRound],
    assignments: [[]],
    scores: {},
    finalScores: {},
    adminProof: "must-be-removed",
  }), { initialRound: round });
  await expect(page.getByText("Waiting for the tournament to start…")).toHaveCount(0);
  await expect(page.locator(".hdr-title")).toContainText("Live Viewer Cup");
  await page.getByRole("navigation").getByRole("button", { name: "Rankings" }).click();
  expect(await page.evaluate(() => (window as any).__SYNC_TEST__.writes.length)).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("curveFFA_state_v1"))).toBe("organiser-state");
  await page.evaluate(() => (window as any).__SYNC_TEST__.fail("viewer-1"));
  await expect(page.getByText("Live connection lost", { exact: false })).toBeVisible();
  await expect(page.locator(".hdr-title")).toContainText("Live Viewer Cup");
});
