export interface Clock {
  now(): number;
}

export interface RandomSource {
  next(): number;
}

export interface IdSource {
  tournamentId(): string;
  rosterUnitId(prefix: "team" | "reserveteam", index: number): string;
}

export interface TournamentRuntime {
  clock: Clock;
  random: RandomSource;
  ids: IdSource;
}

const systemClock: Clock = {
  now: () => Date.now(),
};

const systemRandom: RandomSource = {
  next: () => Math.random(),
};

export function createLegacyCompatibleIdSource(clock: Clock): IdSource {
  return {
    tournamentId: () => String(clock.now()),
    rosterUnitId: (prefix, index) => `${prefix}_${clock.now()}_${index}`,
  };
}

export function createTournamentRuntime(
  overrides: Partial<TournamentRuntime> = {},
): TournamentRuntime {
  const clock = overrides.clock ?? systemClock;
  return {
    clock,
    random: overrides.random ?? systemRandom,
    ids: overrides.ids ?? createLegacyCompatibleIdSource(clock),
  };
}

export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return {
    next() {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 0x1_0000_0000;
    },
  };
}

export function createFixedClock(timestamp: number): Clock {
  return { now: () => timestamp };
}
