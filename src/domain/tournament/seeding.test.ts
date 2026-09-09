import { describe, expect, it } from "vitest";
import {
  avoidSameGroupInFirstBracketRound,
  collectPlayedSwissPairs,
  createEmptyTournamentState,
  randomSeed,
  selectPoolingBye,
  snakeSeed,
  swissFoldPair,
  swissPairKey,
  type RandomSource,
} from "./index";

describe("seeding and pooling byes", () => {
  it("snake-seeds in the legacy bounce order", () => {
    expect(
      snakeSeed(
        ["A", "B", "C", "D", "E", "F", "G"],
        3,
      ).map((entry) => entry.room),
    ).toEqual([1, 2, 3, 3, 2, 1, 1]);
  });

  it("uses an injected Fisher-Yates source for random seeding", () => {
    const values = [0.4, 0.1, 0.8];
    const random: RandomSource = { next: () => values.shift() ?? 0 };
    expect(randomSeed(["A", "B", "C", "D"], [2, 2], random)).toEqual([
      { name: "C", room: 1, isLucky: false },
      { name: "D", room: 1, isLucky: false },
      { name: "A", room: 2, isLucky: false },
      { name: "B", room: 2, isLucky: false },
    ]);
  });

  it("swaps a resolvable same-group first-round collision", () => {
    const seeded = [
      { name: "A1", room: 1 },
      { name: "A2", room: 1 },
      { name: "B1", room: 2 },
      { name: "B2", room: 2 },
    ];
    expect(
      avoidSameGroupInFirstBracketRound(seeded, [
        { label: "A", members: ["A1", "A2"] },
        { label: "B", members: ["B1", "B2"] },
      ]),
    ).toEqual([
      { name: "A1", room: 1 },
      { name: "A2", room: 2 },
      { name: "B1", room: 1 },
      { name: "B2", room: 2 },
    ]);
  });

  it("selects the first best seed among units with the fewest prior byes", () => {
    expect(
      selectPoolingBye(
        [{ name: "A" }, { name: "B" }, { name: "C" }],
        { A: 2, B: 0, C: 1 },
      ),
    ).toEqual({ name: "B" });
  });
});

describe("Swiss fold pairing", () => {
  it("normalizes pair keys and records prior room opponents", () => {
    const state = createEmptyTournamentState({
      rounds: [
        {
          roundNum: 1, players: 4, rooms: [2, 2], byeCount: 0,
          isQual: false, isSwiss: true, isNoElim: true, isSemis: false,
          isFinal: false, advPerRoom: null, advTotal: 4, luckyCount: 0,
        },
      ],
      assignments: [[
        { name: "A", room: 1 }, { name: "D", room: 1 },
        { name: "C", room: 2 }, { name: "E", room: 2 },
      ]],
    });
    expect(swissPairKey("D", "A")).toBe("A|D");
    expect([...collectPlayedSwissPairs(state, 0)].sort()).toEqual(["A|D", "C|E"]);
  });

  it("rotates an odd-field bye and locally avoids two rematches", () => {
    const state = createEmptyTournamentState({
      players: ["A", "B", "C", "D", "E"],
      poolingByeCounts: { C: 1 },
      rounds: [
        {
          roundNum: 1, players: 5, rooms: [2, 2], byeCount: 1,
          isQual: false, isSwiss: true, isNoElim: true, isSemis: false,
          isFinal: false, advPerRoom: null, advTotal: 5, luckyCount: 0,
        },
      ],
      assignments: [[
        { name: "A", room: 1 }, { name: "D", room: 1 },
        { name: "C", room: 2 }, { name: "E", room: 2 },
        { name: "B", room: null },
      ]],
    });
    expect(
      swissFoldPair({
        activeNames: ["A", "B", "C", "D", "E"],
        throughRoundIndex: 0,
        roomSize: { min: 2, max: 2, ideal: 2 },
        state,
      }),
    ).toEqual({
      seeded: [
        { name: "A", room: 1, isLucky: false },
        { name: "E", room: 1, isLucky: false },
        { name: "C", room: 2, isLucky: false },
        { name: "D", room: 2, isLucky: false },
        { name: "B", room: null, isLucky: false },
      ],
      byeName: "B",
      poolingByeCounts: { B: 1, C: 1 },
    });
  });
});
