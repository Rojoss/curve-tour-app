import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, page }) => {
  await context.route(/(?:gstatic\.com\/firebasejs|firebaseio\.com)/u, (route) =>
    route.abort(),
  );
  await page.goto("/");
});

test("characterizes ties, cutoff ordering, and lucky-loser selection", async ({
  page,
}) => {
  const actual = await page.evaluate(() => {
    const legacy = window as unknown as Record<string, any>;
    const scored = [
      { name: "A", score: 100 },
      { name: "B", score: 90 },
      { name: "C", score: 90 },
    ];
    const standings = [
      { name: "A", totalFP: 1, totalScore: 500, played: 3 },
      { name: "B", totalFP: 2, totalScore: 400, played: 3 },
      { name: "C", totalFP: 2, totalScore: 390, played: 3 },
      { name: "D", totalFP: 4, totalScore: 300, played: 3 },
    ];
    const state = {
      gameFormat: "ffa-individual",
      players: ["A", "B", "C", "D", "E", "F"],
      reserves: [],
      rounds: [
        {
          roundNum: 1,
          players: 6,
          rooms: [3, 3],
          byeCount: 0,
          isQual: false,
          isNoElim: false,
          isSemis: false,
          isFinal: false,
          advPerRoom: 1,
          advTotal: 4,
          luckyCount: 2,
        },
      ],
      assignments: [[
        { name: "A", room: 1 }, { name: "B", room: 1 }, { name: "C", room: 1 },
        { name: "D", room: 2 }, { name: "E", room: 2 }, { name: "F", room: 2 },
      ]],
      scores: {
        "r0-rm1-p0": 100, "r0-rm1-p1": 90, "r0-rm1-p2": 90,
        "r0-rm2-p0": 200, "r0-rm2-p1": 100, "r0-rm2-p2": 50,
      },
      finalScores: {},
      defenderChanges: {},
      tieResolutions: { "r0-rm1-s90": "C", "qual-cutoff": ["C"] },
      qualTable: standings,
      cfg: { qualAdv: 2, qualifiersPerGroup: 2 },
      groups: [{ label: "A", members: ["A", "B", "C", "D"] }],
      groupStandings: { A: standings },
      gamemodeConfig: {},
    };
    Object.assign(legacy.T, state);
    const ordered = legacy.orderRoomByScore(scored, 0, 1, state);
    const firstCandidate = legacy.luckyLoserCandidate(ordered, 1);
    const secondCandidate = legacy.luckyLoserCandidate(
      [
        { name: "D", score: 200 },
        { name: "E", score: 100 },
        { name: "F", score: 50 },
      ],
      1,
    );
    const ordinaryAdvancement = legacy.roomBasedComputeAdvancement(
      0,
      state.rounds[0],
      {},
    );
    const doubleAdvancement = legacy.doubleEliminationComputeAdvancement(
      0,
      state.rounds[0],
      {},
    );
    legacy.T.scores = {
      ...state.scores,
      "r0-rm1-p0": 90,
      "r0-rm1-p1": 90,
      "r0-rm1-p2": 100,
    };
    legacy.T.tieResolutions = { ...state.tieResolutions };
    legacy.invalidateStaleTieResolutions(0, 1);
    const invalidatedTieResolutions = { ...legacy.T.tieResolutions };
    return {
      resolutionLists: [
        legacy.tieResolutionList(state, "r0-rm1-s90"),
        legacy.tieResolutionList(state, "qual-cutoff"),
        legacy.tieResolutionList(state, "missing"),
      ],
      ordered,
      ties: legacy.detectTieBreaks(0, state.rounds[0], state),
      tieResolved: legacy.isTieResolved(
        "r0-rm1-s90",
        legacy.detectTieBreaks(0, state.rounds[0], state)["r0-rm1-s90"],
        state,
      ),
      candidates: [firstCandidate, secondCandidate],
      picked: legacy.pickLuckyLosers([firstCandidate, secondCandidate], 1),
      ordinaryAdvancement,
      doubleAdvancement,
      invalidatedTieResolutions,
      noCandidate: legacy.luckyLoserCandidate(
        [{ name: "X", score: 0 }, { name: "Y", score: 0 }],
        1,
      ),
      qualTie: legacy.detectQualCutoffTie(state),
      qualOrder: legacy.applyQualCutoffOrder(standings).map((entry: any) => entry.name),
      groupTie: legacy.detectGroupCutoffTie("A", state),
      groupOrder: legacy.applyGroupCutoffOrder("A", standings).map((entry: any) => entry.name),
    };
  });

  expect(actual).toEqual({
    resolutionLists: [["C"], ["C"], []],
    ordered: [
      { name: "A", score: 100 },
      { name: "C", score: 90 },
      { name: "B", score: 90 },
    ],
    ties: {
      "r0-rm1-s90": {
        players: [{ name: "B", score: 90 }, { name: "C", score: 90 }],
        rm: 1,
        score: 90,
      },
    },
    tieResolved: true,
    candidates: [
      { name: "C", pct: 90 / 280 },
      { name: "E", pct: 100 / 350 },
    ],
    picked: ["C"],
    ordinaryAdvancement: {
      advancing: [
        { name: "A", isLucky: false },
        { name: "D", isLucky: false },
        { name: "C", isLucky: true },
        { name: "E", isLucky: true },
      ],
      luckyNames: ["C", "E"],
    },
    doubleAdvancement: {
      winners: [{ name: "A" }, { name: "D" }, { name: "C" }, { name: "E" }],
      losers: [{ name: "B" }, { name: "F" }],
      luckyNames: ["C", "E"],
    },
    invalidatedTieResolutions: { "qual-cutoff": ["C"] },
    noCandidate: null,
    qualTie: {
      key: "qual-cutoff",
      players: [
        { name: "B", totalFP: 2, totalScore: 400, played: 3 },
        { name: "C", totalFP: 2, totalScore: 390, played: 3 },
      ],
      fp: 2,
      rm: null,
    },
    qualOrder: ["A", "C", "B", "D"],
    groupTie: {
      key: "group-cutoff-A",
      players: [
        { name: "B", totalFP: 2, totalScore: 400, played: 3 },
        { name: "C", totalFP: 2, totalScore: 390, played: 3 },
      ],
      fp: 2,
      rm: null,
      groupLabel: "A",
    },
    groupOrder: ["A", "B", "C", "D"],
  });
});

