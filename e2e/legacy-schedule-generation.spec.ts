import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, page }) => {
  await context.route(/(?:gstatic\.com\/firebasejs|firebaseio\.com)/u, (route) =>
    route.abort(),
  );
  await page.goto("/");
});

test("characterizes pooling and round-robin schedule generation", async ({
  page,
}) => {
  const actual = await page.evaluate(() => {
    const legacy = window as unknown as Record<string, any>;
    const summarize = (round: Record<string, any>) => ({
      roundNum: round.roundNum,
      players: round.players,
      rooms: round.rooms,
      byeCount: round.byeCount,
      flags: [
        !!round.isQual,
        !!round.isSwiss,
        !!round.isGroupStage,
        !!round.pairingTBD,
      ],
      advTotal: round.advTotal,
    });
    const ffaDescriptor = {
      config: {
        oddCountStrategy: undefined,
        qualRounds: 3,
        roomSize: { min: 6, max: 8, ideal: 8 },
        swissRounds: 5,
      },
    };
    const headToHeadDescriptor = {
      config: {
        oddCountStrategy: "bye",
        qualRounds: 3,
        roomSize: { min: 2, max: 2, ideal: 2 },
        swissRounds: 3,
      },
    };
    const groups = [
      { label: "A", members: ["A1", "A2", "A3"] },
      { label: "B", members: ["B1", "B2", "B3", "B4"] },
    ];

    legacy.T.players = Array.from({ length: 9 }, (_, index) => `P${index + 1}`);
    const groupPhase = legacy.groupStagePoolingPhase(
      {
        n: 9,
        groupSize: 4,
        qualifiersPerGroup: 2,
        roundRobinMode: "single",
      },
      headToHeadDescriptor,
    );

    return {
      swissCounts: [1, 8, 17, 200].map(legacy.computeSwissRoundCount),
      circles: {
        four: legacy.circleMethodSchedule(4),
        five: legacy.circleMethodSchedule(5),
      },
      assignedGroups: legacy.assignGroupMembers(
        Array.from({ length: 11 }, (_, index) => `S${index + 1}`),
        [4, 4, 3],
      ),
      roundRobin: {
        single: legacy.buildRoundRobinRounds(groups, "single"),
        doubleLength: legacy.buildRoundRobinRounds(groups, "double").length,
      },
      phases: {
        qualification: legacy
          .qualTablePoolingPhase(
            { n: 17, qualAdv: 8 },
            ffaDescriptor,
          )
          .rounds.map(summarize),
        swissBye: legacy
          .swissPoolingPhase(
            { n: 5, qualAdv: 4 },
            headToHeadDescriptor,
          )
          .rounds.map(summarize),
        warmupFlex: legacy.noElimWarmupPoolingPhase(
          { n: 5 },
          {
            config: {
              oddCountStrategy: "flex",
              roomSize: { min: 2, max: 3, ideal: 2 },
            },
          },
        ),
        group: {
          groups: legacy.T.groups,
          phase: {
            seedTotal: groupPhase.seedTotal,
            nextRoundNum: groupPhase.nextRoundNum,
            rounds: groupPhase.rounds.map((round: Record<string, any>) => ({
              ...summarize(round),
              roomGroups: round.roomGroups,
              matches: round.matches,
              groupByes: round.groupByes,
            })),
          },
          firstAssignments: legacy.seedFromGroupStageRound(
            groupPhase.rounds[0],
          ),
        },
      },
    };
  });

  expect(actual).toEqual({
    swissCounts: [3, 3, 5, 7],
    circles: {
      four: {
        numRounds: 3,
        phantomPosition: null,
        rounds: [
          [[0, 3], [1, 2]],
          [[0, 2], [3, 1]],
          [[0, 1], [2, 3]],
        ],
      },
      five: {
        numRounds: 5,
        phantomPosition: 5,
        rounds: [
          [[0, 5], [1, 4], [2, 3]],
          [[0, 4], [5, 3], [1, 2]],
          [[0, 3], [4, 2], [5, 1]],
          [[0, 2], [3, 1], [4, 5]],
          [[0, 1], [2, 5], [3, 4]],
        ],
      },
    },
    assignedGroups: [
      { label: "A", members: ["S1", "S6", "S7", "S11"] },
      { label: "B", members: ["S2", "S5", "S8", "S10"] },
      { label: "C", members: ["S3", "S4", "S9"] },
    ],
    roundRobin: {
      single: [
        {
          matches: [
            { group: "A", pair: ["A2", "A3"] },
            { group: "B", pair: ["B1", "B4"] },
            { group: "B", pair: ["B2", "B3"] },
          ],
          byes: ["A1"],
        },
        {
          matches: [
            { group: "A", pair: ["A1", "A3"] },
            { group: "B", pair: ["B1", "B3"] },
            { group: "B", pair: ["B4", "B2"] },
          ],
          byes: ["A2"],
        },
        {
          matches: [
            { group: "A", pair: ["A1", "A2"] },
            { group: "B", pair: ["B1", "B2"] },
            { group: "B", pair: ["B3", "B4"] },
          ],
          byes: ["A3"],
        },
      ],
      doubleLength: 6,
    },
    phases: {
      qualification: [1, 2, 3].map((roundNum) => ({
        roundNum,
        players: 17,
        rooms: [6, 6, 5],
        byeCount: 0,
        flags: [true, false, false, false],
        advTotal: 17,
      })),
      swissBye: [1, 2, 3].map((roundNum) => ({
        roundNum,
        players: 5,
        rooms: [2, 2],
        byeCount: 1,
        flags: [false, true, false, roundNum > 1],
        advTotal: 5,
      })),
      warmupFlex: {
        rounds: [1, 2].map((roundNum) => ({
          roundNum,
          players: 5,
          rooms: [3, 2],
          byeCount: 0,
          isQual: false,
          isNoElim: true,
          isSemis: false,
          isFinal: false,
          advPerRoom: null,
          advTotal: 5,
          luckyCount: 0,
        })),
        seedTotal: 5,
        nextRoundNum: 3,
      },
      group: {
        groups: [
          { label: "A", members: ["P1", "P4", "P5", "P8", "P9"] },
          { label: "B", members: ["P2", "P3", "P6", "P7"] },
        ],
        phase: {
          seedTotal: 4,
          nextRoundNum: 6,
          rounds: [
            {
              roundNum: 1,
              players: 9,
              rooms: [2, 2, 2, 2],
              byeCount: 1,
              flags: [false, false, true, false],
              advTotal: 9,
              roomGroups: ["A", "A", "B", "B"],
              matches: [
                { group: "A", pair: ["P4", "P9"] },
                { group: "A", pair: ["P5", "P8"] },
                { group: "B", pair: ["P2", "P7"] },
                { group: "B", pair: ["P3", "P6"] },
              ],
              groupByes: ["P1"],
            },
            {
              roundNum: 2,
              players: 9,
              rooms: [2, 2, 2, 2],
              byeCount: 1,
              flags: [false, false, true, false],
              advTotal: 9,
              roomGroups: ["A", "A", "B", "B"],
              matches: [
                { group: "A", pair: ["P1", "P9"] },
                { group: "A", pair: ["P4", "P5"] },
                { group: "B", pair: ["P2", "P6"] },
                { group: "B", pair: ["P7", "P3"] },
              ],
              groupByes: ["P8"],
            },
            {
              roundNum: 3,
              players: 9,
              rooms: [2, 2, 2, 2],
              byeCount: 1,
              flags: [false, false, true, false],
              advTotal: 9,
              roomGroups: ["A", "A", "B", "B"],
              matches: [
                { group: "A", pair: ["P1", "P8"] },
                { group: "A", pair: ["P9", "P5"] },
                { group: "B", pair: ["P2", "P3"] },
                { group: "B", pair: ["P6", "P7"] },
              ],
              groupByes: ["P4"],
            },
            {
              roundNum: 4,
              players: 9,
              rooms: [2, 2],
              byeCount: 5,
              flags: [false, false, true, false],
              advTotal: 9,
              roomGroups: ["A", "A"],
              matches: [
                { group: "A", pair: ["P1", "P5"] },
                { group: "A", pair: ["P8", "P4"] },
              ],
              groupByes: ["P9", "P2", "P3", "P6", "P7"],
            },
            {
              roundNum: 5,
              players: 9,
              rooms: [2, 2],
              byeCount: 5,
              flags: [false, false, true, false],
              advTotal: 9,
              roomGroups: ["A", "A"],
              matches: [
                { group: "A", pair: ["P1", "P4"] },
                { group: "A", pair: ["P8", "P9"] },
              ],
              groupByes: ["P5", "P2", "P3", "P6", "P7"],
            },
          ],
        },
        firstAssignments: [
          { name: "P4", room: 1, isLucky: false },
          { name: "P9", room: 1, isLucky: false },
          { name: "P5", room: 2, isLucky: false },
          { name: "P8", room: 2, isLucky: false },
          { name: "P2", room: 3, isLucky: false },
          { name: "P7", room: 3, isLucky: false },
          { name: "P3", room: 4, isLucky: false },
          { name: "P6", room: 4, isLucky: false },
          { name: "P1", room: null, isLucky: false },
        ],
      },
    },
  });
});

