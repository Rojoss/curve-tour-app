import type {
  ActiveTab,
  PersistedSetup,
  PersistedTournamentEnvelope,
  TeamMember,
  TournamentState,
  TournamentTeam,
} from "./types";

export const LEGACY_LIVE_STATE_KEY = "curveFFA_state_v1";
export const LEGACY_ARCHIVE_INDEX_KEY = "curveFFA_archive_index";
export const LEGACY_ARCHIVE_ENTRY_PREFIX = "curveFFA_archive_";
export const LEGACY_BRACKET_FOLLOW_KEY = "curveFFA_bracket_follow";

export function createEmptyTournamentState(
  overrides: Partial<TournamentState> = {},
): TournamentState {
  return {
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
    ...overrides,
  };
}

export function createLegacySetupFixture(
  overrides: Partial<PersistedSetup> = {},
): PersistedSetup {
  return {
    scheduleLogic: "single-elimination",
    gameFormat: "ffa-individual",
    scoring: "fairpoints",
    poolingPhase: "none",
    qualAdv: "24",
    groupSize: "4",
    roundRobinMode: "single",
    qualifiersPerGroup: "2",
    finalsGames: "3",
    semisGames: "1",
    grandFinalWbTarget: "2",
    grandFinalLbTarget: "3",
    semisOverride: "",
    finalOverride: "",
    oddCountStrategy: "",
    teamScoringRule: "",
    roster: "",
    reserves: "",
    reserveIndividuals: "",
    ...overrides,
  };
}

export function createPersistedTournamentFixture(options: {
  activeTab?: ActiveTab;
  setup?: Partial<PersistedSetup>;
  state?: Partial<TournamentState>;
} = {}): PersistedTournamentEnvelope {
  return {
    T: createEmptyTournamentState(options.state),
    setup: createLegacySetupFixture(options.setup),
    activeTab: options.activeTab ?? "bracket",
  };
}

export function createIndividualRosterFixture(
  count: number,
  prefix = "Player",
): string[] {
  return Array.from(
    { length: count },
    (_, index) => `${prefix} ${String(index + 1).padStart(2, "0")}`,
  );
}

export function createTeamRosterFixture(options: {
  count: number;
  teamSize: number;
  idPrefix?: "team" | "reserveteam";
}): TournamentTeam[] {
  const { count, teamSize, idPrefix = "team" } = options;
  return Array.from({ length: count }, (_, teamIndex) => {
    const members: TeamMember[] = Array.from(
      { length: teamSize },
      (_, memberIndex) => ({
        name: `Team ${teamIndex + 1} Player ${memberIndex + 1}`,
        userId: `fixture-${teamIndex + 1}-${memberIndex + 1}`,
      }),
    );
    return {
      teamId: `${idPrefix}_fixture_${teamIndex}`,
      teamName: `Team ${String(teamIndex + 1).padStart(2, "0")}`,
      members,
    };
  });
}