test("characterizes cumulative qualification and group standings", async ({
  page,
}) => {
  const actual = await page.evaluate(() => {
    const legacy = window as unknown as Record<string, any>;
    const baseRound = {
      players: 4, rooms: [2, 2], byeCount: 0, isNoElim: true,
      isSemis: false, isFinal: false, advPerRoom: null, advTotal: 4,
      luckyCount: 0,
    };
    Object.assign(legacy.T, {
      gameFormat: "ffa-individual",
      players: ["A", "B", "C", "D"],
      reserves: [],
      rounds: [
        { ...baseRound, roundNum: 1, isQual: true },
        { ...baseRound, roundNum: 2, isQual: true },
      ],
      assignments: [
        [
          { name: "A", room: 1 }, { name: "B", room: 1 },
          { name: "C", room: 2 }, { name: "D", room: 2 },
        ],
        [
          { name: "A", room: 1 }, { name: "C", room: 1 },
          { name: "B", room: 2 }, { name: "D", room: 2 },
        ],
      ],
      scores: {
        "r0-rm1-p0": 100, "r0-rm1-p1": 50,
        "r0-rm2-p0": 90, "r0-rm2-p1": 80,
        "r1-rm1-p0": 70, "r1-rm1-p1": 60,
        "r1-rm2-p0": 50, "r1-rm2-p1": 40,
      },
      finalScores: {}, defenderChanges: {}, tieResolutions: {},
      gamemodeConfig: {},
    });
    legacy.updateQualTable();
    const qualification = legacy.T.qualTable;

    Object.assign(legacy.T, {
      players: ["A1", "A2", "B1", "B2"],
      groups: [
        { label: "A", members: ["A1", "A2"] },
        { label: "B", members: ["B1", "B2"] },
      ],
      rounds: [{
        ...baseRound, roundNum: 1, isQual: false, isGroupStage: true,
        roomGroups: ["A", "B"],
      }],
      assignments: [[
        { name: "A1", room: 1 }, { name: "A2", room: 1 },
        { name: "B1", room: 2 }, { name: "B2", room: 2 },
      ]],
      scores: {
        "r0-rm1-p0": 100, "r0-rm1-p1": 50,
        "r0-rm2-p0": 90, "r0-rm2-p1": 80,
      },
      groupStandings: {}, cfg: { qualifiersPerGroup: 1 },
    });
    legacy.updateGroupStandings();
    return { qualification, groups: legacy.T.groupStandings };
  });

  expect(actual).toEqual({
    qualification: [
      { name: "A", totalFP: 1.9983, totalScore: 170, played: 2 },
      { name: "C", totalFP: 2.9985, totalScore: 150, played: 2 },
      { name: "B", totalFP: 2.999, totalScore: 100, played: 2 },
      { name: "D", totalFP: 3.9988, totalScore: 120, played: 2 },
    ],
    groups: {
      A: [
        { name: "A1", totalFP: 0.999, totalScore: 100, played: 1 },
        { name: "A2", totalFP: 1.9995, totalScore: 50, played: 1 },
      ],
      B: [
        { name: "B1", totalFP: 0.9991, totalScore: 90, played: 1 },
        { name: "B2", totalFP: 1.9992, totalScore: 80, played: 1 },
      ],
    },
  });
});

