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
