import { describe, expect, it } from "vitest";
import {
  createEmptyTournamentState,
  createFixedClock,
  createIndividualRosterFixture,
  createLegacySetupFixture,
  createSeededRandom,
  createTeamRosterFixture,
  createTournamentRuntime,
  generateTournament,
  type GameFormatKey,
  type PoolingPhaseKey,
  type ScheduleLogicKey,
  type TournamentRoster,
} from "./index";

interface MatrixFormat {
  format: GameFormatKey;
  count: number;
  teamSize?: number;
  qualAdv: number;
  schedules: ScheduleLogicKey[];
  oddCountStrategy: "" | "none";
}

const formats: MatrixFormat[] = [
  { format: "ffa-individual", count: 32, qualAdv: 16, schedules: ["single-elimination", "double-elimination-shared-final"], oddCountStrategy: "" },
  { format: "team-2v2v2v2", count: 16, teamSize: 2, qualAdv: 8, schedules: ["single-elimination", "double-elimination-shared-final"], oddCountStrategy: "" },
  { format: "team-3v3v3", count: 12, teamSize: 3, qualAdv: 6, schedules: ["single-elimination", "double-elimination-shared-final"], oddCountStrategy: "" },
  { format: "team-3v3", count: 8, teamSize: 3, qualAdv: 4, schedules: ["single-elimination", "double-elimination"], oddCountStrategy: "none" },
  { format: "individual-1v1", count: 8, qualAdv: 4, schedules: ["single-elimination", "double-elimination"], oddCountStrategy: "none" },
];
const poolingPhases: PoolingPhaseKey[] = ["none", "qual-table", "swiss", "group-stage"];

function rosterFor(entry: MatrixFormat): TournamentRoster {
  return entry.teamSize
    ? createTeamRosterFixture({ count: entry.count, teamSize: entry.teamSize })
    : createIndividualRosterFixture(entry.count);
}

describe("supported generation parity matrix", () => {
  for (const entry of formats) {
    for (const scheduleLogic of entry.schedules) {
      for (const poolingPhase of poolingPhases) {
        it(`${entry.format} × ${scheduleLogic} × ${poolingPhase}`, () => {
          const players = rosterFor(entry);
          const current = createEmptyTournamentState({ players, confirmedCount: entry.count });
          const setup = createLegacySetupFixture({
            gameFormat: entry.format,
            scheduleLogic,
            poolingPhase,
            qualAdv: String(entry.qualAdv),
            oddCountStrategy: entry.oddCountStrategy,
            groupSize: "4",
            qualifiersPerGroup: "2",
            finalsGames: "4",
            semisGames: "4",
          });
          const result = generateTournament(current, { ...setup, lbQualifiers: "2" }, createTournamentRuntime({
            clock: createFixedClock(1_700_000_000_000),
            random: createSeededRandom(42),
          }));
          expect(result.status).toBe("generated");
          if (result.status !== "generated") return;
          expect(result.state.rounds.length).toBeGreaterThan(0);
          expect(result.state.assignments[0]).toBeDefined();
          expect(result.state.tournamentId).toBe("1700000000000");
          expect(result.state.gameFormat).toBe(entry.format);
          expect(result.state.scheduleLogic).toBe(scheduleLogic);
          expect(result.state.gamemodeConfig.poolingPhase).toBe(poolingPhase);
        });
      }
    }
  }

  it("materializes every supported 1–4 game Semis and Final selection", () => {
    for (let games = 1; games <= 4; games += 1) {
      const players = createIndividualRosterFixture(32);
      const result = generateTournament(
        createEmptyTournamentState({ players, confirmedCount: players.length }),
        createLegacySetupFixture({ finalsGames: String(games), semisGames: String(games) }),
        createTournamentRuntime({ clock: createFixedClock(1_700_000_000_000), random: createSeededRandom(1) }),
      );
      expect(result.status).toBe("generated");
      if (result.status !== "generated") continue;
      expect(result.state.rounds.find((round) => round.isSemis)?.numGames).toBe(games);
      expect(result.state.rounds.find((round) => round.isFinal)?.numGames).toBe(games);
    }
  });
});
