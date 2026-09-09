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
