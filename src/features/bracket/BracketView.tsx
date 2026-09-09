import { useEffect, useMemo, useRef, useState } from "react";
import {
  bracketFollowStatus,
  bracketRoundDefaultCollapsed,
  bracketRoundLabels,
  buildTeamMap,
  detectTieBreaks,
  finalsProgressState,
  getAllTies,
  getDefenderIndex,
  getGameFormat,
  getUnitScore,
  isTieResolved,
  orderRoomByScore,
  resolveUnitQuery,
  setFinalScore,
  setRoundScore,
  unitDisplay,
  type BracketFollowStatus,
  type TournamentRound,
  type TournamentState,
} from "../../domain/tournament";
import { readBracketFollow, saveBracketFollow } from "../../lib/persistence";
import { useTournamentApp } from "../tournament/TournamentProvider";

function FollowBanner({ state, followKey, follow, clear }: { state: TournamentState; followKey: string | null; follow: BracketFollowStatus | null; clear(): void }) {
  if (!followKey) return null;
  const label = unitDisplay(state, followKey).label;
  if (!follow) return <div className="bracket-follow-pill is-out"><strong>Following {label}</strong> — not in this bracket <button type="button" className="bracket-follow-clear" onClick={clear}>✕</button></div>;
  const roundName = bracketRoundLabels(state)[follow.lastRi]?.label ?? `Round ${follow.lastRi + 1}`;
  const where = follow.eliminated ? `out in ${roundName}` : follow.isBye ? `${roundName} · BYE, advances automatically` : `${roundName} · Room ${follow.room}`;
  return <div className={`bracket-follow-pill ${follow.eliminated ? "is-out" : ""}`}><strong>Following {label}</strong> — {where}<button type="button" className="bracket-follow-clear" onClick={clear} title="Stop following">✕</button></div>;
}

function UnitLabel({ state, name, roundIndex }: { state: TournamentState; name: string; roundIndex: number }) {
  const info = unitDisplay(state, name);
  const team = buildTeamMap(state)[name];
  return <><span>{info.label}</span>{info.members?.length ? <span className="bracket-team-members">{info.members.map((member, index) => {
    const rawIndex = team?.members.findIndex((entry) => entry?.name === member) ?? index;
    const defender = state.gamemodeConfig.teamScoringRule === "designated-player" && getDefenderIndex(state, name, roundIndex) === rawIndex;
    return `${member}${defender ? " 🛡" : ""}`;
  }).join(", ")}</span> : null}</>;
}

function BracketScoreInput({ state, scoreKey, roundIndex, room }: { state: TournamentState; scoreKey: string; roundIndex: number; room: number }) {
  const app = useTournamentApp();
  return <input type="number" min="0" className="score-inp" value={state.scores[scoreKey] ?? ""} data-key={scoreKey} onChange={(event) => app.updateState((current) => setRoundScore(current, scoreKey, event.target.value, roundIndex, room))} />;
}

function FinalColumn({ state, roundIndex, editable, followed }: { state: TournamentState; roundIndex: number; editable: boolean; followed: string | null }) {
  const app = useTournamentApp();
  const round = state.rounds[roundIndex];
  const assignments = state.assignments[roundIndex] ?? [];
  const progress = finalsProgressState(state, roundIndex, round);
  const teamSize = getGameFormat(state.gameFormat)?.teamSize ?? 0;
  const teamMap = buildTeamMap(state);
  const names = progress.complete ? progress.order.filter((name): name is string => Boolean(name)) : assignments.map((entry) => entry.name);
  return <>
    {progress.race ? <div className="bracket-final-race"><span className="bfr-wb">{unitDisplay(state, progress.race.wbName).label}</span> <b>{progress.race.wbWins}</b>/{progress.race.wbTarget} <span className="bfr-sep">·</span> <span className="bfr-lb">{unitDisplay(state, progress.race.lbName).label}</span> <b>{progress.race.lbWins}</b>/{progress.race.lbTarget} {progress.race.decided ? <span className="bfr-won">🏆 {unitDisplay(state, progress.race.winnerName as string).label} wins</span> : null}</div> : null}
    {editable && progress.nextGame !== null ? <div className="bracket-final-openlabel">Game {progress.nextGame} — enter scores</div> : null}
    {names.map((name, index) => {
      const unit = progress.units.find((entry) => entry.name === name);
      if (!unit) return null;
      const winner = progress.complete && index === 0;
      const nextGame = progress.nextGame;
      const team = teamMap[name];
      return <div className={`bracket-final-row ${progress.complete ? "adv" : ""} ${winner ? "is-final-winner" : ""} ${followed === name ? "is-followed" : ""} ${editable ? "is-editable" : ""}`} key={name}>
        <div className="bracket-final-line1"><span className="bracket-final-name">{winner ? "🏆 " : ""}{unitDisplay(state, name).label}</span><span className="bracket-final-total" title={progress.isGrandFinal ? "Games won" : "Cumulative Final score"}>{progress.isGrandFinal ? unit.wins : unit.total}</span></div>
        {teamSize ? <UnitLabel state={state} name={name} roundIndex={roundIndex} /> : null}
        <div className="bracket-final-games">{unit.perGame.map((score, game) => <span className={score === null ? "is-pending" : ""} key={game}>G{game + 1} {score === null ? "—" : <b>{score}</b>}</span>)}</div>
        {editable && nextGame !== null ? <div className="bracket-final-next"><span className="bfn-label">G{nextGame}</span>{teamSize ? <div className="bracket-team-scores">{Array.from({ length: teamSize }, (_, memberIndex) => {
          const member = team?.members?.[memberIndex];
          if (!member) return <input key={memberIndex} type="number" className="score-inp" disabled placeholder="—" />;
          const key = `game${nextGame}-${name}-m${memberIndex}`;
          return <label key={key}><span>{member.name}</span><input type="number" className="score-inp" min="0" value={state.finalScores[key] ?? ""} onChange={(event) => app.updateState((current) => setFinalScore(current, key, event.target.value))} /></label>;
        })}</div> : (() => {
          const key = `game${nextGame}-${name}`;
          return <input type="number" className="score-inp" min="0" value={state.finalScores[key] ?? ""} onChange={(event) => app.updateState((current) => setFinalScore(current, key, event.target.value))} />;
        })()}</div> : null}
      </div>;
    })}
    {editable && progress.nextGame !== null && progress.nextGame > 1 ? <div className="bracket-final-hint">Earlier games are edited in Admin</div> : null}
  </>;
}

