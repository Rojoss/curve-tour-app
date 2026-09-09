import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, page }) => {
  await context.route(/(?:gstatic\.com\/firebasejs|firebaseio\.com)/u, (route) =>
    route.abort(),
  );
  await page.goto("/");
});

test("characterizes old-save normalization and viewer no-write policy", async ({
  page,
}) => {
  const actual = await page.evaluate(() => {
    const legacy = window as unknown as Record<string, any>;
    const storageKey = "curveFFA_state_v1";
    const oldNow = Date.now;
    Date.now = () => 1_700_000_000_123;
    legacy.renderPreview = () => undefined;
    legacy.pushSyncUpdate = () => undefined;
    localStorage.setItem(storageKey, JSON.stringify({
      T: {
        title: "Old Cup",
        gameFormat: "team-3v3",
        players: [{
          teamId: "team-old",
          teamName: "Old Team",
          members: [{ name: "One" }],
        }],
        reserves: [{ teamId: "reserve-old", teamName: "Reserve" }],
        rounds: [{ roundNum: 1 }],
        tournamentId: null,
        unknownLegacyState: { preserved: true },
      },
      setup: {
        gameFormat: "team-3v3",
        qual: "yes",
        roster: "Old Team, One",
      },
      activeTab: "rankings",
    }));
    legacy.loadState();
    const normalized = {
      tournamentId: legacy.T.tournamentId,
      players: legacy.T.players,
      reserves: legacy.T.reserves,
      unknownLegacyState: legacy.T.unknownLegacyState,
      poolingPhase: (
        document.getElementById("cfg-pooling-phase") as HTMLSelectElement
      ).value,
      gameFormat: (
        document.getElementById("cfg-game-format") as HTMLSelectElement
      ).value,
      roster: (
        document.getElementById("cfg-roster") as HTMLTextAreaElement
      ).value,
      activeTab: document.querySelector("nav button.active")?.getAttribute("data-tab"),
    };

    const lbInput = document.getElementById(
      "cfg-lb-qualifiers",
    ) as HTMLInputElement | null;
    if (lbInput) lbInput.value = "7";
    legacy.SYNC_IS_VIEWER = false;
    legacy.saveState();
    const saved = JSON.parse(localStorage.getItem(storageKey) as string);
    const nextSave = {
      rootKeys: Object.keys(saved),
      setupKeys: Object.keys(saved.setup),
      hasLbQualifiers: Object.prototype.hasOwnProperty.call(
        saved.setup,
        "lbQualifiers",
      ),
      hasCfgLbQualifiers: Object.prototype.hasOwnProperty.call(
        saved.setup,
        "cfg-lb-qualifiers",
      ),
      preservedUnknownState: saved.T.unknownLegacyState,
    };

    localStorage.setItem(storageKey, "organiser-state");
    legacy.SYNC_IS_VIEWER = true;
    legacy.T.title = "Viewer must not save";
    legacy.saveState();
    const viewerStored = localStorage.getItem(storageKey);
    Date.now = oldNow;
    return { normalized, nextSave, viewerStored };
  });

  expect(actual.normalized).toEqual({
    tournamentId: "1700000000123",
    players: [{
      teamId: "team-old",
      teamName: "Old Team",
      members: [{ name: "One" }, null, null],
    }],
    reserves: [{
      teamId: "reserve-old",
      teamName: "Reserve",
      members: [null, null, null],
    }],
    unknownLegacyState: { preserved: true },
    poolingPhase: "qual-table",
    gameFormat: "team-3v3",
    roster: "Old Team, One",
    activeTab: "rankings",
  });
  expect(actual.nextSave).toEqual({
    rootKeys: ["T", "setup", "activeTab"],
    setupKeys: [
      "scheduleLogic", "gameFormat", "scoring", "poolingPhase", "qualAdv",
      "groupSize", "roundRobinMode", "qualifiersPerGroup", "finalsGames",
      "semisGames", "grandFinalWbTarget", "grandFinalLbTarget",
      "semisOverride", "finalOverride", "oddCountStrategy",
      "teamScoringRule", "roster", "reserves", "reserveIndividuals",
    ],
    hasLbQualifiers: false,
    hasCfgLbQualifiers: false,
    preservedUnknownState: { preserved: true },
  });
  expect(actual.viewerStored).toBe("organiser-state");
});
