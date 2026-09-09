import { useMemo, useState } from "react";
import {
  addReserveUnit,
  addWalkUpIndividual,
  advanceTournamentRound,
  computeQualificationStandings,
  finalsProgressState,
  fillTeamSlot,
  getAllTies,
  getDefenderIndex,
  getFinalUnitScore,
  getGameFormat,
  getUnitScore,
  isTieResolved,
  orderRoomByScore,
  parseTeamLines,
  removeReserveUnit,
  removeRosterUnit,
  renameIndividual,
  resetTournamentState,
  resolveTournamentTie,
  roomBasedComputeAdvancement,
  setFinalScore,
  setRoundScore,
  setTeamDefender,
  swapIndividual,
  swapTeam,
  tieResolutionList,
  unitDisplay,
  updateTeam,
  type ReserveAddResult,
  type TournamentState,
  type TournamentTeam,
} from "../../domain/tournament";
import { useTournamentApp } from "../tournament/TournamentProvider";

function phaseLabel(state: TournamentState) {
  const round = state.rounds[state.curRound];
  if (!round) return "—";
  if (round.isFinal) return round.bracket === "grand-final" ? "🏆 Grand Final" : "🏆 Final";
  if (round.isSemis) return "⚔ Semi-Finals";
  if (round.isQual) return `Round ${round.roundNum} (Qual)`;
  if (round.isSwiss) return `Round ${round.roundNum} (Swiss)`;
  if (round.isGroupStage) return `Round ${round.roundNum} (Group)`;
  if (round.isNoElim) return `Round ${round.roundNum} (No elim)`;
  return `Round ${round.roundNum}`;
}

function UnitName({ state, name }: { state: TournamentState; name: string }) {
  const display = unitDisplay(state, name);
  return (
    <span>
      <strong>{display.label}</strong>
      {display.members?.length ? <small className="unit-members">{display.members.join(" · ")}</small> : null}
    </span>
  );
}

function TieBanners({ state }: { state: TournamentState }) {
  const app = useTournamentApp();
  const ties = getAllTies(state, state.curRound);
  return Object.entries(ties)
    .filter(([key, tie]) => !isTieResolved(key, tie, state))
    .map(([key, tie]) => {
      const resolved = tieResolutionList(state, key);
      const remaining = tie.players.filter((player) => !resolved.includes(player.name));
      const heading = "groupLabel" in tie && tie.groupLabel
        ? `⚠ Tie-break required — Group ${tie.groupLabel} qualification cutoff (${tie.fp.toFixed(5)} FP)`
        : "score" in tie
          ? `⚠ Tie-break required — Room ${tie.rm} (score ${tie.score})`
          : `⚠ Tie-break required — Qualification cutoff (${tie.fp.toFixed(5)} FP)`;
      return (
        <div className="tie-banner" key={key}>
          <div>
            <div className="tie-banner-text">{heading}</div>
            <div className="tie-banner-sub">
              {resolved.length ? `Ranked so far: ${resolved.map((name) => unitDisplay(state, name).label).join(" > ")} — ` : ""}
              tied: {tie.players.map((player) => unitDisplay(state, player.name).label).join(", ")} — pick who ranks next
            </div>
          </div>
          <div className="btn-row compact">
            {remaining.map((player) => (
              <button
                className="btn btn-sm btn-amber"
                key={player.name}
                onClick={() => app.updateState((current) => resolveTournamentTie(current, key, player.name))}
              >
                {unitDisplay(state, player.name).label} ranks next
              </button>
            ))}
          </div>
        </div>
      );
    });
}

function ScoreInput({
  scoreKey,
  value,
  roundIndex,
  room,
}: {
  scoreKey: string;
  value: number | null | "" | undefined;
  roundIndex: number;
  room: number;
}) {
  const app = useTournamentApp();
  return (
    <input
      type="number"
      min="0"
      className="score-inp"
      data-key={scoreKey}
      data-rm={room}
      data-ri={roundIndex}
      value={value ?? ""}
      onChange={(event) =>
        app.updateState((current) =>
          setRoundScore(current, scoreKey, event.target.value, roundIndex, room),
        )
      }
    />
  );
}

