import { describe, expect, it } from "vitest";
import {
  applyGroupCutoffOrder,
  applyQualCutoffOrder,
  createEmptyTournamentState,
  detectGroupCutoffTie,
  detectQualCutoffTie,
  detectTieBreaks,
  isTieResolved,
  luckyLoserCandidate,
  orderRoomByScore,
  pickLuckyLosers,
  tieResolutionList,
  type TournamentRound,
  type TournamentStanding,
} from "./index";

const round: TournamentRound = {
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
};

const standings: TournamentStanding[] = [
  { name: "A", totalFP: 1, totalScore: 500, played: 3 },
  { name: "B", totalFP: 2, totalScore: 400, played: 3 },
  { name: "C", totalFP: 2, totalScore: 390, played: 3 },
  { name: "D", totalFP: 4, totalScore: 300, played: 3 },
];

function state() {
  return createEmptyTournamentState({
    players: ["A", "B", "C", "D", "E", "F"],
    rounds: [round],
    assignments: [[
      { name: "A", room: 1 },
      { name: "B", room: 1 },
      { name: "C", room: 1 },
      { name: "D", room: 2 },
      { name: "E", room: 2 },
      { name: "F", room: 2 },
    ]],
    scores: {
      "r0-rm1-p0": 100,
      "r0-rm1-p1": 90,
      "r0-rm1-p2": 90,
      "r0-rm2-p0": 200,
      "r0-rm2-p1": 100,
      "r0-rm2-p2": 50,
    },
    tieResolutions: {
      "r0-rm1-s90": "C",
      "qual-cutoff": ["C"],
    },
    qualTable: standings,
    cfg: { qualAdv: 2, qualifiersPerGroup: 2 },
    groups: [{ label: "A", members: ["A", "B", "C", "D"] }],
    groupStandings: { A: standings },
  });
}

describe("tie ordering", () => {
  it("normalizes old and current tie resolution storage", () => {
    const tournament = state();
    expect(tieResolutionList(tournament, "r0-rm1-s90")).toEqual(["C"]);
    expect(tieResolutionList(tournament, "qual-cutoff")).toEqual(["C"]);
    expect(tieResolutionList(tournament, "missing")).toEqual([]);
  });

  it("orders a resolved score cluster and detects its original members", () => {
    const tournament = state();
    const scored = [
      { name: "A", score: 100 },
      { name: "B", score: 90 },
      { name: "C", score: 90 },
    ];
    expect(orderRoomByScore(scored, 0, 1, tournament)).toEqual([
      { name: "A", score: 100 },
      { name: "C", score: 90 },
      { name: "B", score: 90 },
    ]);
    const ties = detectTieBreaks(0, round, tournament);
    expect(ties).toEqual({
      "r0-rm1-s90": {
        players: [{ name: "B", score: 90 }, { name: "C", score: 90 }],
        rm: 1,
        score: 90,
      },
    });
    expect(isTieResolved("r0-rm1-s90", ties["r0-rm1-s90"], tournament)).toBe(true);
  });
});

describe("lucky-loser selection", () => {
  it("compares the first non-direct finisher by room share", () => {
    const first = luckyLoserCandidate(
      [{ name: "A", score: 100 }, { name: "C", score: 90 }, { name: "B", score: 90 }],
      1,
    );
    const second = luckyLoserCandidate(
      [{ name: "D", score: 200 }, { name: "E", score: 100 }, { name: "F", score: 50 }],
      1,
    );
    expect(first).toEqual({ name: "C", pct: 90 / 280 });
    expect(second).toEqual({ name: "E", pct: 100 / 350 });
    expect(pickLuckyLosers([first!, second!], 1)).toEqual(["C"]);
    expect(
      luckyLoserCandidate(
        [{ name: "X", score: 0 }, { name: "Y", score: 0 }],
        1,
      ),
    ).toBeNull();
  });
});

describe("standings cutoff ties", () => {
  it("detects and applies the independent qualification resolution", () => {
    const tournament = state();
    expect(detectQualCutoffTie(tournament)).toMatchObject({
      key: "qual-cutoff",
      fp: 2,
      players: [standings[1], standings[2]],
    });
    expect(
      applyQualCutoffOrder(standings, tournament).map((entry) => entry.name),
    ).toEqual(["A", "C", "B", "D"]);
  });

  it("does not reuse qualification choices for a group cutoff", () => {
    const tournament = state();
    expect(detectGroupCutoffTie("A", tournament)).toMatchObject({
      key: "group-cutoff-A",
      fp: 2,
      groupLabel: "A",
      players: [standings[1], standings[2]],
    });
    expect(
      applyGroupCutoffOrder("A", standings, tournament).map(
        (entry) => entry.name,
      ),
    ).toEqual(["A", "B", "C", "D"]);
  });
});
