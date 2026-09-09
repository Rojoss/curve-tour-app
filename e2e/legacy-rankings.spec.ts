import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, page }) => {
  await context.route(/(?:gstatic\.com\/firebasejs|firebaseio\.com)/u, (route) =>
    route.abort(),
  );
  await page.goto("/");
});

test("characterizes completed, active, and double-elimination rankings", async ({
  page,
}) => {
  const actual = await page.evaluate(() => {
    const legacy = window as unknown as Record<string, any>;
    const elimination = {
      roundNum: 1, players: 4, rooms: [2, 2], byeCount: 0,
      isQual: false, isNoElim: false, isSemis: false, isFinal: false,
      advPerRoom: 1, advTotal: 2, luckyCount: 0,
    };
    const common = {
      gameFormat: "ffa-individual", reserves: [], gamemodeConfig: {},
      defenderChanges: {}, tieResolutions: {}, qualTable: [],
      groupStandings: {}, groups: [], cfg: { poolingPhase: "none" },
    };
    const semis = { ...elimination, roundNum: 2, players: 2, rooms: [2], isSemis: true };
    const final = {
      ...elimination, roundNum: 3, players: 2, rooms: [2],
      isFinal: true, advTotal: 1, numGames: 1,
    };
    const completed = legacy.computeRankings({
      ...common,
      players: ["A", "B", "C", "D"], rounds: [elimination, semis, final],
      assignments: [
        [
          { name: "A", room: 1 }, { name: "B", room: 1 },
          { name: "C", room: 2 }, { name: "D", room: 2 },
        ],
        [{ name: "A", room: 1 }, { name: "C", room: 1 }],
        [{ name: "A", room: 1 }, { name: "C", room: 1 }],
      ],
      scores: {
        "r0-rm1-p0": 100, "r0-rm1-p1": 50,
        "r0-rm2-p0": 80, "r0-rm2-p1": 20,
        "r1-rm1-p0": 100, "r1-rm1-p1": 50,
      },
      finalScores: { "game1-A": 200, "game1-C": 100 },
    });

    const activeFinal = { ...final, roundNum: 2, numGames: 2 };
    const active = legacy.computeRankings({
      ...common,
      players: ["A", "B", "C"], rounds: [elimination, activeFinal],
      assignments: [
        [{ name: "A", room: 1 }, { name: "B", room: 1 }, { name: "C", room: 2 }],
        [{ name: "A", room: 1 }, { name: "C", room: 1, isLucky: true }],
      ],
      scores: { "r0-rm1-p0": 100, "r0-rm1-p1": 50, "r0-rm2-p0": 80 },
      finalScores: { "game1-A": 10, "game1-C": 20 },
      cfg: { poolingPhase: "qual-table" },
      qualTable: [
        { name: "C", totalFP: 1, totalScore: 80, played: 1 },
        { name: "A", totalFP: 2, totalScore: 100, played: 1 },
      ],
    });

    const wb = { ...elimination, bracket: "winners", winnersTo: 2, losersTo: 1 };
    const lb = { ...elimination, roundNum: 2, bracket: "losers", winnersTo: 2, losersTo: null };
    const gf = {
      ...elimination, roundNum: 3, bracket: "grand-final",
      isFinal: true, numGames: 1, wbFinalistName: "A",
    };
    const double = legacy.computeRankings({
      ...common,
      players: ["A", "B", "C"], rounds: [wb, lb, gf],
      assignments: [
        [{ name: "A", room: 1 }, { name: "B", room: 1 }],
        [{ name: "B", room: 1 }, { name: "C", room: 1 }],
        [{ name: "A", room: 1 }, { name: "B", room: 1 }],
      ],
      scores: {
        "r0-rm1-p0": 100, "r0-rm1-p1": 50,
        "r1-rm1-p0": 80, "r1-rm1-p1": 20,
      },
      finalScores: {},
    });
    const summarize = (rankings: any) => ({
      finalComplete: rankings.finalComplete,
      active: rankings.stillActive.map((entry: any) => ({
        name: entry.name, room: entry.room, isLucky: entry.isLucky,
        poolRank: entry.poolRank,
      })),
      finalists: rankings.finalists.map((entry: any) => ({
        name: entry.name, total: entry.total, rank: entry.rank,
      })),
      eliminated: rankings.eliminatedList.map((entry: any) => ({
        name: entry.name, ri: entry.ri, pct: entry.pct, rank: entry.rank,
      })),
      lastRi: rankings.lastRi,
    });
    return {
      completed: summarize(completed),
      active: summarize(active),
      double: summarize(double),
    };
  });

  expect(actual).toEqual({
    completed: {
      finalComplete: true,
      active: [],
      finalists: [
        { name: "A", total: 200, rank: 1 },
        { name: "C", total: 100, rank: 2 },
      ],
      eliminated: [
        { name: "B", ri: 0, pct: 1 / 3, rank: 3 },
        { name: "D", ri: 0, pct: 0.2, rank: 4 },
      ],
      lastRi: 2,
    },
    active: {
      finalComplete: false,
      active: [
        { name: "A", room: 1, isLucky: false, poolRank: { rank: 2, fp: 2 } },
        { name: "C", room: 1, isLucky: true, poolRank: { rank: 1, fp: 1 } },
      ],
      finalists: [],
      eliminated: [{ name: "B", ri: 0, pct: 1 / 3, rank: 1 }],
      lastRi: 1,
    },
    double: {
      finalComplete: false,
      active: [
        { name: "A", room: 1, isLucky: false, poolRank: null },
        { name: "B", room: 1, isLucky: false, poolRank: null },
      ],
      finalists: [],
      eliminated: [{ name: "C", ri: 1, pct: 0.2, rank: 1 }],
      lastRi: 2,
    },
  });
});