test("characterizes seeding, bye rotation, and Swiss rematch avoidance", async ({
  page,
}) => {
  const actual = await page.evaluate(() => {
    const legacy = window as unknown as Record<string, any>;
    const originalRandom = Math.random;
    const values = [0.4, 0.1, 0.8];
    Math.random = () => values.shift() ?? 0;
    const random = legacy.randomSeed(["A", "B", "C", "D"], [2, 2]);
    Math.random = originalRandom;

    legacy.T.groups = [
      { label: "A", members: ["A1", "A2"] },
      { label: "B", members: ["B1", "B2"] },
    ];
    const avoided = legacy.avoidSameGroupInFirstBracketRound([
      { name: "A1", room: 1 }, { name: "A2", room: 1 },
      { name: "B1", room: 2 }, { name: "B2", room: 2 },
    ]);
    legacy.T.poolingByeCounts = { A: 2, B: 0, C: 1 };
    const poolingBye = legacy.selectPoolingBye([
      { name: "A" }, { name: "B" }, { name: "C" },
    ]);

    Object.assign(legacy.T, {
      gameFormat: "ffa-individual",
      players: ["A", "B", "C", "D", "E"],
      reserves: [],
      poolingByeCounts: { C: 1 },
      rounds: [{
        roundNum: 1, players: 5, rooms: [2, 2], byeCount: 1,
        isQual: false, isSwiss: true, isNoElim: true, isSemis: false,
        isFinal: false, advPerRoom: null, advTotal: 5, luckyCount: 0,
      }],
      assignments: [[
        { name: "A", room: 1 }, { name: "D", room: 1 },
        { name: "C", room: 2 }, { name: "E", room: 2 },
        { name: "B", room: null },
      ]],
      scores: {}, finalScores: {}, defenderChanges: {}, tieResolutions: {},
      gamemodeConfig: { roomSize: { min: 2, max: 2, ideal: 2 } },
    });
    const swiss = legacy.swissFoldPair(["A", "B", "C", "D", "E"], 0);
    return {
      snakeRooms: legacy.snakeSeed(["A", "B", "C", "D", "E", "F", "G"], 3)
        .map((entry: any) => entry.room),
      random,
      avoided,
      poolingBye,
      pairKey: legacy.swissPairKey("D", "A"),
      swiss,
      poolingByeCounts: legacy.T.poolingByeCounts,
    };
  });

  expect(actual).toEqual({
    snakeRooms: [1, 2, 3, 3, 2, 1, 1],
    random: [
      { name: "C", room: 1, isLucky: false },
      { name: "D", room: 1, isLucky: false },
      { name: "A", room: 2, isLucky: false },
      { name: "B", room: 2, isLucky: false },
    ],
    avoided: [
      { name: "A1", room: 1 }, { name: "A2", room: 2 },
      { name: "B1", room: 1 }, { name: "B2", room: 2 },
    ],
    poolingBye: { name: "B" },
    pairKey: "A|D",
    swiss: {
      seeded: [
        { name: "A", room: 1, isLucky: false },
        { name: "E", room: 1, isLucky: false },
        { name: "C", room: 2, isLucky: false },
        { name: "D", room: 2, isLucky: false },
        { name: "B", room: null, isLucky: false },
      ],
      byeName: "B",
    },
    poolingByeCounts: { B: 1, C: 1 },
  });
});

