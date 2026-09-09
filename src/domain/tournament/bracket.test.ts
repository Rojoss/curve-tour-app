import { describe, expect, it } from "vitest";
import { bracketFollowStatus, bracketRoundDefaultCollapsed, bracketRoundLabels } from "./bracket";
import { createEmptyTournamentState } from "./fixtures";
import type { TournamentRound } from "./types";

const base: TournamentRound = {
  roundNum: 1, players: 2, rooms: [2], byeCount: 0,
  isQual: false, isNoElim: false, isSemis: false, isFinal: false,
  advPerRoom: 1, advTotal: 1, luckyCount: 0,
};

describe("bracket presentation model", () => {
  it("labels interleaved winners, losers, and grand-final rounds", () => {
    expect(bracketRoundLabels({ rounds: [
      { ...base, bracket: "winners" },
      { ...base, bracket: "losers" },
      { ...base, bracket: "winners" },
      { ...base, bracket: "grand-final", isFinal: true },
    ] })).toEqual([
      { label: "WB Round 1", accent: "wb" },
      { label: "LB Round 1", accent: "lb" },
      { label: "WB Round 2", accent: "wb" },
      { label: "🏆 Grand Final", accent: "gf" },
    ]);
  });

  it("tracks followed units through rooms, byes, and elimination", () => {
    const state = createEmptyTournamentState({
      assignments: [
        [{ name: "A", room: 1 }, { name: "B", room: 1 }],
        [{ name: "A", room: null }],
        [{ name: "B", room: 1 }],
      ],
      byes: [[], ["A"], []],
    });
    expect(bracketFollowStatus(state, "A")).toMatchObject({
      lastRi: 1, room: null, isBye: true, eliminated: true,
      rounds: { 0: { room: 1, isBye: false }, 1: { room: null, isBye: true } },
    });
    expect(bracketFollowStatus(state, "missing")).toBeNull();
  });

  it("collapses only rounds older than the immediately previous round", () => {
    expect([0, 1, 2, 3].map((index) => bracketRoundDefaultCollapsed(index, 3))).toEqual([true, true, false, false]);
  });
});
