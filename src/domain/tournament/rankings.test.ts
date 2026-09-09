import { describe, expect, it } from "vitest";
import {
  computeRankings,
  createEmptyTournamentState,
  lastAssignedRound,
  type TournamentRound,
} from "./index";

const elimination: TournamentRound = {
  roundNum: 1, players: 4, rooms: [2, 2], byeCount: 0,
  isQual: false, isNoElim: false, isSemis: false, isFinal: false,
  advPerRoom: 1, advTotal: 2, luckyCount: 0,
};

describe("tournament rankings", () => {
  it("ranks complete finalists, then eliminations by round and room share", () => {
    const semis = { ...elimination, roundNum: 2, players: 2, rooms: [2], isSemis: true };
    const final = {
      ...elimination, roundNum: 3, players: 2, rooms: [2],
      isFinal: true, advTotal: 1, numGames: 1,
    };
    const state = createEmptyTournamentState({
      players: ["A", "B", "C", "D"],
      rounds: [elimination, semis, final],
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
    expect(lastAssignedRound(state)).toBe(2);
    const rankings = computeRankings(state)!;
    expect(rankings.finalComplete).toBe(true);
    expect(rankings.finalists.map(({ name, total, rank }) => ({ name, total, rank }))).toEqual([
      { name: "A", total: 200, rank: 1 },
      { name: "C", total: 100, rank: 2 },
    ]);
    expect(rankings.eliminatedList.map(({ name, pct, rank, ri }) => ({ name, pct, rank, ri }))).toEqual([
      { name: "B", pct: 1 / 3, rank: 3, ri: 0 },
      { name: "D", pct: 0.2, rank: 4, ri: 0 },
    ]);
    expect(rankings.stillActive).toEqual([]);
  });

  it("keeps incomplete finalists active with live pooling rank metadata", () => {
    const final = { ...elimination, roundNum: 2, players: 2, rooms: [2], isFinal: true, numGames: 2 };
    const state = createEmptyTournamentState({
      players: ["A", "B", "C"],
      rounds: [elimination, final],
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
    const rankings = computeRankings(state)!;
    expect(rankings.finalComplete).toBe(false);
    expect(rankings.finalists).toEqual([]);
    expect(rankings.stillActive.map(({ name, room, isLucky, poolRank }) => ({ name, room, isLucky, poolRank }))).toEqual([
      { name: "A", room: 1, isLucky: false, poolRank: { rank: 2, fp: 2 } },
      { name: "C", room: 1, isLucky: true, poolRank: { rank: 1, fp: 1 } },
    ]);
  });

  it("uses double-elimination route membership to identify a second loss", () => {
    const wb = { ...elimination, bracket: "winners" as const, winnersTo: 2, losersTo: 1 };
    const lb = { ...elimination, roundNum: 2, bracket: "losers" as const, winnersTo: 2, losersTo: null };
    const gf = {
      ...elimination, roundNum: 3, bracket: "grand-final" as const,
      isFinal: true, numGames: 1, wbFinalistName: "A",
    };
    const state = createEmptyTournamentState({
      players: ["A", "B", "C"],
      rounds: [wb, lb, gf],
      assignments: [
        [{ name: "A", room: 1 }, { name: "B", room: 1 }],
        [{ name: "B", room: 1 }, { name: "C", room: 1 }],
        [{ name: "A", room: 1 }, { name: "B", room: 1 }],
      ],
      scores: {
        "r0-rm1-p0": 100, "r0-rm1-p1": 50,
        "r1-rm1-p0": 80, "r1-rm1-p1": 20,
      },
    });
    const rankings = computeRankings(state)!;
    expect(rankings.stillActive.map(({ name }) => name)).toEqual(["A", "B"]);
    expect(rankings.eliminatedList.map(({ name, ri, pct }) => ({ name, ri, pct }))).toEqual([
      { name: "C", ri: 1, pct: 0.2 },
    ]);
  });
});
