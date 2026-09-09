import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, page }) => {
  await context.route(/(?:gstatic\.com\/firebasejs|firebaseio\.com)/u, (route) =>
    route.abort(),
  );
  await context.addInitScript(() => {
    Date.now = () => 1_700_000_000_000;
  });
  await page.goto("/");
});

test("characterizes format metadata and room-distribution boundaries", async ({
  page,
}) => {
  const actual = await page.evaluate(() => {
    const legacy = window as unknown as {
      GAME_FORMATS: Record<string, unknown>;
      deriveRoomSize: (format: unknown, strategy?: string) => unknown;
      distributeRooms: (
        count: number,
        roomSize: { ideal: number; max: number; min: number },
      ) => number[];
      distributeRoomsWithBye: (
        count: number,
        roomSize: { ideal: number; max: number; min: number },
        strategy: string,
      ) => { byeCount: number; rooms: number[] };
      validateRoomCap: (
        rounds: Array<{ rooms: number[]; roundNum: number }>,
        format: unknown,
      ) => string | null;
    };
    const strict = { min: 2, max: 2, ideal: 2 };
    const flex = { min: 2, max: 3, ideal: 2 };
    return {
      derived: {
        ffa: legacy.deriveRoomSize(legacy.GAME_FORMATS["ffa-individual"]),
        headToHeadBye: legacy.deriveRoomSize(
          legacy.GAME_FORMATS["team-3v3"],
          "bye",
        ),
        headToHeadFlex: legacy.deriveRoomSize(
          legacy.GAME_FORMATS["team-3v3"],
          "flex",
        ),
      },
      distributions: [0, 5, 16, 17, 25].map((count) => ({
        count,
        rooms: legacy.distributeRooms(count, {
          min: 6,
          max: 8,
          ideal: 8,
        }),
      })),
      odd: {
        bye: legacy.distributeRoomsWithBye(5, strict, "bye"),
        flex: legacy.distributeRoomsWithBye(5, flex, "flex"),
        none: legacy.distributeRoomsWithBye(5, strict, "none"),
      },
      roomCap: {
        accepted: legacy.validateRoomCap(
          [{ roundNum: 2, rooms: [3] }],
          legacy.GAME_FORMATS["team-3v3v3"],
        ),
        rejected: legacy.validateRoomCap(
          [{ roundNum: 2, rooms: [4] }],
          legacy.GAME_FORMATS["team-3v3v3"],
        ),
      },
    };
  });

  expect(actual).toEqual({
    derived: {
      ffa: { min: 6, max: 8, ideal: 8 },
      headToHeadBye: { min: 2, max: 2, ideal: 2 },
      headToHeadFlex: { min: 2, max: 3, ideal: 2 },
    },
    distributions: [
      { count: 0, rooms: [] },
      { count: 5, rooms: [5] },
      { count: 16, rooms: [8, 8] },
      { count: 17, rooms: [6, 6, 5] },
      { count: 25, rooms: [7, 6, 6, 6] },
    ],
    odd: {
      bye: { rooms: [2, 2], byeCount: 1 },
      flex: { rooms: [3, 2], byeCount: 0 },
      none: { rooms: [2, 2, 1], byeCount: 0 },
    },
    roomCap: {
      accepted: null,
      rejected:
        "Round 2 would seat 12 players in one room (4 teams × 3 players each) — over the game's hard cap of 10 players per room. If you set a Semis/Final size override, try a smaller value; otherwise this should not be possible with any registered format's current numbers — please report this before generating.",
    },
  });
});

test("characterizes roster parsing, identity, and query resolution", async ({
  page,
}) => {
  const actual = await page.evaluate(() => {
    const legacy = window as unknown as {
      parseMemberLine: (value: string) => unknown;
      parseTeamLines: (
        value: string,
        prefix: string,
        teamSize: number,
      ) => unknown[];
      resolveUnitQuery: (state: unknown, query: string) => string | null;
      rosterKeys: (roster: unknown[]) => string[];
    };
    const teams = legacy.parseTeamLines(
      "Alpha, Ann (uid-ann), Bob\n, Casey",
      "team",
      3,
    ) as Array<{ members: unknown[]; teamId: string; teamName: string }>;
    const state = {
      gameFormat: "team-3v3",
      gamemodeConfig: {},
      players: teams,
      reserves: [
        {
          teamId: "reserve-1",
          teamName: "Reserve Crew",
          members: [{ name: "Zelda" }, null, null],
        },
      ],
    };
    return {
      members: [
        legacy.parseMemberLine("  Ann (uid-ann)  "),
        legacy.parseMemberLine("Bob"),
        legacy.parseMemberLine("Casey ()"),
      ],
      queries: {
        blank: legacy.resolveUnitQuery(state, "  "),
        exactMember: legacy.resolveUnitQuery(state, "ann"),
        reserveSubstring: legacy.resolveUnitQuery(state, "zeld"),
        teamSubstring: legacy.resolveUnitQuery(state, "unnamed"),
      },
      rosterKeys: legacy.rosterKeys(teams),
      teams,
    };
  });

  expect(actual).toEqual({
    members: [
      { name: "Ann", userId: "uid-ann" },
      { name: "Bob" },
      { name: "Casey" },
    ],
    queries: {
      blank: null,
      exactMember: "team_1700000000000_0",
      reserveSubstring: "reserve-1",
      teamSubstring: "team_1700000000000_1",
    },
    rosterKeys: ["team_1700000000000_0", "team_1700000000000_1"],
    teams: [
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
    ],
  });
});

