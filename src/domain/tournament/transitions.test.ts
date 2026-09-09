import { describe, expect, it } from "vitest";
import {
  advanceTournamentRound,
  createEmptyTournamentState,
  getAllTies,
  hasPendingTies,
  type TournamentRound,
} from "./index";

function round(
  overrides: Partial<TournamentRound> = {},
): TournamentRound {
  return {
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
  };
}

describe("ordinary round transitions", () => {
  it("carries the current bye, rotates a pooling bye, and snake-seeds", () => {
    const warmup = round({ isNoElim: true, advPerRoom: null, advTotal: 5 });
    const tournament = createEmptyTournamentState({
      players: ["A", "B", "C", "D", "E"],
      rounds: [
        warmup,
        { ...warmup, roundNum: 2 },
        round({ roundNum: 3 }),
      ],
      assignments: [[
        { name: "A", room: 1 },
        { name: "B", room: 1 },
        { name: "C", room: 2 },
        { name: "D", room: 2 },
        { name: "E", room: null },
      ]],
      scores: {
        "r0-rm1-p0": 100,
        "r0-rm1-p1": 50,
        "r0-rm2-p0": 80,
        "r0-rm2-p1": 20,
      },
      byes: [["E"]],
      poolingByeCounts: { E: 1 },
      cfg: { poolingPhase: "none" },
      gamemodeConfig: {
        roomSize: { min: 2, max: 2, ideal: 2 },
        oddCountStrategy: "bye",
      },
    });

    const result = advanceTournamentRound(tournament);
    expect(result.status).toBe("advanced");
    if (result.status !== "advanced") return;
    expect(result.state.assignments[1]).toEqual([
      { name: "E", room: 1, isLucky: false },
      { name: "B", room: 2, isLucky: false },
      { name: "C", room: 2, isLucky: false },
      { name: "D", room: 1, isLucky: false },
      { name: "A", room: null, isLucky: false },
    ]);
    expect(result.state.byes[1]).toEqual(["A"]);
    expect(result.state.luckyLosers[1]).toEqual([]);
    expect(result.state.poolingByeCounts).toEqual({ E: 1, A: 1 });
    expect(result.state).toMatchObject({
      curRound: 1,
      reserveOpen: true,
      needsSave: true,
    });
    expect(tournament.curRound).toBe(0);
    expect(tournament.assignments[1]).toBeUndefined();
  });

  it("blocks an unresolved room tie before mutating the round", () => {
    const tournament = createEmptyTournamentState({
      players: ["A", "B"],
      rounds: [round({ players: 2, rooms: [2] }), round({ isFinal: true })],
      assignments: [[{ name: "A", room: 1 }, { name: "B", room: 1 }]],
      scores: { "r0-rm1-p0": 10, "r0-rm1-p1": 10 },
      cfg: { poolingPhase: "none" },
      gamemodeConfig: { roomSize: { min: 2, max: 2, ideal: 2 } },
    });
    expect(Object.keys(getAllTies(tournament, 0))).toEqual(["r0-rm1-s10"]);
    expect(hasPendingTies(tournament, 0)).toBe(true);
    expect(advanceTournamentRound(tournament)).toMatchObject({
      status: "blocked",
      reason: "pending-ties",
      message: "Resolve all tie-breaks before advancing.",
      state: { curRound: 0, assignments: [tournament.assignments[0]] },
    });
  });

  it("concentrates every shortfall bye at the first bracket round", () => {
    const warmup = round({
      players: 5,
      rooms: [3, 2],
      isNoElim: true,
      advPerRoom: null,
      advTotal: 5,
    });
    const tournament = createEmptyTournamentState({
      players: ["A", "B", "C", "D", "E"],
      rounds: [
        warmup,
        round({
          roundNum: 2,
          players: 5,
          rooms: [2],
          bracketPhaseFirstRound: true,
        }),
      ],
      assignments: [[
        { name: "A", room: 1 },
        { name: "B", room: 1 },
        { name: "C", room: 1 },
        { name: "D", room: 2 },
        { name: "E", room: 2 },
      ]],
      scores: {
        "r0-rm1-p0": 100,
        "r0-rm1-p1": 90,
        "r0-rm1-p2": 80,
        "r0-rm2-p0": 70,
        "r0-rm2-p1": 60,
      },
      cfg: { poolingPhase: "none" },
      gamemodeConfig: {
        roomSize: { min: 2, max: 2, ideal: 2 },
        oddCountStrategy: "bye",
      },
    });
    const result = advanceTournamentRound(tournament);
    expect(result.status).toBe("advanced");
    if (result.status !== "advanced") return;
    expect(result.state.byes[1]).toEqual(["A", "B", "C"]);
    expect(result.state.assignments[1]).toEqual([
      { name: "D", room: 1, isLucky: false },
      { name: "E", room: 1, isLucky: false },
      { name: "A", room: null, isLucky: false },
      { name: "B", room: null, isLucky: false },
      { name: "C", room: null, isLucky: false },
    ]);
  });

  it("uses live standings to fold-pair a later Swiss round", () => {
    const swiss = round({
      players: 5,
      isNoElim: true,
      isSwiss: true,
      advPerRoom: null,
      advTotal: 5,
    });
    const tournament = createEmptyTournamentState({
      players: ["A", "B", "C", "D", "E"],
      rounds: [swiss, { ...swiss, roundNum: 2 }, round({ roundNum: 3 })],
      assignments: [[
        { name: "A", room: 1 },
        { name: "B", room: 1 },
        { name: "C", room: 2 },
        { name: "D", room: 2 },
        { name: "E", room: null },
      ]],
      scores: {
        "r0-rm1-p0": 100,
        "r0-rm1-p1": 50,
        "r0-rm2-p0": 80,
        "r0-rm2-p1": 20,
      },
      byes: [["E"]],
      poolingByeCounts: { E: 1 },
      cfg: { poolingPhase: "swiss", qualAdv: 4 },
      gamemodeConfig: {
        roomSize: { min: 2, max: 2, ideal: 2 },
        oddCountStrategy: "bye",
      },
    });
    const result = advanceTournamentRound(tournament);
    expect(result.status).toBe("advanced");
    if (result.status !== "advanced") return;
    expect(result.state.assignments[1]).toEqual([
      { name: "A", room: 1, isLucky: false },
      { name: "D", room: 1, isLucky: false },
      { name: "C", room: 2, isLucky: false },
      { name: "E", room: 2, isLucky: false },
      { name: "B", room: null, isLucky: false },
    ]);
    expect(result.state.byes[1]).toEqual(["B"]);
    expect(result.state.poolingByeCounts).toEqual({ E: 1, B: 1 });
  });

  it("refreshes Qualification standings before cutting into the bracket", () => {
    const qualifier = round({
      isQual: true,
      isNoElim: true,
      advPerRoom: null,
      advTotal: 4,
    });
    const tournament = createEmptyTournamentState({
      players: ["A", "B", "C", "D"],
      rounds: [qualifier, round({ roundNum: 2, players: 2, rooms: [2] })],
      assignments: [[
        { name: "A", room: 1 }, { name: "B", room: 1 },
        { name: "C", room: 2 }, { name: "D", room: 2 },
      ]],
      scores: {
        "r0-rm1-p0": 100, "r0-rm1-p1": 50,
        "r0-rm2-p0": 80, "r0-rm2-p1": 20,
      },
      cfg: { poolingPhase: "qual-table", qualAdv: 2 },
      gamemodeConfig: { roomSize: { min: 2, max: 2, ideal: 2 } },
    });
    const result = advanceTournamentRound(tournament);
    expect(result.status).toBe("advanced");
    if (result.status !== "advanced") return;
    expect(result.state.qualTable.map((entry) => entry.name)).toEqual([
      "A", "C", "B", "D",
    ]);
    expect(result.state.assignments[1]).toEqual([
      { name: "A", room: 1, isLucky: false },
      { name: "C", room: 1, isLucky: false },
    ]);
  });
});

