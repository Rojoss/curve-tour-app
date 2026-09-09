import { describe, expect, it } from "vitest";
import {
  assignGroupMembers,
  buildRoundRobinRounds,
  buildSingleEliminationProgression,
  circleMethodSchedule,
  computeCleanTargets,
  computeEliminationRoundCount,
  computeSwissRoundCount,
  computeTargets,
  groupStagePoolingPhase,
  noEliminationWarmupPoolingPhase,
  qualificationTablePoolingPhase,
  seedFromGroupStageRound,
  singleEliminationBracketPhase,
  snapFriendly,
  swissPoolingPhase,
} from "./index";

const ffaFormat = {
  roomSize: { min: 6, max: 8, ideal: 8 },
  oddCountStrategy: undefined,
  qualRounds: 3,
  swissRounds: 5,
  semisSize: 16,
  finalSize: 8,
  semisGames: 2,
  finalsGames: 3,
};

const headToHeadByeFormat = {
  roomSize: { min: 2, max: 2, ideal: 2 },
  oddCountStrategy: "bye" as const,
  qualRounds: 3,
  swissRounds: 3,
  semisSize: 4,
  finalSize: 2,
  semisGames: 4,
  finalsGames: 1,
};

describe("pooling schedule generation", () => {
  it("clamps the legacy Swiss round heuristic", () => {
    expect([1, 8, 17, 200].map(computeSwissRoundCount)).toEqual([3, 3, 5, 7]);
  });

  it("uses the characterized circle method for even and odd groups", () => {
    expect(circleMethodSchedule(4)).toEqual({
      numRounds: 3,
      phantomPosition: null,
      rounds: [
        [[0, 3], [1, 2]],
        [[0, 2], [3, 1]],
        [[0, 1], [2, 3]],
      ],
    });
    expect(circleMethodSchedule(5)).toEqual({
      numRounds: 5,
      phantomPosition: 5,
      rounds: [
        [[0, 5], [1, 4], [2, 3]],
        [[0, 4], [5, 3], [1, 2]],
        [[0, 3], [4, 2], [5, 1]],
        [[0, 2], [3, 1], [4, 5]],
        [[0, 1], [2, 5], [3, 4]],
      ],
    });
  });

  it("snake-seeds exact mixed group capacities", () => {
    expect(
      assignGroupMembers(
        Array.from({ length: 11 }, (_, index) => `S${index + 1}`),
        [4, 4, 3],
      ),
    ).toEqual([
      { label: "A", members: ["S1", "S6", "S7", "S11"] },
      { label: "B", members: ["S2", "S5", "S8", "S10"] },
      { label: "C", members: ["S3", "S4", "S9"] },
    ]);
  });

  it("builds single and double round robins with phantom byes", () => {
    const groups = [
      { label: "A", members: ["A1", "A2", "A3"] },
      { label: "B", members: ["B1", "B2", "B3", "B4"] },
    ];
    const single = buildRoundRobinRounds(groups, "single");
    expect(single).toEqual([
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
    ]);
    expect(buildRoundRobinRounds(groups, "double")).toEqual([
      ...single,
      ...single,
    ]);
  });

  it("preserves qualification, Swiss, warmup, and group phase structures", () => {
    const qualification = qualificationTablePoolingPhase(
      { n: 17, qualAdv: 8 },
      ffaFormat,
    );
    expect(qualification).toEqual({
      rounds: [1, 2, 3].map((roundNum) => ({
        roundNum,
        players: 17,
        rooms: [6, 6, 5],
        byeCount: 0,
        isQual: true,
        isNoElim: true,
        isSemis: false,
        isFinal: false,
        advPerRoom: null,
        advTotal: 17,
        luckyCount: 0,
      })),
      seedTotal: 8,
      nextRoundNum: 4,
    });

    const swiss = swissPoolingPhase(
      { n: 5, qualAdv: 4 },
      headToHeadByeFormat,
    );
    expect(swiss.rounds.map(({ pairingTBD, ...round }) => [round, pairingTBD])).toEqual(
      [1, 2, 3].map((roundNum) => [
        {
          roundNum,
          players: 5,
          rooms: [2, 2],
          byeCount: 1,
          isQual: false,
          isNoElim: true,
          isSemis: false,
          isFinal: false,
          isSwiss: true,
          advPerRoom: null,
          advTotal: 5,
          luckyCount: 0,
        },
        roundNum > 1 ? true : undefined,
      ]),
    );

    expect(
      noEliminationWarmupPoolingPhase(
        { n: 5 },
        {
          roomSize: { min: 2, max: 3, ideal: 2 },
          oddCountStrategy: "flex",
        },
      ),
    ).toMatchObject({ seedTotal: 5, nextRoundNum: 3 });

    const roster = Array.from({ length: 9 }, (_, index) => `P${index + 1}`);
    const grouped = groupStagePoolingPhase(
      {
        n: 9,
        groupSize: 4,
        qualifiersPerGroup: 2,
        roundRobinMode: "single",
      },
      roster,
    );
    expect(grouped.groups).toEqual([
      { label: "A", members: ["P1", "P4", "P5", "P8", "P9"] },
      { label: "B", members: ["P2", "P3", "P6", "P7"] },
    ]);
    expect(grouped.rounds.map((round) => round.rooms)).toEqual([
      [2, 2, 2, 2],
      [2, 2, 2, 2],
      [2, 2, 2, 2],
      [2, 2],
      [2, 2],
    ]);
    expect(grouped.rounds.map((round) => round.byeCount)).toEqual([1, 1, 1, 5, 5]);
    expect(seedFromGroupStageRound(grouped.rounds[0])).toEqual([
      { name: "P4", room: 1, isLucky: false },
      { name: "P9", room: 1, isLucky: false },
      { name: "P5", room: 2, isLucky: false },
      { name: "P8", room: 2, isLucky: false },
      { name: "P2", room: 3, isLucky: false },
      { name: "P7", room: 3, isLucky: false },
      { name: "P3", room: 4, isLucky: false },
      { name: "P6", room: 4, isLucky: false },
      { name: "P1", room: null, isLucky: false },
    ]);
  });
});

