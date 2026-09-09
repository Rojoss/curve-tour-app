import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, page }) => {
  await context.route(/(?:gstatic\.com\/firebasejs|googleapis\.com|firebaseio\.com|firebasedatabase\.app)/u, (route) => route.abort());
  await page.goto("/");
});

test("characterizes archive shapes, annotation-preserving overwrite, and isolated import", async ({ page }) => {
  const actual = await page.evaluate(() => {
    const legacy = window as unknown as Record<string, any>;
    legacy.pushSyncUpdate = () => undefined;
    Object.assign(legacy.T, {
      title: "Archive Cup",
      tournamentId: "tour-archive",
      players: ["A", "B"],
      rounds: [{ roundNum: 2, rooms: [2] }],
      curRound: 0,
      assignments: [[{ name: "A", room: 1 }, { name: "B", room: 1 }]],
      needsSave: true,
    });
    legacy.performArchiveSave("10", "Archive Cup", false);
    const firstEntry = legacy.getArchiveEntry("10");
    firstEntry.annotations.push({ text: "keep me", timestamp: "2026-01-01T00:00:00.000Z" });
    legacy.saveArchiveEntry(firstEntry);
    legacy.T.title = "Renamed Cup";
    legacy.performArchiveSave("10", "Renamed Cup", true);
    const overwritten = legacy.getArchiveEntry("10");
    const summary = legacy.getArchiveIndex()[0];

    const liveBeforeImport = localStorage.getItem("curveFFA_state_v1");
    const imported = {
      ...overwritten,
      id: "imported",
      title: "Imported Cup",
      snapshot: { ...overwritten.snapshot, title: "Imported Cup", tournamentId: "import-tour" },
    };
    const counts = legacy.runArchiveImport([imported], "overwrite");
    return {
      entryKeys: Object.keys(firstEntry),
      summaryKeys: Object.keys(summary),
      summary,
      annotations: overwritten.annotations,
      counts,
      imported: legacy.getArchiveEntry("imported"),
      liveUntouched: localStorage.getItem("curveFFA_state_v1") === liveBeforeImport,
    };
  });

  expect(actual.entryKeys).toEqual(["id", "title", "dateSaved", "tournamentId", "snapshot", "annotations"]);
  expect(actual.summaryKeys).toEqual(["id", "title", "dateSaved", "tournamentId", "playerCount", "roundsPlayed"]);
  expect(actual.summary).toMatchObject({ id: "10", title: "Renamed Cup", tournamentId: "tour-archive", playerCount: 2, roundsPlayed: 2 });
  expect(actual.annotations).toEqual([{ text: "keep me", timestamp: "2026-01-01T00:00:00.000Z" }]);
  expect(actual.counts).toMatchObject({ added: 1, overwritten: 0, skippedDup: 0, failed: 0 });
  expect(actual.imported.title).toBe("Imported Cup");
  expect(actual.liveUntouched).toBe(true);
});
