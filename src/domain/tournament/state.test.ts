import { describe, expect, it } from "vitest";
import {
  createEmptyTournamentState,
  createFixedClock,
  createIndividualRosterFixture,
  createLegacyCompatibleIdSource,
  createPersistedTournamentFixture,
  createSeededRandom,
  createTeamRosterFixture,
} from "./index";

describe("legacy-compatible tournament state fixtures", () => {
  it("creates the exact empty legacy state without shared mutable values", () => {
    const first = createEmptyTournamentState();
    const second = createEmptyTournamentState();

    expect(first).toEqual({
      title: "",
      players: [],
      reserves: [],
      reserveIndividuals: [],
      confirmedCount: null,
      tournamentId: null,
      rounds: [],
      curRound: 0,
      scores: {},
      finalScores: {},
      assignments: [],
      luckyLosers: [],
      byes: [],
      poolingByeCounts: {},
      pendingBracketSeeds: {},
      qualTable: [],
      groups: [],
      groupStandings: {},
      tieResolutions: {},
      defenderChanges: {},
      reserveOpen: true,
      started: false,
      needsSave: false,
      autoSaved: false,
      cfg: {},
      scheduleLogic: "single-elimination",
      gameFormat: "ffa-individual",
      gamemodeConfig: {},
    });

    first.assignments.push([{ name: "Only first", room: 1 }]);
    expect(second.assignments).toEqual([]);
  });

  it("builds a persisted synthetic fixture with legacy setup value types", () => {
    const fixture = createPersistedTournamentFixture({
      activeTab: "admin",
      setup: { finalsGames: "4" },
      state: { title: "Fixture Cup" },
    });

    expect(fixture.activeTab).toBe("admin");
    expect(fixture.setup.finalsGames).toBe("4");
    expect(fixture.setup.qualAdv).toBe("24");
    expect(fixture.T.title).toBe("Fixture Cup");
  });

  it("creates stable synthetic individual and team rosters", () => {
    expect(createIndividualRosterFixture(2)).toEqual([
      "Player 01",
      "Player 02",
    ]);
    expect(createTeamRosterFixture({ count: 1, teamSize: 3 })).toEqual([
      {
        teamId: "team_fixture_0",
        teamName: "Team 01",
        members: [
          { name: "Team 1 Player 1", userId: "fixture-1-1" },
          { name: "Team 1 Player 2", userId: "fixture-1-2" },
          { name: "Team 1 Player 3", userId: "fixture-1-3" },
        ],
      },
    ]);
  });
});

describe("injected runtime boundaries", () => {
  it("reproduces legacy timestamp-based IDs from an injected clock", () => {
    const ids = createLegacyCompatibleIdSource(createFixedClock(1_700_000_000_000));

    expect(ids.tournamentId()).toBe("1700000000000");
    expect(ids.rosterUnitId("team", 3)).toBe("team_1700000000000_3");
  });

  it("produces repeatable random sequences from the same seed", () => {
    const first = createSeededRandom(42);
    const second = createSeededRandom(42);

    expect([first.next(), first.next(), first.next()]).toEqual([
      second.next(),
      second.next(),
      second.next(),
    ]);
  });
});
