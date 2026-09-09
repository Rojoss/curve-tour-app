import {
  fairPoints,
  getUnitScore,
  groupByScore,
  orderRoomByScore,
  tieResolutionList,
} from "./scoring";
import { rosterKeys } from "./roster";
import type {
  TournamentRound,
  TournamentStanding,
  TournamentState,
} from "./types";

export interface ScoredUnit {
  name: string;
  score: number;
}

export interface LuckyLoserCandidate {
  name: string;
  pct: number;
}

export interface RoomTieCluster {
  players: ScoredUnit[];
  rm: number;
  score: number;
}

export interface CutoffTieCluster {
  key: string;
  players: TournamentStanding[];
  fp: number;
  rm: null;
  groupLabel?: string;
}

export function luckyLoserCandidate(
  scored: ScoredUnit[],
  advPerRoom: number,
): LuckyLoserCandidate | null {
  const candidate = scored[advPerRoom];
  if (!candidate) return null;
  const roomTotal = scored.reduce((total, entry) => total + entry.score, 0);
  if (roomTotal <= 0) return null;
  return { name: candidate.name, pct: candidate.score / roomTotal };
}

export function pickLuckyLosers(
  candidates: LuckyLoserCandidate[],
  luckyCount: number,
): string[] {
  if (!luckyCount || candidates.length === 0) return [];
  return [...candidates]
    .sort((first, second) => second.pct - first.pct)
    .slice(0, luckyCount)
    .map((candidate) => candidate.name);
}

export function detectTieBreaks(
  roundIndex: number,
  round: TournamentRound,
  state: TournamentState,
): Record<string, RoomTieCluster> {
  if (round.isFinal) return {};
  const ties: Record<string, RoomTieCluster> = {};
  for (let room = 1; room <= round.rooms.length; room += 1) {
    const assignments = (state.assignments[roundIndex] ?? []).filter(
      (assignment) => assignment.room === room,
    );
    const scored = assignments
      .map((assignment, position) => ({
        name: assignment.name,
        score: getUnitScore(state, roundIndex, room, position, null),
      }))
      .filter((entry): entry is ScoredUnit => entry.score !== null)
      .sort((first, second) => second.score - first.score);
    for (const cluster of groupByScore(scored)) {
      if (cluster.length < 2) continue;
      const key = `r${roundIndex}-rm${room}-s${cluster[0].score}`;
      ties[key] = { players: cluster, rm: room, score: cluster[0].score };
    }
  }
  return ties;
}

export function isTieResolved(
  key: string,
  cluster: Pick<RoomTieCluster, "players"> | Pick<CutoffTieCluster, "players">,
  state: Pick<TournamentState, "tieResolutions">,
): boolean {
  return tieResolutionList(state, key).length >= cluster.players.length - 1;
}

export function detectQualCutoffTie(
  state: Pick<TournamentState, "qualTable" | "cfg">,
): CutoffTieCluster | null {
  const table = state.qualTable.filter(
    (entry): entry is TournamentStanding & { totalFP: number } =>
      entry.totalFP !== null,
  );
  const qualifiers = state.cfg.qualAdv;
  if (!qualifiers || qualifiers >= table.length) return null;
  const boundary = table[qualifiers - 1].totalFP;
  const players = table.filter((entry) => entry.totalFP === boundary);
  if (players.length < 2) return null;
  return { key: "qual-cutoff", players, fp: boundary, rm: null };
}

export function detectGroupCutoffTie(
  label: string,
  state: Pick<TournamentState, "groupStandings" | "cfg">,
): CutoffTieCluster | null {
  const table = (state.groupStandings[label] ?? []).filter(
    (entry): entry is TournamentStanding & { totalFP: number } =>
      entry.totalFP !== null,
  );
  const qualifiers = state.cfg.qualifiersPerGroup;
  if (!qualifiers || qualifiers >= table.length) return null;
  const boundary = table[qualifiers - 1].totalFP;
  const players = table.filter((entry) => entry.totalFP === boundary);
  if (players.length < 2) return null;
  return {
    key: `group-cutoff-${label}`,
    players,
    fp: boundary,
    rm: null,
    groupLabel: label,
  };
}

function applyCutoffOrder(
  table: TournamentStanding[],
  tie: CutoffTieCluster | null,
  state: Pick<TournamentState, "tieResolutions">,
): TournamentStanding[] {
  if (!tie) return table;
  const resolved = tieResolutionList(state, tie.key);
  const remaining = tie.players
    .map((entry) => entry.name)
    .filter((name) => !resolved.includes(name));
  const byName = new Map(tie.players.map((entry) => [entry.name, entry]));
  const output = [...table];
  const start = output.findIndex((entry) => entry.totalFP === tie.fp);
  for (const [offset, name] of [...resolved, ...remaining].entries()) {
    const entry = byName.get(name);
    if (entry && output[start + offset] !== undefined) {
      output[start + offset] = entry;
    }
  }
  return output;
}

export function applyQualCutoffOrder(
  table: TournamentStanding[],
  state: Pick<TournamentState, "qualTable" | "cfg" | "tieResolutions">,
): TournamentStanding[] {
  return applyCutoffOrder(table, detectQualCutoffTie(state), state);
}

