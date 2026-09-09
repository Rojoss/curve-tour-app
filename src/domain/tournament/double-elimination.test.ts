import { describe, expect, it } from "vitest";
import {
  buildTournamentProgression,
  concentratedByeFirstRound,
  nextPowerOf2AndRounds,
  raceDoubleEliminationBracketPhase,
  getMinimumBracketUnits,
  sharedFinalDoubleEliminationBracketPhase,
  type TournamentRound,
} from "./index";

function summarize(rounds: TournamentRound[]) {
  return rounds.map((round) => [
    round.roundNum,
    round.bracket ?? null,
    round.players,
    round.rooms,
    round.byeCount,
    round.advPerRoom,
    round.advTotal,
    round.luckyCount,
    round.winnersTo,
    round.losersTo,
    round.isFinal,
    round.numGames ?? null,
    Boolean(round.bracketPhaseFirstRound),
  ]);
}

describe("race-style double elimination", () => {
  it("uses exact power-of-two shapes and concentrated opening byes", () => {
    expect([4, 5, 8, 13].map(nextPowerOf2AndRounds)).toEqual([
      { bracketSize: 4, numRounds: 2 },
      { bracketSize: 8, numRounds: 3 },
      { bracketSize: 8, numRounds: 3 },
      { bracketSize: 16, numRounds: 4 },
    ]);
    expect(
      concentratedByeFirstRound(5, nextPowerOf2AndRounds(5), {
        min: 2,
        max: 2,
        ideal: 2,
      }),
    ).toEqual({ rooms: [2], byeCount: 3 });
  });

  it("matches the characterized eight-player play order and routes", () => {
    expect(
      summarize(
        raceDoubleEliminationBracketPhase(8, 3, {
          roomSize: { min: 2, max: 2, ideal: 2 },
          oddCountStrategy: "bye",
        }),
      ),
    ).toEqual([
      [3, "winners", 8, [2, 2, 2, 2], 0, 1, 4, 0, 4, 3, false, null, true],
      [4, "losers", 4, [2, 2], 0, 1, 2, 0, 5, null, false, null, false],
      [5, "winners", 4, [2, 2], 0, 1, 2, 0, 7, 5, false, null, false],
      [6, "losers", 4, [2, 2], 0, 1, 2, 0, 6, null, false, null, false],
      [7, "losers", 2, [2], 0, 1, 1, 0, 8, null, false, null, false],
      [8, "winners", 2, [2], 0, 1, 1, 0, 9, 8, false, null, false],
      [9, "losers", 2, [2], 0, 1, 1, 0, 9, null, false, null, false],
      [10, "grand-final", 2, [2], 0, 1, 1, 0, null, null, true, 1, false],
    ]);
  });

  it("preserves the unusual five-player opening projection", () => {
    const rounds = raceDoubleEliminationBracketPhase(5, 3, {
      roomSize: { min: 2, max: 2, ideal: 2 },
      oddCountStrategy: "bye",
    });
    expect(summarize(rounds).slice(0, 4)).toEqual([
      [3, "winners", 5, [2], 3, 1, 4, 0, 4, 3, false, null, true],
      [4, "losers", 1, [], 1, 1, 1, 0, 5, null, false, null, false],
      [5, "winners", 4, [2, 2], 0, 1, 2, 0, 7, 5, false, null, false],
      [6, "losers", 3, [2], 1, 1, 2, 0, 6, null, false, null, false],
    ]);
  });

  it("rejects non-head-to-head and flex configurations with legacy messages", () => {
    expect(() =>
      raceDoubleEliminationBracketPhase(8, 1, {
        roomSize: { min: 3, max: 3, ideal: 3 },
      }),
    ).toThrow(
      "doubleEliminationBracketPhase requires a head-to-head room shape (roomSize.ideal === 2) — got 3.",
    );
    expect(() =>
      raceDoubleEliminationBracketPhase(8, 1, {
        roomSize: { min: 2, max: 3, ideal: 2 },
        oddCountStrategy: "flex",
      }),
    ).toThrow(
      'doubleEliminationBracketPhase does not support the "flex" odd-count strategy — a 3-unit room is not double elimination. Use "none" or "bye" instead.',
    );
  });

  it("composes pooling and bracket phases with global route indices", () => {
    expect(
      getMinimumBracketUnits("double-elimination", {
        min: 2,
        max: 2,
        ideal: 2,
      }),
    ).toBe(4);
    const progression = buildTournamentProgression({
      bracketPhase: "double-elimination",
      poolingPhase: "none",
      config: {
        n: 8,
        qualAdv: 4,
        groupSize: 4,
        roundRobinMode: "single",
        qualifiersPerGroup: 2,
      },
      format: {
        roomSize: { min: 2, max: 2, ideal: 2 },
        oddCountStrategy: "bye",
        qualRounds: 3,
        swissRounds: 3,
      },
      roster: Array.from({ length: 8 }, (_, index) => `P${index + 1}`),
    });
    expect(progression.rounds.map((round) => round.roundNum)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(progression.rounds[2].winnersTo).toBe(4);
  });
});

describe("shared-Final double elimination", () => {
  it("matches FFA narrowing, deferred LB rounds, and route targets", () => {
    const rounds = sharedFinalDoubleEliminationBracketPhase(32, 4, {
      roomSize: { min: 6, max: 8, ideal: 8 },
      finalSize: 8,
      lbQualifiers: 2,
      finalsGames: 3,
    });
    expect(rounds.map((round) => round.bracket ?? "final")).toEqual([
      "winners", "winners", "losers", "winners", "losers", "winners",
      "losers", "winners", "losers", "winners", "losers", "winners",
      "losers", "winners", "losers", "final",
    ]);
    expect(rounds.map((round) => round.players)).toEqual([
      32, 26, 11, 21, 11, 18, 12, 14, 10, 12, 11, 8, 7, 7, 7, 8,
    ]);
    expect(rounds.map((round) => [round.winnersTo, round.losersTo])).toEqual([
      [4, 5], [6, 5], [7, null], [8, 7], [9, null], [10, 9],
      [11, null], [12, 11], [13, null], [14, 13], [15, null],
      [16, 15], [17, null], [18, 17], [18, null], [null, null],
    ]);
    expect(rounds.at(-1)).toEqual({
      roundNum: 19,
      isQual: false,
      isNoElim: false,
      isSemis: false,
      isFinal: true,
      rooms: [8],
      byeCount: 0,
      players: 8,
      advPerRoom: 1,
      advTotal: 1,
      luckyCount: 0,
      numGames: 3,
      winnersTo: null,
      losersTo: null,
    });
  });

  it("matches three-way team rooms and shared Final metadata", () => {
    const rounds = sharedFinalDoubleEliminationBracketPhase(12, 3, {
      roomSize: { min: 2, max: 3, ideal: 3 },
      finalSize: 3,
      lbQualifiers: 1,
      finalsGames: 2,
    });
    expect(rounds.map((round) => round.rooms)).toEqual([
      [3, 3, 3, 3], [3], [3, 3, 3], [2, 2], [3, 2, 2], [3, 2],
      [3, 2], [2, 2], [2, 2], [2, 2], [3], [3], [3],
    ]);
    expect(rounds.map((round) => [round.advPerRoom, round.advTotal, round.luckyCount])).toEqual([
      [2, 9, 1], [2, 2, 0], [2, 7, 1], [1, 3, 1], [1, 5, 2],
      [1, 3, 1], [2, 4, 0], [1, 3, 1], [1, 3, 1], [1, 2, 0],
      [2, 2, 0], [1, 1, 0], [1, 1, 0],
    ]);
    expect(rounds.at(-1)?.bracket).toBeUndefined();
    expect(rounds.at(-1)?.numGames).toBe(2);
  });

  it("rejects invalid qualifier splits", () => {
    expect(() =>
      sharedFinalDoubleEliminationBracketPhase(16, 1, {
        roomSize: { min: 6, max: 8, ideal: 8 },
        finalSize: 8,
        lbQualifiers: 8,
        finalsGames: 1,
      }),
    ).toThrow(
      "doubleEliminationSharedFinalBracketPhase requires lbQualifiers >= 1 and finalSize - lbQualifiers >= 1 — got lbQualifiers=8, finalSize=8.",
    );
  });

  it("uses the room-based minimum field", () => {
    expect(
      getMinimumBracketUnits("double-elimination-shared-final", {
        min: 6,
        max: 8,
        ideal: 8,
      }),
    ).toBe(16);
    expect(
      getMinimumBracketUnits("single-elimination", {
        min: 3,
        max: 4,
        ideal: 4,
      }),
    ).toBe(8);
  });
});