describe("double-elimination transitions", () => {
  const winners = round({ bracket: "winners", winnersTo: 2, losersTo: 1 });
  const losers = round({
    roundNum: 2,
    players: 2,
    rooms: [2],
    bracket: "losers",
    winnersTo: 2,
    losersTo: null,
  });

  it("stages a non-adjacent winners route and materializes the next loser route", () => {
    const tournament = createEmptyTournamentState({
      players: ["A", "B", "C", "D"],
      rounds: [winners, losers, round({ roundNum: 3 })],
      assignments: [[
        { name: "A", room: 1 },
        { name: "B", room: 1 },
        { name: "C", room: 2 },
        { name: "D", room: 2 },
      ]],
      scores: {
        "r0-rm1-p0": 100,
        "r0-rm1-p1": 50,
        "r0-rm2-p0": 80,
        "r0-rm2-p1": 20,
      },
      cfg: { poolingPhase: "none" },
      scheduleLogic: "double-elimination",
      gameFormat: "individual-1v1",
      gamemodeConfig: {
        roomSize: { min: 2, max: 2, ideal: 2 },
        oddCountStrategy: "bye",
      },
    });
    const result = advanceTournamentRound(tournament);
    expect(result.status).toBe("advanced");
    if (result.status !== "advanced") return;
    expect(result.state.pendingBracketSeeds).toEqual({
      "2": [
        { name: "A", isLucky: false },
        { name: "C", isLucky: false },
      ],
    });
    expect(result.state.assignments[1]).toEqual([
      { name: "B", room: 1, isLucky: false },
      { name: "D", room: 1, isLucky: false },
    ]);
    expect(result.state.byes[1]).toEqual([]);
    expect(result.state).toMatchObject({
      curRound: 1,
      reserveOpen: false,
      needsSave: true,
    });
  });

  it("combines both routes into the Final and stamps the winners-side finalist", () => {
    const grandFinal = round({
      roundNum: 3,
      players: 2,
      rooms: [2],
      isFinal: true,
      bracket: "grand-final",
      winnersTo: null,
      losersTo: null,
      numGames: 1,
    });
    const tournament = createEmptyTournamentState({
      players: ["A", "B", "C"],
      rounds: [winners, losers, grandFinal],
      curRound: 1,
      assignments: [
        [{ name: "A", room: 1 }, { name: "B", room: 1 }],
        [{ name: "B", room: 1 }, { name: "C", room: 1 }],
      ],
      scores: {
        "r0-rm1-p0": 100,
        "r0-rm1-p1": 50,
        "r1-rm1-p0": 80,
        "r1-rm1-p1": 20,
      },
      pendingBracketSeeds: { "2": [{ name: "A", isLucky: false }] },
      cfg: { poolingPhase: "none" },
      scheduleLogic: "double-elimination",
      gameFormat: "individual-1v1",
      gamemodeConfig: {
        roomSize: { min: 2, max: 2, ideal: 2 },
        oddCountStrategy: "bye",
      },
    });
    const result = advanceTournamentRound(tournament);
    expect(result.status).toBe("advanced");
    if (result.status !== "advanced") return;
    expect(result.state.pendingBracketSeeds).toEqual({});
    expect(result.state.assignments[2]).toEqual([
      { name: "A", room: 1, isLucky: false },
      { name: "B", room: 1, isLucky: false },
    ]);
    expect(result.state.rounds[2].wbFinalistName).toBe("A");
  });

  it("does not commit staged routes when the Final entrant count is wrong", () => {
    const grandFinal = round({
      roundNum: 3,
      players: 2,
      rooms: [2],
      isFinal: true,
      bracket: "grand-final",
    });
    const tournament = createEmptyTournamentState({
      players: ["B", "C"],
      rounds: [winners, losers, grandFinal],
      curRound: 1,
      assignments: [[], [{ name: "B", room: 1 }, { name: "C", room: 1 }]],
      scores: { "r1-rm1-p0": 80, "r1-rm1-p1": 20 },
      cfg: { poolingPhase: "none" },
      gamemodeConfig: {
        roomSize: { min: 2, max: 2, ideal: 2 },
        oddCountStrategy: "bye",
      },
    });
    const result = advanceTournamentRound(tournament);
    expect(result).toMatchObject({
      status: "blocked",
      reason: "malformed-final",
      message:
        "Can't advance into the Final — 1 entrants would arrive instead of the required 2. A mid-tournament withdrawal has likely thrown off the losers bracket's balance too deeply for the usual single-bye recovery to fix automatically; check Manage Teams, or add a replacement, before advancing further.",
      state: { curRound: 1, pendingBracketSeeds: {} },
    });
  });
});
