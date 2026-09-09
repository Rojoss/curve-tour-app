import { describe, expect, it } from "vitest";
import {
  computeGrandFinalRaceState,
  createEmptyTournamentState,
  finalsProgressState,
  shouldOpenNextGrandFinalGame,
  type TournamentRound,
} from "./index";

const grandFinal: TournamentRound = {
  roundNum: 1, players: 2, rooms: [2], byeCount: 0,
  isQual: false, isNoElim: false, isSemis: false, isFinal: true,
  advPerRoom: 1, advTotal: 1, luckyCount: 0, numGames: 4,
  bracket: "grand-final", wbFinalistName: "WB",
};

describe("Grand Final race state", () => {
  it("counts wins, ignores a tied game, and stops at the configured target", () => {
    const state = createEmptyTournamentState({
      rounds: [grandFinal],
      assignments: [[{ name: "WB", room: 1 }, { name: "LB", room: 1 }]],
      gamemodeConfig: { grandFinalWbTarget: 2, grandFinalLbTarget: 3 },
      finalScores: {
        "game1-WB": 10, "game1-LB": 5,
        "game2-WB": 7, "game2-LB": 7,
        "game3-WB": 4, "game3-LB": 9,
        "game4-WB": 8, "game4-LB": 6,
      },
    });
    expect(computeGrandFinalRaceState(state, 0, grandFinal)).toEqual({
      wbName: "WB", lbName: "LB", wbWins: 2, lbWins: 1,
      wbTarget: 2, lbTarget: 3, gamesPlayed: 4,
      decided: true, winnerName: "WB",
    });
    expect(finalsProgressState(state, 0, grandFinal)).toMatchObject({
      complete: true,
      order: ["WB", "LB"],
      gameComplete: [true, true, true, true],
      nextGame: null,
    });
  });

  it("opens another game only when every open game is complete and undecided", () => {
    const oneGame = { ...grandFinal, numGames: 1 };
    const state = createEmptyTournamentState({
      rounds: [oneGame],
      assignments: [[{ name: "WB", room: 1 }, { name: "LB", room: 1 }]],
      finalScores: { "game1-WB": 10, "game1-LB": 5 },
    });
    expect(shouldOpenNextGrandFinalGame(state, 0, oneGame)).toBe(true);
    expect(
      shouldOpenNextGrandFinalGame(
        { ...state, finalScores: { "game1-WB": 10 } },
        0,
        oneGame,
      ),
    ).toBe(false);
  });
});

describe("fixed-game Finals progress", () => {
  it("requires every score and orders complete finalists by cumulative total", () => {
    const round = { ...grandFinal, bracket: undefined, wbFinalistName: undefined, numGames: 2 };
    const state = createEmptyTournamentState({
      rounds: [round],
      assignments: [[{ name: "A", room: 1 }, { name: "B", room: 1 }]],
      finalScores: {
        "game1-A": 10, "game2-A": 20,
        "game1-B": 25, "game2-B": 15,
      },
    });
    expect(finalsProgressState(state, 0, round)).toMatchObject({
      complete: true,
      order: ["B", "A"],
      gameComplete: [true, true],
      units: [
        { name: "A", perGame: [10, 20], total: 30, wins: 0 },
        { name: "B", perGame: [25, 15], total: 40, wins: 0 },
      ],
    });
    expect(
      finalsProgressState(
        { ...state, finalScores: { ...state.finalScores, "game2-B": null } },
        0,
        round,
      ),
    ).toMatchObject({ complete: false, nextGame: 2, order: ["A", "B"] });
  });
});