function RoomScores({ state, room }: { state: TournamentState; room: number }) {
  const roundIndex = state.curRound;
  const round = state.rounds[roundIndex];
  const format = getGameFormat(state.gameFormat);
  const assignments = (state.assignments[roundIndex] ?? []).filter((entry) => entry.room === room);
  const games = (round.numGames ?? 1) > 1 ? (round.numGames ?? 1) : 1;
  const teamSize = format?.teamSize ?? 0;
  const direct = round.isNoElim ? assignments.length : (round.advPerRoom ?? 0);
  const ranked = orderRoomByScore(
    assignments
      .map((entry, position) => ({ name: entry.name, position, score: getUnitScore(state, roundIndex, room, position, null) }))
      .filter((entry): entry is { name: string; position: number; score: number } => entry.score !== null),
    roundIndex,
    room,
    state,
  );
  const rankByName = new Map(ranked.map((entry, index) => [entry.name, index + 1]));
  let luckyNames: string[] = [];
  if (!round.bracket) {
    try {
      luckyNames = roomBasedComputeAdvancement(state, roundIndex).luckyNames ?? [];
    } catch {
      luckyNames = [];
    }
  }
  const ties = getAllTies(state, roundIndex);
  const unresolvedNames = new Set(
    Object.entries(ties)
      .filter(([key, tie]) => !isTieResolved(key, tie, state))
      .flatMap(([, tie]) => tie.players.map((entry) => entry.name)),
  );
  return (
    <div className="room-block">
      <div className="room-header">
        <div className="room-name">
          {round.isGroupStage ? `Group ${round.roomGroups?.[room - 1]} · ` : ""}Room {room}
        </div>
        <div className="room-meta">
          {assignments.length} {format?.unitLabelPlural.toLowerCase()} · top {round.isNoElim ? "all" : direct} advance directly
          {round.luckyCount ? " + lucky losers" : ""}
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Pos</th><th>{format?.unitLabel ?? "Player"}</th><th>Score{games > 1 ? ` (${games} games)` : ""}</th><th>Status</th></tr></thead>
          <tbody>
            {assignments.map((assignment, position) => {
              const rank = rankByName.get(assignment.name);
              const status = !rank ? "—" : unresolvedNames.has(assignment.name) ? "⚠ Tie" : round.isNoElim || rank <= direct ? "Advances" : luckyNames.includes(assignment.name) ? "★ Lucky Loser" : "Eliminated";
              const team = teamSize ? (state.players as TournamentTeam[]).find((entry) => entry.teamId === assignment.name) : null;
              return (
                <tr key={assignment.name} className={status === "Advances" ? "adv-row" : status.includes("Lucky") ? "lucky-row" : status === "Eliminated" ? "elim-row" : status.includes("Tie") ? "tie-row" : ""}>
                  <td><span className={`pos-num ${rank && rank <= direct ? "top" : ""}`}>{rank ?? "—"}</span></td>
                  <td><UnitName state={state} name={assignment.name} /></td>
                  <td>
                    {teamSize ? (
                      <div className="member-scores">
                        {Array.from({ length: teamSize }, (_, memberIndex) => {
                          const member = team?.members?.[memberIndex];
                          if (!member) return <span className="muted" key={memberIndex}>Vacant slot</span>;
                          return (
                            <div className="score-line" key={memberIndex}>
                              {Array.from({ length: games }, (_, gameIndex) => {
                                const key = `r${roundIndex}-rm${room}-p${position}${games > 1 ? `-g${gameIndex + 1}` : ""}-m${memberIndex}`;
                                return <ScoreInput key={key} scoreKey={key} value={state.scores[key]} roundIndex={roundIndex} room={room} />;
                              })}
                              <span>{member.name}</span>
                            </div>
                          );
                        })}
                        {games > 1 ? <strong>Total: {getUnitScore(state, roundIndex, room, position, 0)}</strong> : null}
                      </div>
                    ) : games > 1 ? (
                      <div className="score-multi">
                        {Array.from({ length: games }, (_, gameIndex) => {
                          const key = `r${roundIndex}-rm${room}-p${position}-g${gameIndex + 1}`;
                          return <ScoreInput key={key} scoreKey={key} value={state.scores[key]} roundIndex={roundIndex} room={room} />;
                        })}
                        <strong>{getUnitScore(state, roundIndex, room, position, 0)}</strong>
                      </div>
                    ) : (
                      <ScoreInput scoreKey={`r${roundIndex}-rm${room}-p${position}`} value={state.scores[`r${roundIndex}-rm${room}-p${position}`]} roundIndex={roundIndex} room={room} />
                    )}
                  </td>
                  <td><span className={`pill ${status === "Advances" ? "pill-adv" : status.includes("Lucky") ? "pill-lucky" : status === "Eliminated" ? "pill-elim" : status.includes("Tie") ? "pill-tie" : "pill-neut"}`}>{status}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!round.isNoElim && !round.isFinal ? <div className="adv-marker">▲ Top {direct} advance directly{round.luckyCount ? ` · ${round.luckyCount} lucky loser spot(s) across all rooms` : ""}</div> : null}
    </div>
  );
}

function FinalsScores({ state }: { state: TournamentState }) {
  const app = useTournamentApp();
  const [tab, setTab] = useState(1);
  const round = state.rounds[state.curRound];
  const assignments = state.assignments[state.curRound] ?? [];
  const teamSize = getGameFormat(state.gameFormat)?.teamSize ?? 0;
  const progress = finalsProgressState(state, state.curRound, round);
  const games = round.numGames ?? 1;
  const activeTab = Math.min(tab, games);
  return (
    <div className="card finals-card">
      {progress.race ? (
        <div className="race-status">
          <span>{unitDisplay(state, progress.race.wbName).label} (Winners&apos; bracket): <strong>{progress.race.wbWins} / {progress.race.wbTarget}</strong></span>
          <span>{unitDisplay(state, progress.race.lbName).label} (Losers&apos; bracket): <strong>{progress.race.lbWins} / {progress.race.lbTarget}</strong></span>
          {progress.race.decided ? <span>🏆 {unitDisplay(state, progress.race.winnerName as string).label} wins the Grand Final!</span> : null}
        </div>
      ) : null}
      <div className="game-tabs">
        {Array.from({ length: games }, (_, index) => <button key={index} className={activeTab === index + 1 && tab !== 0 ? "active" : ""} onClick={() => setTab(index + 1)}>Game {index + 1}</button>)}
        <button className={tab === 0 ? "active" : ""} onClick={() => setTab(0)}>📊 Total</button>
      </div>
      {tab === 0 ? (
        <div className="table-scroll"><table><thead><tr><th>Pos</th><th>{teamSize ? "Team" : "Player"}</th>{Array.from({ length: games }, (_, index) => <th key={index}>G{index + 1}</th>)}<th>Total</th></tr></thead><tbody>
          {[...progress.units].sort((a, b) => b.total - a.total).map((unit, index) => <tr key={unit.name} className={index === 0 ? "adv-row" : ""}><td>{index + 1}</td><td><UnitName state={state} name={unit.name} /></td>{unit.perGame.map((score, game) => <td key={game}>{score ?? "—"}</td>)}<td className="score-total">{unit.total}</td></tr>)}
        </tbody></table></div>
      ) : (
        <div className="table-scroll"><table><thead><tr><th>{teamSize ? "Team" : "Player"}</th><th>Score G{activeTab}</th></tr></thead><tbody>
          {assignments.map((assignment) => {
            const team = teamSize ? (state.players as TournamentTeam[]).find((entry) => entry.teamId === assignment.name) : null;
            return <tr key={assignment.name}><td><UnitName state={state} name={assignment.name} /></td><td>{teamSize ? <div className="member-scores">{Array.from({ length: teamSize }, (_, memberIndex) => {
              const member = team?.members?.[memberIndex];
              if (!member) return <span className="muted" key={memberIndex}>Vacant</span>;
              const key = `game${activeTab}-${assignment.name}-m${memberIndex}`;
              return <div className="score-line" key={key}><input type="number" min="0" className="score-inp" value={state.finalScores[key] ?? ""} onChange={(event) => app.updateState((current) => setFinalScore(current, key, event.target.value))} /><span>{member.name}</span></div>;
            })}</div> : (() => {
              const key = `game${activeTab}-${assignment.name}`;
              return <input type="number" min="0" className="score-inp" value={state.finalScores[key] ?? ""} onChange={(event) => app.updateState((current) => setFinalScore(current, key, event.target.value))} />;
            })()}</td></tr>;
          })}
        </tbody></table></div>
      )}
    </div>
  );
}

function handleReserveResult(result: ReserveAddResult, retry: () => ReserveAddResult, apply: (state: TournamentState) => void) {
  if (result.status === "added") return apply(result.state);
  if (result.status === "confirm-over-cap") {
    if (window.confirm(`All rooms are full. Adding this reserve will create an over-cap room. Proceed?`)) {
      const retried = retry();
      if (retried.status === "added") apply(retried.state);
    }
    return;
  }
  const messages = {
    closed: "Reserve window has closed — eliminations have begun.",
    "group-stage": "Reserves can't be added during Group Stage — group membership and the round-robin schedule are fixed once the tournament starts.",
    "strict-room": "Can't add this reserve — the selected strict odd-count strategy requires every room to remain even.",
    "room-cap": "Can't add this reserve — it would push a future round over the game's hard room cap.",
  };
  window.alert(messages[result.reason]);
}

function ReservePanel({ state }: { state: TournamentState }) {
  const app = useTournamentApp();
  const [walkup, setWalkup] = useState("");
  const format = getGameFormat(state.gameFormat);
  if (!state.reserves.length && !state.reserveOpen && format?.teamSize) return null;
  const keys = state.reserves.map((entry) => typeof entry === "string" ? entry : entry.teamId);
  const add = (key: string) => handleReserveResult(
    addReserveUnit(state, key),
    () => addReserveUnit(state, key, { allowOverCap: true }),
    app.updateState,
  );
  return (
    <div className="reserve-panel">
      <div className="reserve-title">Reserves</div>
      {!state.reserveOpen ? <div className="reserve-status error">⛔ Reserve window closed — eliminations have started.</div> : (
        <>
          {!format?.teamSize ? <div className="walkup-row"><input type="text" placeholder="Name of a new/walk-up player" value={walkup} onChange={(event) => setWalkup(event.target.value)} onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            handleReserveResult(addWalkUpIndividual(state, walkup), () => addWalkUpIndividual(state, walkup, { allowOverCap: true }), app.updateState);
            setWalkup("");
          }} /><button className="btn btn-sm btn-amber" onClick={() => {
            handleReserveResult(addWalkUpIndividual(state, walkup), () => addWalkUpIndividual(state, walkup, { allowOverCap: true }), app.updateState);
            setWalkup("");
          }}>＋ Add new player</button></div> : null}
          <div className="reserve-list">
            {keys.map((key) => <div className="reserve-chip" key={key}><UnitName state={state} name={key} /><button onClick={() => add(key)}>＋</button><button onClick={() => app.updateState((current) => removeReserveUnit(current, key))}>✕</button></div>)}
          </div>
          <div className="reserve-status">{keys.length ? "Click ＋ to add a reserve to the smallest available room." : `No ${format?.teamSize ? "reserve teams" : "reserves"} on the bench.`}</div>
        </>
      )}
    </div>
  );
}

function ManageRoster({ state }: { state: TournamentState }) {
  const app = useTournamentApp();
  const format = getGameFormat(state.gameFormat);
  if (!state.players.length) return null;
  if (!format?.teamSize) {
    return <div className="card"><div className="card-title">Manage Players <span className="hint">— rename, swap, or remove</span></div><div className="seed-grid">
      {[...(state.players as string[])].sort().map((name) => <div className="seed-card" key={name}><span className="seed-player">{name}</span><span className="manage-actions"><button className="btn btn-sm btn-secondary" title="Rename" onClick={() => {
        const value = window.prompt(`Rename "${name}" to:`, name);
        if (value !== null) app.updateState((current) => renameIndividual(current, name, value));
      }}>✎</button><button className="btn btn-sm btn-secondary" title="Swap" onClick={() => {
        const value = window.prompt(`Swap out "${name}". Enter the replacement's name:`);
        if (value !== null) app.updateState((current) => swapIndividual(current, name, value));
      }}>⇄</button><button className="btn btn-sm btn-secondary" title="Remove" onClick={() => {
        if (window.confirm(`Remove "${name}" from the tournament? This cannot be undone.`)) app.updateState((current) => removeRosterUnit(current, name));
      }}>✕</button></span></div>)}
    </div></div>;
  }
  const teams = state.players as TournamentTeam[];
  return <div className="card"><div className="card-title">Manage Teams <span className="hint">— rename/remove teams and manage members</span></div><div className="seed-grid team-grid">
    {[...teams].sort((a, b) => a.teamName.localeCompare(b.teamName)).map((team) => {
      const defender = getDefenderIndex(state, team.teamId, state.curRound);
      return <div className="seed-card team-card" key={team.teamId}><div className="team-heading"><strong>{team.teamName}</strong><span><button className="btn btn-sm btn-secondary" title="Rename team" onClick={() => {
        const value = window.prompt(`Rename team "${team.teamName}" to:`, team.teamName);
        if (value?.trim()) app.updateState((current) => updateTeam(current, team.teamId, (entry) => ({ ...entry, teamName: value.trim() })));
      }}>✎</button><button className="btn btn-sm btn-secondary" title="Swap team" onClick={() => {
        const reserves = state.reserves as TournamentTeam[];
        let replacement: TournamentTeam | undefined;
        if (reserves.length) {
          const menu = `Swap out "${team.teamName}".\n\n  0 — type a brand-new walk-up team\n${reserves.map((entry, index) => `  ${index + 1} — ${entry.teamName}`).join("\n")}\n\nEnter a number:`;
          const choice = window.prompt(menu);
          if (choice === null || !choice.trim()) return;
          const selected = Number.parseInt(choice, 10);
          if (String(selected) !== choice.trim() || selected < 0 || selected > reserves.length) {
            window.alert(`"${choice}" isn't one of the listed numbers.`);
            return;
          }
          if (selected > 0) replacement = reserves[selected - 1];
        }
        if (!replacement) {
          const placeholders = Array.from({ length: format.teamSize ?? 0 }, (_, index) => `Player${index + 1}`).join(", ");
          const line = window.prompt(`Enter the replacement team, same format as the roster:\n\nTeamName, ${placeholders}`, `Team name, ${placeholders}`);
          if (!line?.trim()) return;
          replacement = parseTeamLines({ value: line, idPrefix: "team", teamSize: format.teamSize ?? 0, ids: app.runtime.ids })[0];
          if (!replacement || replacement.members.every((member) => !member)) {
            window.alert(`"${replacement?.teamName ?? "Team"}" has no players listed — add at least one member.`);
            return;
          }
        }
        if (teams.some((entry) => entry.teamName === replacement?.teamName) && !window.confirm(`A team called "${replacement.teamName}" is already competing. Add it anyway?`)) return;
        app.updateState((current) => swapTeam(current, team.teamId, replacement as TournamentTeam));
      }}>⇄</button><button className="btn btn-sm btn-secondary" title="Remove team" onClick={() => {
        if (state.gamemodeConfig.oddCountStrategy === "none" && (state.assignments[state.curRound] ?? []).some((entry) => entry.name === team.teamId)) {
          const ideal = state.gamemodeConfig.roomSize?.ideal ?? 1;
          const remaining = (state.assignments[state.curRound] ?? []).length - 1;
          if (remaining % ideal !== 0) {
            window.alert(`Can't remove "${team.teamName}" — the strict odd-count strategy requires rooms of ${ideal} teams.`);
            return;
          }
        }
        if (window.confirm(`Remove team "${team.teamName}" from the tournament? This cannot be undone.`)) app.updateState((current) => removeRosterUnit(current, team.teamId));
      }}>✕</button></span></div>{Array.from({ length: format.teamSize ?? 0 }, (_, memberIndex) => {
        const member = team.members[memberIndex];
        if (!member) return <div className="team-member vacant-member" key={memberIndex}><span className="muted">Vacant slot</span>{state.reserveOpen ? <span>{state.reserveIndividuals.length ? <select aria-label={`Reserve for ${team.teamName} slot ${memberIndex + 1}`} defaultValue="" onChange={(event) => {
          const reserveIndex = Number.parseInt(event.target.value, 10);
          const reserve = state.reserveIndividuals[reserveIndex];
          if (reserve) app.updateState((current) => fillTeamSlot(current, team.teamId, memberIndex, reserve, reserveIndex));
        }}><option value="">— pick a reserve —</option>{state.reserveIndividuals.map((reserve, index) => <option key={`${reserve.name}-${index}`} value={index}>{reserve.name}</option>)}</select> : null}<button className="btn btn-sm btn-amber" onClick={() => {
          const value = window.prompt("Name of the new/walk-up player filling this slot:");
          if (value?.trim()) app.updateState((current) => fillTeamSlot(current, team.teamId, memberIndex, { name: value.trim() }));
        }}>＋ New</button></span> : null}</div>;
        return <div className="team-member" key={memberIndex}><span>{member.name}{state.gamemodeConfig.teamScoringRule === "designated-player" && defender === memberIndex ? " 🛡 Defender" : ""}</span><span>{state.gamemodeConfig.teamScoringRule === "designated-player" && defender !== memberIndex ? <button className="btn btn-sm btn-secondary" title="Make defender" onClick={() => app.updateState((current) => setTeamDefender(current, team.teamId, memberIndex))}>🛡</button> : null}<button className="btn btn-sm btn-secondary" title="Rename member" onClick={() => {
          const value = window.prompt(`Rename "${member.name}" to:`, member.name);
          if (value?.trim()) app.updateState((current) => updateTeam(current, team.teamId, (entry) => ({ ...entry, members: entry.members.map((item, index) => index === memberIndex && item ? { ...item, name: value.trim() } : item) })));
        }}>✎</button><button className="btn btn-sm btn-secondary" title="Remove member" onClick={() => {
          if (window.confirm(`Remove "${member.name}" from team "${team.teamName}"? This cannot be undone.`)) app.updateState((current) => updateTeam(current, team.teamId, (entry) => ({ ...entry, members: entry.members.map((item, index) => index === memberIndex ? null : item) })));
        }}>✕</button></span></div>;
      })}</div>;
    })}
  </div></div>;
}

function Standings({ state }: { state: TournamentState }) {
  const hasStandings = state.rounds.slice(0, state.curRound + 1).some((round) => round.isQual || round.isSwiss);
  const hasGroups = state.rounds.slice(0, state.curRound + 1).some((round) => round.isGroupStage);
  if (!hasStandings && !hasGroups) return null;
  const tables = hasGroups
    ? state.groups.map((group) => [group.label, state.groupStandings[group.label] ?? []] as const)
    : [[state.cfg.poolingPhase === "swiss" ? "Swiss Standings" : "Qualification Table", computeQualificationStandings(state)] as const];
  return <div className="standings-grid">{tables.map(([label, entries]) => <div className="card" key={label}><div className="card-title">{label}</div><div className="table-scroll"><table><thead><tr><th>Pos</th><th>Player / Team</th><th>Fair Points</th><th>Score</th><th>Played</th></tr></thead><tbody>{entries.map((entry, index) => <tr key={entry.name}><td>{index + 1}</td><td><UnitName state={state} name={entry.name} /></td><td>{entry.totalFP?.toFixed(5) ?? "—"}</td><td>{entry.totalScore}</td><td>{entry.played}</td></tr>)}</tbody></table></div></div>)}</div>;
}

export function RunningAdmin() {
  const app = useTournamentApp();
  const state = app.state;
  const round = state.rounds[state.curRound];
  const [message, setMessage] = useState("");
  const pendingTies = useMemo(() => Object.entries(getAllTies(state, state.curRound)).some(([key, tie]) => !isTieResolved(key, tie, state)), [state]);
  if (!round) return <div className="msg msg-err">The saved tournament has no current round.</div>;
  const assignments = state.assignments[state.curRound] ?? [];
  const last = state.curRound >= state.rounds.length - 1 || round.bracket === "grand-final";
  return (
    <div id="panel-running">
      <div className="card running-title-card"><div className="card-title">Tournament running</div><div className="field"><label htmlFor="running-title">Tournament name</label><input id="running-title" type="text" value={state.title} placeholder="Unnamed Tournament" onChange={(event) => app.updateState((current) => ({ ...current, title: event.target.value, needsSave: true }))} /></div></div>
      <TieBanners state={state} />
      {message ? <div className="msg msg-err">{message}</div> : null}
      <div className="stats"><div><span>Round</span><strong>{phaseLabel(state)}</strong></div><div><span>{getGameFormat(state.gameFormat)?.unitLabelPlural}</span><strong>{assignments.length}</strong></div><div><span>Rooms</span><strong>{round.rooms.length}</strong></div><div><span>Advancing</span><strong>{round.isNoElim ? "All" : round.isFinal ? "—" : `${round.advTotal}${round.luckyCount ? ` + ${round.luckyCount} LL` : ""}`}</strong></div></div>
      <div className="card"><div className="card-title">Tournament progress</div><div className="timeline">{state.rounds.map((entry, index) => <div className="tl-item" key={index}><div className={`tl-dot ${index < state.curRound ? "done" : index === state.curRound ? "current" : ""}`}>{index < state.curRound ? "✓" : entry.isFinal ? "🏆" : entry.isSemis ? "S" : entry.roundNum}</div><div className="tl-label">{entry.isFinal ? "Final" : entry.isSemis ? "Semis" : `R${entry.roundNum}`}</div></div>)}</div></div>
      <ReservePanel state={state} />
      <ManageRoster state={state} />
      <Standings state={state} />
      {state.curRound > 0 && assignments.length && !round.isQual && !round.isSwiss && !round.isGroupStage ? <div className="seed-panel"><div className="seed-title">Room Assignments — {phaseLabel(state)}</div><div className="seed-grid">{[...assignments].sort((a, b) => (a.room ?? 0) - (b.room ?? 0)).map((entry) => <div className={`seed-card ${entry.room === null ? "seed-lucky" : ""}`} key={entry.name}><UnitName state={state} name={entry.name} /><span className="seed-room">{entry.room === null ? "BYE" : `Room ${entry.room}`}</span></div>)}</div></div> : null}
      {round.isFinal ? <FinalsScores state={state} /> : <>{Array.from({ length: round.rooms.length }, (_, index) => <RoomScores key={index} state={state} room={index + 1} />)}{(state.byes[state.curRound] ?? []).map((name) => <div className="bye-card" key={name}><strong>BYE</strong><UnitName state={state} name={name} /><span>Advances automatically — no room this round</span></div>)}</>}
      <div className="btn-row admin-actions">
        {!last ? <button className="btn btn-success" disabled={pendingTies} title={pendingTies ? "Resolve tie-breaks first" : undefined} onClick={() => {
          const result = advanceTournamentRound(state);
          if (result.status === "advanced") { setMessage(""); app.updateState(result.state); }
          else if (result.status === "blocked") setMessage(result.message);
        }}>Next Round →</button> : null}
        {state.curRound > 0 ? <button className="btn btn-secondary" onClick={() => app.updateState((current) => ({ ...current, curRound: current.curRound - 1 }))}>← Previous</button> : null}
        <button className="btn btn-purple" onClick={() => setMessage("Archive saving is available in the Archive migration slice.")}>💾 Save to Archive</button>
        <button className="btn btn-secondary" onClick={() => {
          if (window.confirm("Reset the full tournament? All scores will be lost.")) app.updateState(resetTournamentState(state));
        }}>↺ Reset</button>
      </div>
    </div>
  );
}