function PlaceholderRound({ round }: { round: TournamentRound }) {
  if (!round.rooms.length) return <div className="muted">Not yet seeded</div>;
  return <>{round.rooms.map((slots, roomIndex) => <div className="bracket-room-group" key={roomIndex}><div className="bracket-room-label">{round.isGroupStage ? `Group ${round.roomGroups?.[roomIndex]} · ` : ""}Room {roomIndex + 1} ({slots})</div>{Array.from({ length: slots }, (_, slot) => <div className="bracket-placeholder-row" key={slot}>—</div>)}</div>)}{round.pairingTBD ? <div className="bracket-placeholder-note">Pairings determined live</div> : null}</>;
}

function RoundBody({ state, roundIndex, editable, followKey }: { state: TournamentState; roundIndex: number; editable: boolean; followKey: string | null }) {
  const round = state.rounds[roundIndex];
  const assignments = state.assignments[roundIndex] ?? [];
  if (!assignments.length) return <PlaceholderRound round={round} />;
  if (round.isFinal) return <FinalColumn state={state} roundIndex={roundIndex} editable={editable && roundIndex === state.curRound} followed={followKey} />;
  const teamSize = getGameFormat(state.gameFormat)?.teamSize ?? 0;
  const teamMap = buildTeamMap(state);
  const rowsEditable = editable && roundIndex === state.curRound && (round.numGames ?? 1) <= 1;
  const luckyLookup = round.winnersTo ?? roundIndex + 1;
  const luckyNames = state.luckyLosers[luckyLookup] ?? [];
  const roomTies = detectTieBreaks(roundIndex, round, state);
  const resolvedTieNames = new Set(Object.entries(roomTies).filter(([key]) => tieResolutionListSafe(state, key).length > 0).flatMap(([, tie]) => tie.players.map((entry) => entry.name)));
  const pendingTieNames = new Set(Object.entries(getAllTies(state, roundIndex)).filter(([key, tie]) => !isTieResolved(key, tie, state)).flatMap(([, tie]) => tie.players.map((entry) => entry.name)));
  return <>{round.rooms.map((_, roomIndex) => {
    const room = roomIndex + 1;
    const units = assignments.filter((entry) => entry.room === room);
    const direct = round.isNoElim ? units.length : (round.advPerRoom ?? 0);
    const scored = units.map((entry, position) => ({ name: entry.name, position, score: getUnitScore(state, roundIndex, room, position, null) }));
    const complete = scored.length > 0 && scored.every((entry) => entry.score !== null);
    const showResults = roundIndex <= state.curRound && complete;
    const display = showResults ? orderRoomByScore(scored as Array<{ name: string; position: number; score: number }>, roundIndex, room, state) : scored;
    return <div className="bracket-room-group" key={room}><div className="bracket-room-label">{round.isGroupStage ? `Group ${round.roomGroups?.[roomIndex]} · ` : ""}Room {room} ({units.length})</div>{display.map((entry, index) => {
      const advances = round.isNoElim || index < direct;
      const lucky = luckyNames.includes(entry.name);
      const resultClass = showResults ? lucky ? "lucky" : advances ? "adv" : "elim" : "";
      const followed = followKey === entry.name ? "is-followed" : "";
      const pending = showResults && pendingTieNames.has(entry.name) ? "tie-pending" : "";
      const badges = <>{showResults && lucky ? "★ " : ""}{showResults && resolvedTieNames.has(entry.name) ? <span className="bracket-tb-badge">⚖ TB</span> : null}{pending ? <span className="bracket-tie-pending-badge">⚠ TB?</span> : null}</>;
      if (teamSize) {
        const team = teamMap[entry.name];
        return <div className={`bracket-team-row ${resultClass} ${followed} ${pending} ${rowsEditable ? "is-editable" : ""}`} key={entry.name}><div className="bracket-team-line1"><span className="bracket-team-name">{badges}<UnitLabel state={state} name={entry.name} roundIndex={roundIndex} /></span>{showResults ? <span className="bracket-score">{entry.score}</span> : null}</div>{rowsEditable ? <div className="bracket-team-scores">{Array.from({ length: teamSize }, (_, memberIndex) => {
          const member = team?.members?.[memberIndex];
          if (!member) return <input key={memberIndex} type="number" className="score-inp" disabled placeholder="—" />;
          const key = `r${roundIndex}-rm${room}-p${entry.position}-m${memberIndex}`;
          return <label key={key}><span>{member.name}</span><BracketScoreInput state={state} scoreKey={key} roundIndex={roundIndex} room={room} /></label>;
        })}</div> : null}</div>;
      }
      const key = `r${roundIndex}-rm${room}-p${entry.position}`;
      return <div className={`bracket-player-row ${resultClass} ${followed} ${pending} ${rowsEditable ? "is-editable" : ""}`} key={entry.name}><span>{badges}{entry.name}</span>{rowsEditable ? <BracketScoreInput state={state} scoreKey={key} roundIndex={roundIndex} room={room} /> : showResults ? <span className="bracket-score">{entry.score}</span> : null}</div>;
    })}</div>;
  })}{(state.byes[roundIndex] ?? []).map((name) => <div className={`bracket-bye-card ${followKey === name ? "is-followed" : ""}`} key={name}><span className="bracket-bye-label">BYE</span>{unitDisplay(state, name).label}</div>)}</>;
}

