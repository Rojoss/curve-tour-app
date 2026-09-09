import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, page }) => {
  await context.route(/(?:gstatic\.com\/firebasejs|firebaseio\.com)/u, (route) =>
    route.abort(),
  );
  await page.goto("/");
});

test("characterizes live individual rename, swap, withdrawal, and reset mutations", async ({
  page,
}) => {
  const actual = await page.evaluate(() => {
    const legacy = window as unknown as Record<string, any>;
    legacy.renderAdminRound = () => undefined;
    legacy.saveState = () => undefined;
    legacy.markDirty = () => { legacy.T.needsSave = true; };
    legacy.confirm = () => true;
    const round = {
      roundNum: 1, players: 3, rooms: [3], byeCount: 0,
      isQual: false, isNoElim: false, isSemis: true, isFinal: false,
      advPerRoom: 2, advTotal: 2, luckyCount: 0, numGames: 1,
    };
    legacy.T = {
      title: "Mutation fixture", players: ["A", "B", "C"], reserves: ["Reserve"],
      reserveIndividuals: [], confirmedCount: 3, tournamentId: "fixture",
      rounds: [round], curRound: 0,
      scores: { "r0-rm1-p0": 30, "r0-rm1-p1": 20, "r0-rm1-p2": 10 },
      finalScores: { "game1-A": 50 },
      assignments: [[{ name: "A", room: 1 }, { name: "B", room: 1 }, { name: "C", room: 1 }]],
      luckyLosers: [["A"]], byes: [["A"]], poolingByeCounts: { A: 2 },
      pendingBracketSeeds: {}, qualTable: [{ name: "A", totalFP: 1, totalScore: 30, played: 1 }],
      groups: [], groupStandings: {}, tieResolutions: { tie: ["A", "B"] },
      defenderChanges: {}, reserveOpen: true, started: true, needsSave: false, autoSaved: false,
      cfg: { poolingPhase: "none" }, scheduleLogic: "single-elimination",
      gameFormat: "ffa-individual", gamemodeConfig: { roomSize: { min: 6, max: 8, ideal: 8 } },
    };

    legacy.renamePlayer("A", "Alpha");
    const afterRename = {
      players: [...legacy.T.players],
      assignments: legacy.T.assignments[0].map((entry: any) => entry.name),
      finalScores: { ...legacy.T.finalScores },
      ties: legacy.T.tieResolutions.tie,
    };
    legacy.prompt = () => "Reserve";
    legacy.swapPlayer("Alpha");
    const afterSwap = {
      players: [...legacy.T.players],
      reserves: [...legacy.T.reserves],
      assignments: legacy.T.assignments[0].map((entry: any) => entry.name),
      byes: [...legacy.T.byes[0]],
      poolingByeCounts: { ...legacy.T.poolingByeCounts },
      scores: { ...legacy.T.scores },
    };
    legacy.removePlayer("B");
    const afterRemove = {
      players: [...legacy.T.players],
      assignments: legacy.T.assignments[0].map((entry: any) => entry.name),
      scores: { ...legacy.T.scores },
    };
    legacy.proceedReset();
    const afterReset = {
      title: legacy.T.title,
      players: [...legacy.T.players],
      scores: { ...legacy.T.scores },
      assignments: [...legacy.T.assignments],
      started: legacy.T.started,
      tournamentId: legacy.T.tournamentId,
      reserveOpen: legacy.T.reserveOpen,
    };
    return { afterRename, afterSwap, afterRemove, afterReset };
  });

  expect(actual).toEqual({
    afterRename: {
      players: ["Alpha", "B", "C"],
      assignments: ["Alpha", "B", "C"],
      finalScores: { "game1-Alpha": 50 },
      ties: ["Alpha", "B"],
    },
    afterSwap: {
      players: ["B", "C", "Reserve"],
      reserves: [],
      assignments: ["Reserve", "B", "C"],
      byes: ["A"],
      poolingByeCounts: { A: 2 },
      scores: { "r0-rm1-p1": 20, "r0-rm1-p2": 10 },
    },
    afterRemove: {
      players: ["C", "Reserve"],
      assignments: ["Reserve", "C"],
      scores: { "r0-rm1-p1": 10 },
    },
    afterReset: {
      title: "Mutation fixture",
      players: ["C", "Reserve"],
      scores: {},
      assignments: [],
      started: false,
      tournamentId: null,
      reserveOpen: true,
    },
  });
});
