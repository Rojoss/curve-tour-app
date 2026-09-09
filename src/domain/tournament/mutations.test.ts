import { describe, expect, it } from "vitest";
import { createEmptyTournamentState } from "./fixtures";
import {
  addReserveUnit,
  fillTeamSlot,
  removeRosterUnit,
  renameIndividual,
  resetTournamentState,
  resolveTournamentTie,
  setFinalScore,
  setRoundScore,
  setTeamDefender,
  swapIndividual,
  swapTeam,
  updateTeam,
} from "./mutations";
import type { TournamentRound, TournamentTeam } from "./types";

const roomRound: TournamentRound = {
  roundNum: 1,
  players: 4,
  rooms: [4],
  byeCount: 0,
  isQual: false,
  isNoElim: false,
  isSemis: true,
  isFinal: false,
  advPerRoom: 2,
  advTotal: 2,
  luckyCount: 0,
  numGames: 1,
};

describe("live tournament mutations", () => {
  it("stores round scores, invalidates stale ties, and marks dirty", () => {
    const state = createEmptyTournamentState({
      started: true,
      players: ["A", "B"],
      rounds: [{ ...roomRound, players: 2, rooms: [2] }],
      assignments: [[{ name: "A", room: 1 }, { name: "B", room: 1 }]],
      scores: { "r0-rm1-p0": 10, "r0-rm1-p1": 10 },
      tieResolutions: { "r0-rm1-s10": ["A"] },
    });
    const next = setRoundScore(state, "r0-rm1-p1", "12", 0, 1);
    expect(next.scores["r0-rm1-p1"]).toBe(12);
    expect(next.tieResolutions).toEqual({});
    expect(next.needsSave).toBe(true);
  });

  it("stores single-game Finals in finalScores and grows an undecided grand-final race", () => {
    const state = createEmptyTournamentState({
      started: true,
      players: ["A", "B"],
      rounds: [{ ...roomRound, isSemis: false, isFinal: true, bracket: "grand-final", numGames: 1, wbFinalistName: "A" }],
      assignments: [[{ name: "A", room: 1 }, { name: "B", room: 1 }]],
      gamemodeConfig: { grandFinalWbTarget: 2, grandFinalLbTarget: 3 },
    });
    const afterA = setFinalScore(state, "game1-A", 10);
    const afterB = setFinalScore(afterA, "game1-B", 5);
    expect(afterB.finalScores).toEqual({ "game1-A": 10, "game1-B": 5 });
    expect(afterB.rounds[0].numGames).toBe(2);
  });

  it("resolves, renames, and swaps individual identities compatibly", () => {
    const state = createEmptyTournamentState({
      started: true,
      players: ["A", "B"],
      reserves: ["C"],
      rounds: [roomRound],
      assignments: [[{ name: "A", room: 1 }, { name: "B", room: 1 }]],
      byes: [["A"]],
      poolingByeCounts: { A: 2 },
      finalScores: { "game1-A": 50 },
    });
    const tied = resolveTournamentTie(state, "r0-rm1-s5", "A");
    const renamed = renameIndividual(tied, "A", "Alpha");
    const swapped = swapIndividual(renamed, "Alpha", "C");
    expect(renamed.finalScores).toEqual({ "game1-Alpha": 50 });
    expect(swapped.assignments[0][0].name).toBe("C");
    expect(swapped.byes[0]).toEqual(["A"]);
    expect(swapped.poolingByeCounts).toEqual({ A: 2 });
    expect(swapped.reserves).toEqual([]);
  });

  it("removes a live unit and shifts positional score keys", () => {
    const state = createEmptyTournamentState({
      started: true,
      players: ["A", "B", "C"],
      rounds: [{ ...roomRound, players: 3, rooms: [3] }],
      assignments: [[
        { name: "A", room: 1 },
        { name: "B", room: 1 },
        { name: "C", room: 1 },
      ]],
      scores: { "r0-rm1-p0": 30, "r0-rm1-p1": 20, "r0-rm1-p2": 10 },
    });
    const next = removeRosterUnit(state, "B");
    expect(next.players).toEqual(["A", "C"]);
    expect(next.assignments[0].map((entry) => entry.name)).toEqual(["A", "C"]);
    expect(next.scores).toEqual({ "r0-rm1-p0": 30, "r0-rm1-p1": 10 });
  });

  it("adds a reserve to the smallest room and regenerates the untouched future", () => {
    const state = createEmptyTournamentState({
      started: true,
      players: ["A", "B", "C", "D", "E", "F", "G", "H"],
      reserves: ["I"],
      rounds: [
        { ...roomRound, players: 8, rooms: [4, 4], isSemis: false, isNoElim: true, advPerRoom: null, advTotal: 8 },
        { ...roomRound, roundNum: 2, players: 8, rooms: [4, 4], isSemis: false, isNoElim: true, advPerRoom: null, advTotal: 8 },
      ],
      assignments: [[
        { name: "A", room: 1 }, { name: "B", room: 1 }, { name: "C", room: 1 },
        { name: "D", room: 2 }, { name: "E", room: 2 }, { name: "F", room: 2 },
        { name: "G", room: 2 }, { name: "H", room: 2 },
      ]],
      cfg: { n: 8, poolingPhase: "none", qualAdv: 8, groupSize: 4, roundRobinMode: "single", qualifiersPerGroup: 2, scoring: "fairpoints", finalsGames: 3, semisGames: 1 },
      gamemodeConfig: {
        roomSize: { min: 6, max: 8, ideal: 8 }, qualRounds: 2, swissRounds: 3,
        poolingPhase: "none", bracketPhase: "single-elimination", finalsGames: 3,
        semisGames: 1, grandFinalWbTarget: 2, grandFinalLbTarget: 3,
        groupSize: 4, roundRobinMode: "single", qualifiersPerGroup: 2,
        teamScoringRule: "sum-members",
      },
    });
    const result = addReserveUnit(state, "I");
    expect(result.status).toBe("added");
    if (result.status === "added") {
      expect(result.state.assignments[0].at(-1)).toMatchObject({ name: "I", room: 1 });
      expect(result.state.players).toContain("I");
      expect(result.state.rounds.length).toBeGreaterThan(2);
    }
    expect(addReserveUnit({ ...state, reserveOpen: false }, "I")).toEqual({
      status: "blocked",
      reason: "closed",
    });
    expect(
      addReserveUnit(
        { ...state, cfg: { ...state.cfg, poolingPhase: "group-stage" } },
        "I",
      ),
    ).toEqual({ status: "blocked", reason: "group-stage" });
  });

  it("updates team members/defenders and resets only live tournament progress", () => {
    const team: TournamentTeam = {
      teamId: "team-a",
      teamName: "A",
      members: [{ name: "P1" }, { name: "P2" }],
    };
    const state = createEmptyTournamentState({
      title: "Keep me",
      gameFormat: "team-2v2v2v2",
      players: [team],
      started: true,
      scores: { key: 1 },
      tournamentId: "id",
    });
    const renamed = updateTeam(state, team.teamId, (current) => ({ ...current, teamName: "Renamed" }));
    const defended = setTeamDefender(renamed, team.teamId, 1);
    const reset = resetTournamentState(defended);
    expect((renamed.players as TournamentTeam[])[0].teamName).toBe("Renamed");
    expect(defended.defenderChanges[team.teamId]).toEqual([{ round: 0, memberIdx: 1 }]);
    expect(reset.title).toBe("Keep me");
    expect(reset.started).toBe(false);
    expect(reset.scores).toEqual({});
    expect(reset.tournamentId).toBeNull();
  });

  it("swaps a whole team in place and fills a vacant member from reserves", () => {
    const oldTeam: TournamentTeam = { teamId: "old", teamName: "Old", members: [{ name: "A" }, null] };
    const newTeam: TournamentTeam = { teamId: "new", teamName: "New", members: [{ name: "B" }, { name: "C" }] };
    const state = createEmptyTournamentState({
      gameFormat: "team-2v2v2v2",
      players: [oldTeam],
      reserves: [newTeam],
      reserveIndividuals: [{ name: "Bench" }],
      rounds: [roomRound],
      assignments: [[{ name: "old", room: 1 }]],
      scores: { "r0-rm1-p0-m0": 9 },
      byes: [["old"]],
      poolingByeCounts: { old: 1 },
    });
    const swapped = swapTeam(state, "old", newTeam);
    expect((swapped.players as TournamentTeam[])[0].teamId).toBe("new");
    expect(swapped.assignments[0][0].name).toBe("new");
    expect(swapped.scores).toEqual({});
    expect(swapped.byes[0]).toEqual(["new"]);
    const opened = updateTeam(swapped, "new", (team) => ({ ...team, members: [team.members[0], null] }));
    const filled = fillTeamSlot(opened, "new", 1, opened.reserveIndividuals[0], 0);
    expect((filled.players as TournamentTeam[])[0].members[1]).toEqual({ name: "Bench" });
    expect(filled.reserveIndividuals).toEqual([]);
  });
});
