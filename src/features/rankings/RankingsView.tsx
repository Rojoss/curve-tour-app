import {
  computeRankings,
  rosterKeys,
  unitDisplay,
  type RankingDisplay,
  type TournamentRound,
  type TournamentState,
} from "../../domain/tournament";
import { useTournamentApp } from "../tournament/TournamentProvider";
import { downloadRankingsImage } from "./rankings-image";

function Unit({ entry }: { entry: RankingDisplay }) {
  return <span><strong>{entry.label}</strong>{entry.members?.length ? <small className="unit-members">{entry.members.join(" & ")}</small> : null}</span>;
}

function RoundLabel({ round }: { round: TournamentRound }) {
  return <>{round.isFinal ? "🏆 Final" : round.isSemis ? "⚔ Semis" : round.isQual ? `Qual R${round.roundNum}` : round.isSwiss ? `Swiss R${round.roundNum}` : round.isGroupStage ? `Group R${round.roundNum}` : `Round ${round.roundNum}`}</>;
}

function RosterOnly({ state }: { state: TournamentState }) {
  const rows = [
    ...rosterKeys(state.players).map((name) => ({ name, badge: "Registered" })),
    ...rosterKeys(state.reserves).map((name) => ({ name, badge: "Reserve" })),
  ].sort((a, b) => unitDisplay(state, a.name).label.localeCompare(unitDisplay(state, b.name).label));
  return <div className="rk-columns">{rows.map(({ name, badge }) => {
    const info = unitDisplay(state, name);
    return <div className="rk-row" key={`${badge}-${name}`}><span className="rk-rank">—</span><span className="rk-unit"><Unit entry={{ name, ...info }} /></span><span className="pill pill-neut">{badge}</span></div>;
  })}</div>;
}

export function RankingsContent({ state, downloads = true }: { state: TournamentState; downloads?: boolean }) {
  if (!state.players.length && !state.reserves.length) {
    return <div className="msg msg-info">No players registered yet — check back once the organiser loads a roster in Admin.</div>;
  }
  const data = computeRankings(state);
  if (!data) return <RosterOnly state={state} />;
  return <div id="rk-content">
    <p className="muted">Live tournament ranking. Active entrants remain unranked until eliminated or the Final is complete.</p>
    {downloads ? <div className="btn-row"><button className="btn btn-secondary btn-sm" onClick={() => void downloadRankingsImage(state)}>⬇ Download rankings PNG</button></div> : null}
    {data.stillActive.length ? <><div className="rk-section-title">Still in tournament</div><div className="rk-columns">{data.stillActive.map((unit) => <div className="rk-row rk-active" key={unit.name}><span className="rk-rank">—</span><span className="rk-unit"><Unit entry={unit} /><small className="rk-sub"><RoundLabel round={data.lastRound} /> — {unit.room === null ? <strong className="amber">BYE — advances automatically</strong> : <>Room <strong>{unit.room}</strong></>}</small></span><span className="rk-status"><span className="pill pill-neut">Still in tournament</span>{unit.poolRank ? <small>#{unit.poolRank.rank}{unit.poolRank.fp !== null ? ` · ${unit.poolRank.fp.toFixed(3)} FP` : ""}</small> : null}</span></div>)}</div></> : null}
    {data.finalComplete || data.eliminatedList.length ? <><div className="rk-section-title">Final standings</div><div className="rk-columns">{data.finalists.map((unit) => <div className={`rk-row ${unit.rank === 1 ? "rk-champion" : ""}`} key={unit.name}><span className={`pos-num ${unit.rank === 1 ? "top" : ""}`}>{unit.rank}</span><span className="rk-unit"><Unit entry={unit} /></span><span className="pill pill-final">🏆 Reached Final</span></div>)}{data.eliminatedList.map((unit) => <div className="rk-row" key={unit.name}><span className="pos-num">{unit.rank}</span><span className="rk-unit"><Unit entry={unit} /></span><span className="pill pill-neut"><RoundLabel round={unit.round} /></span></div>)}</div></> : null}
  </div>;
}

export function RankingsView() {
  const { state } = useTournamentApp();
  return <RankingsContent state={state} />;
}