test("characterizes single-elimination target and bracket generation", async ({
  page,
}) => {
  const actual = await page.evaluate(() => {
    const legacy = window as unknown as Record<string, any>;
    const ffaDescriptor = {
      config: {
        finalSize: 8,
        finalsGames: 3,
        oddCountStrategy: undefined,
        roomSize: { min: 6, max: 8, ideal: 8 },
        semisGames: 2,
        semisSize: 16,
      },
    };
    const headToHeadDescriptor = {
      config: {
        finalSize: 2,
        finalsGames: 1,
        oddCountStrategy: "bye",
        roomSize: { min: 2, max: 2, ideal: 2 },
        semisGames: 4,
        semisSize: 4,
      },
    };
    return {
      snapFriendly: [5, 9, 13, 19].map((count) =>
        legacy.snapFriendly(count, { min: 6, max: 8, ideal: 8 }),
      ),
      targets: {
        ffa: legacy.computeTargets(37, 16, 4, {
          min: 6,
          max: 8,
          ideal: 8,
        }),
        cleanFfa: legacy.computeCleanTargets(37, 6, 8, {
          min: 6,
          max: 8,
          ideal: 8,
        }),
        headToHead: legacy.computeCleanTargets(16, 4, 2, {
          min: 2,
          max: 2,
          ideal: 2,
        }),
      },
      roundCounts: {
        ffa: legacy.computeElimRoundCount(37, 16, {
          min: 6,
          max: 8,
          ideal: 8,
        }),
        headToHead: legacy.computeElimRoundCount(16, 4, {
          min: 2,
          max: 2,
          ideal: 2,
        }),
      },
      brackets: Object.fromEntries(
        Object.entries({
          ffa: legacy.singleEliminationBracketPhase(37, 3, ffaDescriptor),
          bye: legacy.singleEliminationBracketPhase(
            5,
            3,
            headToHeadDescriptor,
          ),
        }).map(([key, rounds]) => [
          key,
          (rounds as Array<Record<string, any>>).map((round) => [
            round.roundNum,
            round.players,
            round.rooms,
            round.byeCount,
            round.advPerRoom,
            round.advTotal,
            round.luckyCount,
            round.isSemis,
            round.isFinal,
            round.numGames,
          ]),
        ]),
      ),
    };
  });

  expect(actual).toEqual({
    snapFriendly: [6, 8, 13, 19],
    targets: {
      ffa: [30, 24, 20, 16],
      cleanFfa: [29, 22, 18, 13, 12, 8, 6],
      headToHead: [8, 4],
    },
    roundCounts: { ffa: 4, headToHead: 2 },
    brackets: {
      ffa: [
        [3, 37, [8, 8, 7, 7, 7], 0, 6, 30, 0, false, false, undefined],
        [4, 30, [8, 8, 7, 7], 0, 6, 24, 0, false, false, undefined],
        [5, 24, [8, 8, 8], 0, 6, 20, 2, false, false, undefined],
        [6, 20, [7, 7, 6], 0, 5, 16, 1, false, false, undefined],
        [7, 16, [8, 8], 0, 4, 8, 0, true, false, 2],
        [8, 8, [8], 0, 1, 1, 0, false, true, 3],
      ],
      bye: [
        [3, 5, [2, 2], 1, 1, 4, 1, false, false, undefined],
        [4, 4, [2, 2], 0, 1, 2, 0, true, false, 4],
        [5, 2, [2], 0, 1, 1, 0, false, true, 1],
      ],
    },
  });
});