describe("single-elimination schedule generation", () => {
  it("matches target snapping and clean decreasing cuts", () => {
    const roomSize = ffaFormat.roomSize;
    expect([5, 9, 13, 19].map((count) => snapFriendly(count, roomSize))).toEqual([
      6,
      8,
      13,
      19,
    ]);
    expect(computeTargets(37, 16, 4, roomSize)).toEqual([30, 24, 20, 16]);
    expect(computeCleanTargets(37, 6, 8, roomSize)).toEqual([
      29,
      22,
      18,
      13,
      12,
      8,
      6,
    ]);
    expect(computeEliminationRoundCount(37, 16, roomSize)).toBe(4);
    expect(
      computeEliminationRoundCount(16, 4, headToHeadByeFormat.roomSize),
    ).toBe(2);
  });

  it("matches gradual FFA cuts, lucky losers, and multi-game phase sizes", () => {
    const rounds = singleEliminationBracketPhase(37, 3, ffaFormat);
    expect(
      rounds.map((round) => [
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
    ).toEqual([
      [3, 37, [8, 8, 7, 7, 7], 0, 6, 30, 0, false, false, undefined],
      [4, 30, [8, 8, 7, 7], 0, 6, 24, 0, false, false, undefined],
      [5, 24, [8, 8, 8], 0, 6, 20, 2, false, false, undefined],
      [6, 20, [7, 7, 6], 0, 5, 16, 1, false, false, undefined],
      [7, 16, [8, 8], 0, 4, 8, 0, true, false, 2],
      [8, 8, [8], 0, 1, 1, 0, false, true, 3],
    ]);
  });

  it("preserves head-to-head byes and composes pooling with the bracket", () => {
    const direct = singleEliminationBracketPhase(5, 3, headToHeadByeFormat);
    expect(direct.map((round) => [round.players, round.rooms, round.byeCount, round.luckyCount])).toEqual([
      [5, [2, 2], 1, 1],
      [4, [2, 2], 0, 0],
      [2, [2], 0, 0],
    ]);

    const progression = buildSingleEliminationProgression({
      poolingPhase: "none",
      config: {
        n: 5,
        qualAdv: 4,
        groupSize: 4,
        roundRobinMode: "single",
        qualifiersPerGroup: 2,
      },
      format: headToHeadByeFormat,
      roster: ["A", "B", "C", "D", "E"],
    });
    expect(progression.groups).toEqual([]);
    expect(progression.rounds).toHaveLength(5);
    expect(progression.rounds.map((round) => round.roundNum)).toEqual([1, 2, 3, 4, 5]);
  });
});
