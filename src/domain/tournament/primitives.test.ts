import { describe, expect, it } from "vitest";
import {
  createEmptyTournamentState,
  createFixedClock,
  createLegacyCompatibleIdSource,
  deriveRoomSize,
  distributeRooms,
  distributeRoomsWithBye,
  fairPoints,
  GAME_FORMATS,
  getDefenderIndex,
  getFinalUnitScore,
  getUnitScore,
  groupByScore,
  parseMemberLine,
  parseTeamLines,
  resolveUnitQuery,
  rosterKeys,
  validateRoomCap,
  type TournamentState,
  type TournamentTeam,
} from "./index";

describe("format and room primitives", () => {
  it("matches the characterized format room sizes", () => {
    expect(deriveRoomSize(GAME_FORMATS["ffa-individual"])).toEqual({
      min: 6,
      max: 8,
      ideal: 8,
    });
    expect(deriveRoomSize(GAME_FORMATS["team-3v3"], "bye")).toEqual({
      min: 2,
      max: 2,
      ideal: 2,
    });
    expect(deriveRoomSize(GAME_FORMATS["team-3v3"], "flex")).toEqual({
      min: 2,
      max: 3,
      ideal: 2,
    });
  });

  it.each([
    [0, []],
    [5, [5]],
    [16, [8, 8]],
    [17, [6, 6, 5]],
    [25, [7, 6, 6, 6]],
  ])("distributes %i FFA players as %j", (count, expected) => {
    expect(distributeRooms(count, { min: 6, max: 8, ideal: 8 })).toEqual(
      expected,
    );
  });

  it("keeps none, bye, and flex odd-count behavior distinct", () => {
    const strict = { min: 2, max: 2, ideal: 2 };
    expect(distributeRoomsWithBye(5, strict, "bye")).toEqual({
      rooms: [2, 2],
      byeCount: 1,
    });
    expect(
      distributeRoomsWithBye(5, { min: 2, max: 3, ideal: 2 }, "flex"),
    ).toEqual({ rooms: [3, 2], byeCount: 0 });
    expect(distributeRoomsWithBye(5, strict, "none")).toEqual({
      rooms: [2, 2, 1],
      byeCount: 0,
    });
  });

  it("enforces the physical player cap with the legacy message", () => {
    expect(
      validateRoomCap(
        [{ roundNum: 2, rooms: [3] }],
        GAME_FORMATS["team-3v3v3"],
      ),
    ).toBeNull();
    expect(
      validateRoomCap(
        [{ roundNum: 2, rooms: [4] }],
        GAME_FORMATS["team-3v3v3"],
      ),
    ).toBe(
      "Round 2 would seat 12 players in one room (4 teams × 3 players each) — over the game's hard cap of 10 players per room. If you set a Semis/Final size override, try a smaller value; otherwise this should not be possible with any registered format's current numbers — please report this before generating.",
    );
  });
});

describe("roster primitives", () => {
  const ids = createLegacyCompatibleIdSource(
    createFixedClock(1_700_000_000_000),
  );

  it("parses member IDs and pads short team lines", () => {
    expect(parseMemberLine("  Ann (uid-ann)  ")).toEqual({
      name: "Ann",
      userId: "uid-ann",
    });
    expect(parseMemberLine("Casey ()")).toEqual({ name: "Casey" });
    const teams = parseTeamLines({
      value: "Alpha, Ann (uid-ann), Bob\n, Casey",
      idPrefix: "team",
      teamSize: 3,
      ids,
    });
    expect(teams).toEqual([
      {
        teamId: "team_1700000000000_0",
        teamName: "Alpha",
        members: [{ name: "Ann", userId: "uid-ann" }, { name: "Bob" }, null],
      },
      {
        teamId: "team_1700000000000_1",
        teamName: "Unnamed Team 2",
        members: [{ name: "Casey" }, null, null],
      },
    ]);
    expect(rosterKeys(teams)).toEqual([
      "team_1700000000000_0",
      "team_1700000000000_1",
    ]);
  });

  it("resolves exact members before label/member substrings, including reserves", () => {
    const players = parseTeamLines({
      value: "Alpha, Ann, Bob\n, Casey",
      idPrefix: "team",
      teamSize: 3,
      ids,
    });
    const reserve: TournamentTeam = {
      teamId: "reserve-1",
      teamName: "Reserve Crew",
      members: [{ name: "Zelda" }, null, null],
    };
    const state = createEmptyTournamentState({
      gameFormat: "team-3v3",
      players,
      reserves: [reserve],
    });
    expect(resolveUnitQuery(state, "ann")).toBe("team_1700000000000_0");
    expect(resolveUnitQuery(state, "zeld")).toBe("reserve-1");
    expect(resolveUnitQuery(state, "unnamed")).toBe(
      "team_1700000000000_1",
    );
    expect(resolveUnitQuery(state, "  ")).toBeNull();
  });
});

