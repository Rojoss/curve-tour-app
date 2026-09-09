import {
  getUnitScore,
  groupByScore,
  orderRoomByScore,
  tieResolutionList,
} from "./scoring";
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