test("characterizes Grand Final races and fixed-game Finals progress", async ({
  page,
}) => {
  const actual = await page.evaluate(() => {
    const legacy = window as unknown as Record<string, any>;
    const grandFinal = {
      roundNum: 1, players: 2, rooms: [2], byeCount: 0,
      isQual: false, isNoElim: false, isSemis: false, isFinal: true,
      advPerRoom: 1, advTotal: 1, luckyCount: 0, numGames: 4,
      bracket: "grand-final", wbFinalistName: "WB",
    };
    const raceState = {
      gameFormat: "ffa-individual",
      rounds: [grandFinal],
      assignments: [[{ name: "WB", room: 1 }, { name: "LB", room: 1 }]],
      gamemodeConfig: { grandFinalWbTarget: 2, grandFinalLbTarget: 3 },
      finalScores: {
        "game1-WB": 10, "game1-LB": 5,
        "game2-WB": 7, "game2-LB": 7,
        "game3-WB": 4, "game3-LB": 9,
        "game4-WB": 8, "game4-LB": 6,
      },
      scores: {}, players: ["WB", "LB"], reserves: [], defenderChanges: {},
    };
    const oneGame = { ...grandFinal, numGames: 1 };
    const undecided = {
      ...raceState,
      rounds: [oneGame],
      finalScores: { "game1-WB": 10, "game1-LB": 5 },
      gamemodeConfig: { grandFinalWbTarget: 2, grandFinalLbTarget: 3 },
    };
    const plainFinal = {
      ...grandFinal,
      bracket: undefined,
      wbFinalistName: undefined,
      numGames: 2,
    };
    const plainState = {
      ...raceState,
      rounds: [plainFinal],
      assignments: [[{ name: "A", room: 1 }, { name: "B", room: 1 }]],
      players: ["A", "B"],
      finalScores: {
        "game1-A": 10, "game2-A": 20,
        "game1-B": 25, "game2-B": 15,
      },
    };
    legacy.renderAdminRound = () => undefined;
    legacy.T = {
      ...undecided,
      curRound: 0,
      cfg: { poolingPhase: "none" },
      byes: [], luckyLosers: [], poolingByeCounts: {}, pendingBracketSeeds: {},
      qualTable: [], groupStandings: {}, groups: [], tieResolutions: {},
      reserveOpen: false, needsSave: false,
    };
    const stillRacing = legacy.checkGrandFinalRace();
    const openedGames = legacy.T.rounds[0].numGames;
    legacy.T = {
      ...legacy.T,
      rounds: [{ ...grandFinal, numGames: 3 }],
      finalScores: {
        "game1-WB": 1, "game1-LB": 2,
        "game2-WB": 1, "game2-LB": 2,
        "game3-WB": 1, "game3-LB": 2,
      },
    };
    const losingSideWon = legacy.computeGrandFinalRaceState(
      legacy.T,
      0,
      legacy.T.rounds[0],
    );
    const raceEnded = legacy.checkGrandFinalRace();
    return {
      race: legacy.computeGrandFinalRaceState(raceState, 0, grandFinal),
      raceProgress: legacy.finalsProgressState(raceState, 0, grandFinal),
      undecided: legacy.computeGrandFinalRaceState(undecided, 0, oneGame),
      plain: legacy.finalsProgressState(plainState, 0, plainFinal),
      incomplete: legacy.finalsProgressState(
        { ...plainState, finalScores: { ...plainState.finalScores, "game2-B": null } },
        0,
        plainFinal,
      ),
      raceTransition: { stillRacing, openedGames, losingSideWon, raceEnded },
    };
  });

  expect(actual.race).toEqual({
    wbName: "WB", lbName: "LB", wbWins: 2, lbWins: 1,
    wbTarget: 2, lbTarget: 3, gamesPlayed: 4,
    decided: true, winnerName: "WB",
  });
  expect(actual.raceProgress).toMatchObject({
    isGrandFinal: true,
    complete: true,
    order: ["WB", "LB"],
    gameComplete: [true, true, true, true],
    nextGame: null,
  });
  expect(actual.undecided).toMatchObject({
    wbWins: 1, lbWins: 0, gamesPlayed: 1, decided: false, winnerName: null,
  });
  expect(actual.plain).toMatchObject({
    isGrandFinal: false,
    complete: true,
    order: ["B", "A"],
    gameComplete: [true, true],
    units: [
      { name: "A", perGame: [10, 20], total: 30, wins: 0 },
      { name: "B", perGame: [25, 15], total: 40, wins: 0 },
    ],
  });
  expect(actual.incomplete).toMatchObject({
    complete: false,
    nextGame: 2,
    order: ["A", "B"],
  });
  expect(actual.raceTransition).toMatchObject({
    stillRacing: true,
    openedGames: 2,
    losingSideWon: {
      wbWins: 0,
      lbWins: 3,
      decided: true,
      winnerName: "LB",
    },
    raceEnded: false,
  });
});