test("characterizes both double-elimination bracket topologies", async ({
  page,
}) => {
  const actual = await page.evaluate(() => {
    const legacy = window as unknown as Record<string, any>;
    const summarize = (rounds: Array<Record<string, any>>) =>
      rounds.map((round) => [
        round.roundNum,
        round.bracket ?? null,
        round.players,
        round.rooms,
        round.byeCount,
        round.advPerRoom,
        round.advTotal,
        round.luckyCount,
        round.winnersTo,
        round.losersTo,
        round.isFinal,
        round.numGames ?? null,
        !!round.bracketPhaseFirstRound,
      ]);
    const summarizeShared = (rounds: Array<Record<string, any>>) => ({
      bracketOrder: rounds.map((round) => round.bracket ?? "final"),
      players: rounds.map((round) => round.players),
      rooms: rounds.map((round) => round.rooms),
      advancement: rounds.map((round) => [
        round.advPerRoom,
        round.advTotal,
        round.luckyCount,
      ]),
      routes: rounds.map((round) => [round.winnersTo, round.losersTo]),
      final: rounds.at(-1),
    });
    return {
      powers: [4, 5, 8, 13].map(legacy.nextPowerOf2AndRounds),
      concentrated: legacy.concentratedByeFirstRound(
        5,
        legacy.nextPowerOf2AndRounds(5),
        { min: 2, max: 2, ideal: 2 },
      ),
      raceEight: summarize(
        legacy.doubleEliminationBracketPhase(8, 3, {
          config: {
            roomSize: { min: 2, max: 2, ideal: 2 },
            oddCountStrategy: "bye",
          },
        }),
      ),
      raceFiveOpening: summarize(
        legacy.doubleEliminationBracketPhase(5, 3, {
          config: {
            roomSize: { min: 2, max: 2, ideal: 2 },
            oddCountStrategy: "bye",
          },
        }),
      ).slice(0, 4),
      sharedFfa: summarizeShared(
        legacy.doubleEliminationSharedFinalBracketPhase(32, 4, {
          config: {
            roomSize: { min: 6, max: 8, ideal: 8 },
            oddCountStrategy: undefined,
            finalSize: 8,
            lbQualifiers: 2,
            finalsGames: 3,
          },
        }),
      ),
      sharedThreeWay: summarizeShared(
        legacy.doubleEliminationSharedFinalBracketPhase(12, 3, {
          config: {
            roomSize: { min: 2, max: 3, ideal: 3 },
            oddCountStrategy: undefined,
            finalSize: 3,
            lbQualifiers: 1,
            finalsGames: 2,
          },
        }),
      ),
    };
  });

  expect(actual).toEqual({
    powers: [
      { bracketSize: 4, numRounds: 2 },
      { bracketSize: 8, numRounds: 3 },
      { bracketSize: 8, numRounds: 3 },
      { bracketSize: 16, numRounds: 4 },
    ],
    concentrated: { rooms: [2], byeCount: 3 },
    raceEight: [
      [3, "winners", 8, [2, 2, 2, 2], 0, 1, 4, 0, 4, 3, false, null, true],
      [4, "losers", 4, [2, 2], 0, 1, 2, 0, 5, null, false, null, false],
      [5, "winners", 4, [2, 2], 0, 1, 2, 0, 7, 5, false, null, false],
      [6, "losers", 4, [2, 2], 0, 1, 2, 0, 6, null, false, null, false],
      [7, "losers", 2, [2], 0, 1, 1, 0, 8, null, false, null, false],
      [8, "winners", 2, [2], 0, 1, 1, 0, 9, 8, false, null, false],
      [9, "losers", 2, [2], 0, 1, 1, 0, 9, null, false, null, false],
      [10, "grand-final", 2, [2], 0, 1, 1, 0, null, null, true, 1, false],
    ],
    raceFiveOpening: [
      [3, "winners", 5, [2], 3, 1, 4, 0, 4, 3, false, null, true],
      [4, "losers", 1, [], 1, 1, 1, 0, 5, null, false, null, false],
      [5, "winners", 4, [2, 2], 0, 1, 2, 0, 7, 5, false, null, false],
      [6, "losers", 3, [2], 1, 1, 2, 0, 6, null, false, null, false],
    ],
    sharedFfa: {
      bracketOrder: [
        "winners", "winners", "losers", "winners", "losers",
        "winners", "losers", "winners", "losers", "winners",
        "losers", "winners", "losers", "winners", "losers", "final",
      ],
      players: [32, 26, 11, 21, 11, 18, 12, 14, 10, 12, 11, 8, 7, 7, 7, 8],
      rooms: [
        [8, 8, 8, 8], [7, 7, 6, 6], [6, 5], [7, 7, 7], [6, 5],
        [6, 6, 6], [6, 6], [7, 7], [5, 5], [6, 6], [6, 5], [8],
        [7], [7], [7], [8],
      ],
      advancement: [
        [6, 26, 2], [5, 21, 1], [4, 8, 0], [6, 18, 0],
        [4, 8, 0], [4, 14, 2], [4, 8, 0], [6, 12, 0],
        [3, 7, 1], [4, 8, 0], [3, 6, 0], [7, 7, 0],
        [6, 6, 0], [6, 6, 0], [2, 2, 0], [1, 1, 0],
      ],
      routes: [
        [4, 5], [6, 5], [7, null], [8, 7], [9, null], [10, 9],
        [11, null], [12, 11], [13, null], [14, 13], [15, null],
        [16, 15], [17, null], [18, 17], [18, null], [null, null],
      ],
      final: {
        roundNum: 19,
        isQual: false,
        isNoElim: false,
        isSemis: false,
        isFinal: true,
        rooms: [8],
        byeCount: 0,
        players: 8,
        advPerRoom: 1,
        advTotal: 1,
        luckyCount: 0,
        numGames: 3,
        winnersTo: null,
        losersTo: null,
      },
    },
    sharedThreeWay: {
      bracketOrder: [
        "winners", "losers", "winners", "losers", "winners", "losers",
        "winners", "losers", "winners", "losers", "winners", "losers", "final",
      ],
      players: [12, 3, 9, 4, 7, 5, 5, 4, 4, 4, 3, 3, 3],
      rooms: [
        [3, 3, 3, 3], [3], [3, 3, 3], [2, 2], [3, 2, 2], [3, 2],
        [3, 2], [2, 2], [2, 2], [2, 2], [3], [3], [3],
      ],
      advancement: [
        [2, 9, 1], [2, 2, 0], [2, 7, 1], [1, 3, 1], [1, 5, 2],
        [1, 3, 1], [2, 4, 0], [1, 3, 1], [1, 3, 1], [1, 2, 0],
        [2, 2, 0], [1, 1, 0], [1, 1, 0],
      ],
      routes: [
        [4, 3], [5, null], [6, 5], [7, null], [8, 7], [9, null],
        [10, 9], [11, null], [12, 11], [13, null], [14, 13],
        [14, null], [null, null],
      ],
      final: {
        roundNum: 15,
        isQual: false,
        isNoElim: false,
        isSemis: false,
        isFinal: true,
        rooms: [3],
        byeCount: 0,
        players: 3,
        advPerRoom: 1,
        advTotal: 1,
        luckyCount: 0,
        numGames: 2,
        winnersTo: null,
        losersTo: null,
      },
    },
  });
});