export function applyGroupCutoffOrder(
  label: string,
  table: TournamentStanding[],
  state: Pick<
    TournamentState,
    "groupStandings" | "cfg" | "tieResolutions"
  >,
): TournamentStanding[] {
  return applyCutoffOrder(table, detectGroupCutoffTie(label, state), state);
}

export function orderScoredRoom(
  scored: ScoredUnit[],
  roundIndex: number,
  room: number,
  state: Pick<TournamentState, "tieResolutions">,
): ScoredUnit[] {
  return orderRoomByScore(scored, roundIndex, room, state);
}

interface StandingAccumulator {
  name: string;
  rounds: Array<{ fp: number; score: number }>;
}

function materializeStandings(
  entries: StandingAccumulator[],
): TournamentStanding[] {
  return entries
    .map((entry) => ({
      name: entry.name,
      totalFP: entry.rounds.length
        ? entry.rounds.reduce((total, round) => total + round.fp, 0)
        : null,
      totalScore: entry.rounds.reduce(
        (total, round) => total + round.score,
        0,
      ),
      played: entry.rounds.length,
    }))
    .sort((first, second) => {
      if (first.totalFP === null && second.totalFP === null) return 0;
      if (first.totalFP === null) return 1;
      if (second.totalFP === null) return -1;
      return first.totalFP - second.totalFP;
    });
}

export function computeQualificationStandings(
  state: TournamentState,
): TournamentStanding[] {
  const accumulators = new Map<string, StandingAccumulator>(
    rosterKeys(state.players).map((name) => [name, { name, rounds: [] }]),
  );
  for (const [roundIndex, round] of state.rounds.entries()) {
    if (!(round.isQual || round.isSwiss)) continue;
    for (let room = 1; room <= round.rooms.length; room += 1) {
      const assignments = (state.assignments[roundIndex] ?? []).filter(
        (assignment) => assignment.room === room,
      );
      const scored = assignments
        .map((assignment, position) => ({
          name: assignment.name,
          score: getUnitScore(state, roundIndex, room, position, null),
        }))
        .filter((entry): entry is ScoredUnit => entry.score !== null);
      for (const [index, entry] of orderRoomByScore(
        scored,
        roundIndex,
        room,
        state,
      ).entries()) {
        accumulators.get(entry.name)?.rounds.push({
          fp: fairPoints(index + 1, entry.score),
          score: entry.score,
        });
      }
    }
  }
  return materializeStandings([...accumulators.values()]);
}

export function computeGroupStandings(
  state: TournamentState,
): Record<string, TournamentStanding[]> {
  const byGroup = new Map<
    string,
    Map<string, StandingAccumulator>
  >();
  for (const group of state.groups) {
    byGroup.set(
      group.label,
      new Map(
        group.members.map((name) => [name, { name, rounds: [] }]),
      ),
    );
  }

  for (const [roundIndex, round] of state.rounds.entries()) {
    if (!round.isGroupStage) continue;
    for (let room = 1; room <= round.rooms.length; room += 1) {
      const groupLabel = round.roomGroups?.[room - 1];
      if (!groupLabel) continue;
      const assignments = (state.assignments[roundIndex] ?? []).filter(
        (assignment) => assignment.room === room,
      );
      const scored = assignments
        .map((assignment, position) => ({
          name: assignment.name,
          score: getUnitScore(state, roundIndex, room, position, null),
        }))
        .filter((entry): entry is ScoredUnit => entry.score !== null);
      for (const [index, entry] of orderRoomByScore(
        scored,
        roundIndex,
        room,
        state,
      ).entries()) {
        byGroup.get(groupLabel)?.get(entry.name)?.rounds.push({
          fp: fairPoints(index + 1, entry.score),
          score: entry.score,
        });
      }
    }
  }

  return Object.fromEntries(
    [...byGroup].map(([label, entries]) => [
      label,
      materializeStandings([...entries.values()]),
    ]),
  );
}

export function computeGroupStageAdvancement(state: TournamentState): {
  advancing: Array<{ name: string; isLucky: false }>;
  luckyNames: null;
  groupStandings: Record<string, TournamentStanding[]>;
} {
  const groupStandings = computeGroupStandings(state);
  const stateWithStandings = { ...state, groupStandings };
  const qualifiersPerGroup = state.cfg.qualifiersPerGroup ?? 0;
  const perGroup = state.groups.map((group) =>
    applyGroupCutoffOrder(
      group.label,
      (groupStandings[group.label] ?? []).filter(
        (entry) => entry.totalFP !== null,
      ),
      stateWithStandings,
    ).slice(0, qualifiersPerGroup),
  );
  const advancing: Array<{ name: string; isLucky: false }> = [];
  for (let tier = 0; tier < qualifiersPerGroup; tier += 1) {
    const finishers = perGroup
      .map((qualifiers) => qualifiers[tier])
      .filter((entry): entry is TournamentStanding => Boolean(entry))
      .sort(
        (first, second) =>
          (first.totalFP as number) - (second.totalFP as number),
      );
    for (const finisher of finishers) {
      advancing.push({ name: finisher.name, isLucky: false });
    }
  }
  return { advancing, luckyNames: null, groupStandings };
}
