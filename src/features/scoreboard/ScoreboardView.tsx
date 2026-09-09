import {
  computeGroupStandings,
  computeQualificationStandings,
  getFinalUnitScore,
  getGameFormat,
  getUnitScore,
  orderRoomByScore,
  roomBasedComputeAdvancement,
  unitDisplay,
  type TournamentState,
} from "../../domain/tournament";
import { useTournamentApp } from "../tournament/TournamentProvider";

function Unit({ state, name }: { state: TournamentState; name: string }) {
  const info = unitDisplay(state, name);
  return <span><strong>{info.label}</strong>{info.members?.length ? <small className="unit-members">{info.members.join(" · ")}</small> : null}</span>;
}

function ScoreboardStandings({ state }: { state: TournamentState }) {
  const hasGroups = state.rounds.slice(0, state.curRound + 1).some((round) => round.isGroupStage);
  const hasStandings = state.rounds.slice(0, state.curRound + 1).some((round) => round.isQual || round.isSwiss);
  if (!hasGroups && !hasStandings) return null;
  const groupStandings = hasGroups ? computeGroupStandings(state) : null;
  const tables = hasGroups
    ? state.groups.map((group) => [group.label, groupStandings?.[group.label] ?? []] as const)
    : [[state.cfg.poolingPhase === "swiss" ? "Swiss Standings" : "Qualification Table", computeQualificationStandings(state)] as const];
  return <div className="standings-grid">{tables.map(([label, entries]) => <div className="card" key={label}><div className="card-title">{label}</div><div className="table-scroll"><table><thead><tr><th>Pos</th><th>Player / Team</th><th>Fair Points</th><th>Score</th><th>Played</th></tr></thead><tbody>{entries.map((entry, index) => <tr key={entry.name}><td>{index + 1}</td><td><Unit state={state} name={entry.name} /></td><td>{entry.totalFP?.toFixed(5) ?? "—"}</td><td>{entry.totalScore}</td><td>{entry.played}</td></tr>)}</tbody></table></div></div>)}</div>;
}

export function ScoreboardView() {
  const { state } = useTournamentApp();
  if (!state.rounds.length || !state.started) {
    return <div className="msg msg-info">Start a tournament in Admin to see the live scoreboard.</div>;
  }
  const roundIndex = state.curRound;
  const round = state.rounds[roundIndex];
  const assignments = state.assignments[roundIndex] ?? [];
  const format = getGameFormat(state.gameFormat);
  let luckyNames: string[] = [];
  if (!round.bracket && !round.isFinal) {
    try { luckyNames = roomBasedComputeAdvancement(state, roundIndex).luckyNames ?? []; } catch { luckyNames = []; }
  }
  const phase = round.isFinal ? "🏆 Grand Final" : round.isSemis ? "⚔ Semi-Finals" : `Round ${round.roundNum}`;
  return <div id="sb-content">
    <div className="stats"><div><span>Round</span><strong>{phase}</strong></div><div><span>{format?.unitLabelPlural}</span><strong>{assignments.length}</strong></div><div><span>Rooms</span><strong>{round.rooms.length}</strong></div><div><span>Advancing</span><strong>{round.isNoElim ? "All" : round.isFinal ? "—" : round.advTotal}</strong></div></div>
    <ScoreboardStandings state={state} />
    {Array.from({ length: round.rooms.length }, (_, roomIndex) => {
      const room = roomIndex + 1;
      const units = assignments.filter((entry) => entry.room === room);
      const direct = round.isNoElim || round.isFinal ? units.length : (round.advPerRoom ?? 0);
      const scored = units.map((entry, position) => ({
        name: entry.name,
        score: round.isFinal
          ? Array.from({ length: round.numGames ?? 1 }, (_, game) => getFinalUnitScore(state, entry.name, game + 1, null)).every((score) => score !== null)
            ? Array.from({ length: round.numGames ?? 1 }, (_, game) => getFinalUnitScore(state, entry.name, game + 1, 0) ?? 0).reduce((sum, score) => sum + score, 0)
            : null
          : getUnitScore(state, roundIndex, room, position, null),
      }));
      const rankedScored = orderRoomByScore(scored.filter((entry): entry is { name: string; score: number } => entry.score !== null), roundIndex, room, state);
      const ranked = [...rankedScored, ...scored.filter((entry) => entry.score === null)];
      return <div className="room-block" key={room}><div className="room-header"><div className="room-name">{round.isGroupStage ? `Group ${round.roomGroups?.[roomIndex]} · ` : ""}Room {room}</div><div className="room-meta">Top {round.isNoElim ? "all" : direct} advance</div></div><div className="table-scroll"><table><thead><tr><th>Pos</th><th>{format?.unitLabel}</th><th>Score</th><th>Status</th></tr></thead><tbody>{ranked.map((entry, index) => {
        const scoredEntry = entry.score !== null;
        const advances = round.isNoElim || round.isFinal || index < direct || luckyNames.includes(entry.name);
        return <tr key={entry.name} className={scoredEntry ? advances ? "adv-row" : "elim-row" : ""}><td><span className={`pos-num ${scoredEntry && advances ? "top" : ""}`}>{scoredEntry ? index + 1 : "—"}</span></td><td><Unit state={state} name={entry.name} /></td><td className="score-total">{entry.score ?? "—"}</td><td><span className={`pill ${!scoredEntry ? "pill-neut" : advances ? "pill-adv" : "pill-elim"}`}>{!scoredEntry ? "—" : advances ? "Advances" : "Eliminated"}</span></td></tr>;
      })}</tbody></table></div></div>;
    })}
    {(state.byes[roundIndex] ?? []).map((name) => <div className="bye-card" key={name}><strong>BYE</strong><Unit state={state} name={name} /><span className="pill pill-adv">Advances</span></div>)}
  </div>;
}