describe("score primitives", () => {
  function teamState(): TournamentState {
    const team: TournamentTeam = {
      teamId: "team-1",
      teamName: "Alpha",
      members: [{ name: "Ann" }, { name: "Bob" }, null],
    };
    return createEmptyTournamentState({
      gameFormat: "team-3v3",
      players: [team],
      assignments: [[{ name: "team-1", room: 1 }]],
      rounds: [
        {
          roundNum: 1,
          players: 1,
          rooms: [2],
          byeCount: 0,
          isQual: false,
          isNoElim: false,
          isSemis: false,
          isFinal: true,
          advPerRoom: 1,
          advTotal: 1,
          luckyCount: 0,
          numGames: 1,
        },
      ],
      scores: {
        "r0-rm1-p0-m0": 125,
        "r0-rm1-p0-m1": 275,
      },
      finalScores: {
        "game1-team-1-m0": 400,
        "game1-team-1-m1": 350,
      },
      defenderChanges: { "team-1": [{ round: 1, memberIdx: 1 }] },
      gamemodeConfig: { teamScoringRule: "sum-members" },
    });
  }

  it("matches team, defender, incomplete, and Final score semantics", () => {
    const state = teamState();
    expect(getUnitScore(state, 0, 1, 0, null)).toBe(400);
    expect(getFinalUnitScore(state, "team-1", 1, null)).toBe(750);
    expect(getDefenderIndex(state, "team-1", 0)).toBe(0);
    expect(getDefenderIndex(state, "team-1", 1)).toBe(1);

    const designated = {
      ...state,
      gamemodeConfig: { teamScoringRule: "designated-player" as const },
    };
    expect(getUnitScore(designated, 0, 1, 0, null)).toBe(125);

    const incomplete = {
      ...state,
      scores: { "r0-rm1-p0-m0": 125 },
    };
    expect(getUnitScore(incomplete, 0, 1, 0, null)).toBeNull();
    expect(getUnitScore(incomplete, 0, 1, 0, 0)).toBe(125);
  });

  it("sums multi-game individual scores and calculates Fair Points", () => {
    const state = createEmptyTournamentState({
      players: ["Player"],
      assignments: [[{ name: "Player", room: 1 }]],
      rounds: [
        {
          roundNum: 1,
          players: 1,
          rooms: [1],
          byeCount: 0,
          isQual: false,
          isNoElim: false,
          isSemis: true,
          isFinal: false,
          advPerRoom: 1,
          advTotal: 1,
          luckyCount: 0,
          numGames: 2,
        },
      ],
      scores: { "r0-rm1-p0-g1": 120, "r0-rm1-p0-g2": 230 },
    });
    expect(getUnitScore(state, 0, 1, 0, null)).toBe(350);
    expect(fairPoints(1, 1306)).toBe(0.98694);
    expect(
      groupByScore([
        { name: "A", score: 100 },
        { name: "B", score: 100 },
        { name: "C", score: 90 },
      ]).map((group) => group.map(({ name }) => name)),
    ).toEqual([["A", "B"], ["C"]]);
  });

  it.each([0, -25, 2_000_000_000])(
    "preserves the scalar score %i",
    (score) => {
      const state = createEmptyTournamentState({
        players: ["Player"],
        assignments: [[{ name: "Player", room: 1 }]],
        rounds: [
          {
            roundNum: 1,
            players: 1,
            rooms: [1],
            byeCount: 0,
            isQual: false,
            isNoElim: false,
            isSemis: false,
            isFinal: false,
            advPerRoom: 1,
            advTotal: 1,
            luckyCount: 0,
          },
        ],
        scores: { "r0-rm1-p0": score },
      });
      expect(getUnitScore(state, 0, 1, 0, null)).toBe(score);
    },
  );
});