test("characterizes individual, team, defender, multi-game, and Final scores", async ({
  page,
}) => {
  const actual = await page.evaluate(() => {
    const legacy = window as unknown as {
      fairPoints: (rank: number, score: number) => number;
      groupByScore: <T extends { score: number }>(values: T[]) => T[][];
      getDefenderIndex: (state: unknown, teamId: string, round: number) => number;
      getFinalUnitScore: (
        state: unknown,
        key: string,
        game: number,
        fallback: number | null,
      ) => number | null;
      getUnitScore: (
        state: unknown,
        round: number,
        room: number,
        position: number,
        fallback: number | null,
      ) => number | null;
    };
    const team = {
      teamId: "team-1",
      teamName: "Alpha",
      members: [{ name: "Ann" }, { name: "Bob" }, null],
    };
    const baseState = {
      gameFormat: "team-3v3",
      players: [team],
      reserves: [],
      assignments: [[{ name: "team-1", room: 1 }]],
      rounds: [
        {
          isFinal: true,
          numGames: 1,
          rooms: [2],
          roundNum: 1,
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
    };
    const designatedState = {
      ...baseState,
      gamemodeConfig: { teamScoringRule: "designated-player" },
    };
    const incompleteState = {
      ...baseState,
      scores: { "r0-rm1-p0-m0": 125 },
    };
    const multiGameIndividual = {
      gameFormat: "ffa-individual",
      gamemodeConfig: {},
      players: ["Player"],
      reserves: [],
      assignments: [[{ name: "Player", room: 1 }]],
      rounds: [{ isFinal: false, numGames: 2, rooms: [1], roundNum: 1 }],
      scores: { "r0-rm1-p0-g1": 120, "r0-rm1-p0-g2": 230 },
      finalScores: {},
      defenderChanges: {},
    };
    const individualScore = (score: number) =>
      legacy.getUnitScore(
        {
          ...multiGameIndividual,
          rounds: [{ isFinal: false, numGames: 1, rooms: [1], roundNum: 1 }],
          scores: { "r0-rm1-p0": score },
        },
        0,
        1,
        0,
        null,
      );
    return {
      designated: legacy.getUnitScore(designatedState, 0, 1, 0, null),
      defenderIndexes: [
        legacy.getDefenderIndex(baseState, "team-1", 0),
        legacy.getDefenderIndex(baseState, "team-1", 1),
      ],
      fairPoints: legacy.fairPoints(1, 1306),
      groupedScores: legacy
        .groupByScore([
          { name: "A", score: 100 },
          { name: "B", score: 100 },
          { name: "C", score: 90 },
        ])
        .map((group) => group.map((entry) => entry.name)),
      finalSum: legacy.getFinalUnitScore(baseState, "team-1", 1, null),
      incompleteFallbackNull: legacy.getUnitScore(
        incompleteState,
        0,
        1,
        0,
        null,
      ),
      incompleteFallbackZero: legacy.getUnitScore(
        incompleteState,
        0,
        1,
        0,
        0,
      ),
      multiGameTotal: legacy.getUnitScore(
        multiGameIndividual,
        0,
        1,
        0,
        null,
      ),
      scalarScores: [
        individualScore(0),
        individualScore(-25),
        individualScore(2_000_000_000),
      ],
      teamSum: legacy.getUnitScore(baseState, 0, 1, 0, null),
    };
  });

  expect(actual).toEqual({
    designated: 125,
    defenderIndexes: [0, 1],
    fairPoints: 0.98694,
    groupedScores: [["A", "B"], ["C"]],
    finalSum: 750,
    incompleteFallbackNull: null,
    incompleteFallbackZero: 125,
    multiGameTotal: 350,
    scalarScores: [0, -25, 2_000_000_000],
    teamSum: 400,
  });
});
