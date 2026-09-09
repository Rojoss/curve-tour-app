import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, page }) => {
  await context.route(/(?:gstatic\.com\/firebasejs|firebaseio\.com)/u, (route) =>
    route.abort(),
  );
  await page.goto("/");
});

test("characterizes ordinary, Swiss, and double-elimination round transitions", async ({
  page,
}) => {
  const actual = await page.evaluate(() => {
    const legacy = window as unknown as Record<string, any>;
    const alerts: string[] = [];
    legacy.alert = (message: string) => alerts.push(message);
    legacy.renderAdminRound = () => legacy.checkReserveWindow();
    legacy.saveState = () => undefined;

    const makeRound = (overrides: Record<string, unknown> = {}) => ({
      roundNum: 1,
      players: 4,
      rooms: [2, 2],
      byeCount: 0,
      isQual: false,
      isNoElim: false,
      isSemis: false,
      isFinal: false,
      advPerRoom: 1,
      advTotal: 2,
      luckyCount: 0,
      ...overrides,
    });
    const makeState = (overrides: Record<string, unknown> = {}) => ({
      title: "Fixture",
      players: [],
      reserves: [],
      reserveIndividuals: [],
      confirmedCount: null,
      tournamentId: "fixture",
      rounds: [],
      curRound: 0,
      scores: {},
      finalScores: {},
      assignments: [],
      luckyLosers: [],
      byes: [],
      poolingByeCounts: {},
      pendingBracketSeeds: {},
      qualTable: [],
      groups: [],
      groupStandings: {},
      tieResolutions: {},
      defenderChanges: {},
      reserveOpen: true,
      started: true,
      needsSave: false,
      autoSaved: false,
      cfg: { poolingPhase: "none" },
      scheduleLogic: "single-elimination",
      gameFormat: "individual-1v1",
      gamemodeConfig: {
        roomSize: { min: 2, max: 2, ideal: 2 },
        oddCountStrategy: "bye",
      },
      ...overrides,
    });
    const use = (state: Record<string, unknown>) => {
      legacy.T = state;
      alerts.length = 0;
      legacy.advanceRound();
      return {
        curRound: legacy.T.curRound,
        assignments: legacy.T.assignments,
        byes: legacy.T.byes,
        luckyLosers: legacy.T.luckyLosers,
        poolingByeCounts: legacy.T.poolingByeCounts,
        pendingBracketSeeds: legacy.T.pendingBracketSeeds,
        reserveOpen: legacy.T.reserveOpen,
        needsSave: legacy.T.needsSave,
        rounds: legacy.T.rounds.map((round: any) => ({
          wbFinalistName: round.wbFinalistName,
        })),
        alerts: [...alerts],
      };
    };

    const warmup = makeRound({
      isNoElim: true,
      advPerRoom: null,
      advTotal: 5,
    });
    const ordinary = use(makeState({
      players: ["A", "B", "C", "D", "E"],
      gameFormat: "individual-1v1",
      rounds: [warmup, { ...warmup, roundNum: 2 }, makeRound({ roundNum: 3 })],
      assignments: [[
        { name: "A", room: 1 }, { name: "B", room: 1 },
        { name: "C", room: 2 }, { name: "D", room: 2 },
        { name: "E", room: null },
      ]],
      scores: {
        "r0-rm1-p0": 100, "r0-rm1-p1": 50,
        "r0-rm2-p0": 80, "r0-rm2-p1": 20,
      },
      byes: [["E"]],
      poolingByeCounts: { E: 1 },
    }));

    const swissRound = makeRound({
      players: 5,
      isNoElim: true,
      isSwiss: true,
      advPerRoom: null,
      advTotal: 5,
    });
    const swiss = use(makeState({
      players: ["A", "B", "C", "D", "E"],
      rounds: [
        swissRound,
        { ...swissRound, roundNum: 2 },
        makeRound({ roundNum: 3 }),
      ],
      assignments: [[
        { name: "A", room: 1 }, { name: "B", room: 1 },
        { name: "C", room: 2 }, { name: "D", room: 2 },
        { name: "E", room: null },
      ]],
      scores: {
        "r0-rm1-p0": 100, "r0-rm1-p1": 50,
        "r0-rm2-p0": 80, "r0-rm2-p1": 20,
      },
      byes: [["E"]],
      poolingByeCounts: { E: 1 },
      cfg: { poolingPhase: "swiss", qualAdv: 4 },
    }));

    const winners = makeRound({
      bracket: "winners", winnersTo: 2, losersTo: 1,
    });
    const losers = makeRound({
      roundNum: 2, players: 2, rooms: [2], bracket: "losers",
      winnersTo: 2, losersTo: null,
    });
    const routed = use(makeState({
      players: ["A", "B", "C", "D"],
      rounds: [winners, losers, makeRound({ roundNum: 3 })],
      assignments: [[
        { name: "A", room: 1 }, { name: "B", room: 1 },
        { name: "C", room: 2 }, { name: "D", room: 2 },
      ]],
      scores: {
        "r0-rm1-p0": 100, "r0-rm1-p1": 50,
        "r0-rm2-p0": 80, "r0-rm2-p1": 20,
      },
      scheduleLogic: "double-elimination",
    }));

    const grandFinal = makeRound({
      roundNum: 3,
      players: 2,
      rooms: [2],
      isFinal: true,
      bracket: "grand-final",
      winnersTo: null,
      losersTo: null,
      numGames: 1,
    });
    const final = use(makeState({
      players: ["A", "B", "C"],
      rounds: [winners, losers, grandFinal],
      curRound: 1,
      assignments: [
        [{ name: "A", room: 1 }, { name: "B", room: 1 }],
        [{ name: "B", room: 1 }, { name: "C", room: 1 }],
      ],
      scores: {
        "r0-rm1-p0": 100, "r0-rm1-p1": 50,
        "r1-rm1-p0": 80, "r1-rm1-p1": 20,
      },
      pendingBracketSeeds: { "2": [{ name: "A", isLucky: false }] },
      scheduleLogic: "double-elimination",
    }));

    const malformed = use(makeState({
      players: ["B", "C"],
      rounds: [winners, losers, grandFinal],
      curRound: 1,
      assignments: [[], [{ name: "B", room: 1 }, { name: "C", room: 1 }]],
      scores: { "r1-rm1-p0": 80, "r1-rm1-p1": 20 },
      scheduleLogic: "double-elimination",
    }));

    const tied = use(makeState({
      players: ["A", "B"],
      rounds: [makeRound({ players: 2, rooms: [2] }), grandFinal],
      assignments: [[{ name: "A", room: 1 }, { name: "B", room: 1 }]],
      scores: { "r0-rm1-p0": 10, "r0-rm1-p1": 10 },
    }));
    return { ordinary, swiss, routed, final, malformed, tied };
  });

  expect(actual.ordinary).toMatchObject({
    curRound: 1,
    assignments: [
      expect.any(Array),
      [
        { name: "E", room: 1, isLucky: false },
        { name: "B", room: 2, isLucky: false },
        { name: "C", room: 2, isLucky: false },
        { name: "D", room: 1, isLucky: false },
        { name: "A", room: null, isLucky: false },
      ],
    ],
    byes: [["E"], ["A"]],
    luckyLosers: [undefined, []],
    poolingByeCounts: { E: 1, A: 1 },
    reserveOpen: true,
    needsSave: true,
    alerts: [],
  });
  expect(actual.swiss).toMatchObject({
    curRound: 1,
    assignments: [
      expect.any(Array),
      [
        { name: "A", room: 1, isLucky: false },
        { name: "D", room: 1, isLucky: false },
        { name: "C", room: 2, isLucky: false },
        { name: "E", room: 2, isLucky: false },
        { name: "B", room: null, isLucky: false },
      ],
    ],
    byes: [["E"], ["B"]],
    poolingByeCounts: { E: 1, B: 1 },
    alerts: [],
  });
  expect(actual.routed).toMatchObject({
    curRound: 1,
    assignments: [
      expect.any(Array),
      [
        { name: "B", room: 1, isLucky: false },
        { name: "D", room: 1, isLucky: false },
      ],
    ],
    pendingBracketSeeds: {
      "2": [
        { name: "A", isLucky: false },
        { name: "C", isLucky: false },
      ],
    },
    byes: [undefined, []],
    reserveOpen: false,
    needsSave: true,
    alerts: [],
  });
  expect(actual.final).toMatchObject({
    curRound: 2,
    assignments: [
      expect.any(Array),
      expect.any(Array),
      [
        { name: "A", room: 1, isLucky: false },
        { name: "B", room: 1, isLucky: false },
      ],
    ],
    pendingBracketSeeds: {},
    rounds: [expect.any(Object), expect.any(Object), { wbFinalistName: "A" }],
    alerts: [],
  });
  expect(actual.malformed).toMatchObject({
    curRound: 1,
    assignments: [[], expect.any(Array)],
    pendingBracketSeeds: {},
    needsSave: false,
    alerts: [
      "Can't advance into the Final — 1 entrants would arrive instead of the required 2. A mid-tournament withdrawal has likely thrown off the losers bracket's balance too deeply for the usual single-bye recovery to fix automatically; check Manage Teams, or add a replacement, before advancing further.",
    ],
  });
  expect(actual.tied).toMatchObject({
    curRound: 0,
    needsSave: false,
    alerts: ["Resolve all tie-breaks before advancing."],
  });
});