function tieResolutionListSafe(state: TournamentState, key: string): string[] {
  const value = state.tieResolutions[key];
  return Array.isArray(value) ? value : value ? [value] : [];
}

export function BracketView() {
  const app = useTournamentApp();
  const [collapse, setCollapse] = useState<Record<number, boolean>>({});
  const [query, setQuery] = useState("");
  const [followKey, setFollowKey] = useState<string | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!app.hydrated) return;
    const stored = readBracketFollow(window.localStorage);
    setFollowKey(stored);
    if (stored) setQuery(unitDisplay(app.state, stored).label);
  }, [app.hydrated]);
  useEffect(() => {
    setCollapse({});
  }, [app.state.tournamentId]);
  const follow = useMemo(() => bracketFollowStatus(app.state, followKey), [app.state, followKey]);
  const labels = bracketRoundLabels(app.state);
  if (!app.state.rounds.length) return <div className="msg msg-info">Start a tournament in Admin to see the bracket overview.</div>;
  const editable = app.unlocked && !app.isViewer && app.state.started;
  function chooseFollow(value: string) {
    setQuery(value);
    const resolved = resolveUnitQuery(app.state, value);
    setFollowKey(resolved);
    saveBracketFollow(window.localStorage, resolved);
    if (resolved) queueMicrotask(() => {
      const status = bracketFollowStatus(app.state, resolved);
      const column = status ? scroll.current?.querySelector<HTMLElement>(`[data-ri="${status.lastRi}"]`) : null;
      if (column && scroll.current) scroll.current.scrollTo({ left: Math.max(0, column.offsetLeft - (scroll.current.clientWidth - column.offsetWidth) / 2), behavior: "smooth" });
    });
  }
  return <div id="br-content"><div className="bracket-follow-bar"><input id="br-follow-input" type="text" placeholder="Follow a player or team…" value={query} onChange={(event) => chooseFollow(event.target.value)} /><FollowBanner state={app.state} followKey={followKey} follow={follow} clear={() => { setQuery(""); setFollowKey(null); saveBracketFollow(window.localStorage, null); }} /></div><div className="bracket-legend"><span className="pill pill-adv">Advanced</span><span className="pill pill-lucky">Lucky loser</span><span className="pill pill-elim">Eliminated</span></div><div className="bracket-scroll" id="br-rounds" ref={scroll}>{app.state.rounds.map((round, roundIndex) => {
    const collapsed = collapse[roundIndex] ?? bracketRoundDefaultCollapsed(roundIndex, app.state.curRound);
    const containsFollow = Boolean(follow?.rounds[roundIndex]);
    return <div className={`bracket-round-col ${collapsed ? "is-collapsed" : ""} ${roundIndex === app.state.curRound ? "current-col" : ""}`} data-ri={roundIndex} key={roundIndex}><button className={`bracket-round-hdr collapsible ${collapsed ? "is-collapsed" : ""} ${roundIndex === app.state.curRound ? "current-hdr" : ""} ${labels[roundIndex]?.accent ? `${labels[roundIndex].accent}-hdr` : ""} ${containsFollow ? "has-followed" : ""}`} onClick={() => setCollapse((current) => ({ ...current, [roundIndex]: !collapsed }))}><span className="bracket-collapse-chevron">▸</span>{labels[roundIndex]?.label}</button>{!collapsed ? <div className="bracket-round-body"><RoundBody state={app.state} roundIndex={roundIndex} editable={editable} followKey={followKey} /></div> : null}</div>;
  })}</div></div>;
}
