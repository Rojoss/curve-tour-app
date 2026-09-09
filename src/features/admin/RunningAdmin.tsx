import { useEffect, useMemo, useState } from "react";
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
import {
  findLatestArchiveEntryForTournament,
  loadArchiveIndex,
  saveBracketFollow,
  writeArchiveSnapshot,
  type ArchiveSummary,
} from "../../lib/persistence";
import { ByeCard, Position, TournamentUnit } from "../../components/tournament/TournamentUnit";
import {
  Alert,
  Badge,
  Button,
  ButtonRow,
  Field,
  Input,
  Modal,
  ModalActions,
  Panel,
  PanelTitle,
  ScoreInput as ScoreField,
  Select,
  StatStrip,
  Table,
  TableCell,
  TableHeadCell,
  TableRow,
  TableScroll,
  Timeline,
  TimelineItem,
  cn,
} from "../../components/ui";

type AdminPrompt =
  | { kind: "save"; sameTournament?: ArchiveSummary; titleCollision?: ArchiveSummary }
  | { kind: "reset" };

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
  return <TournamentUnit state={state} name={name} />;
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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-danger bg-danger-soft px-4.5 py-3.5" key={key}>
          <div>
            <div className="font-semibold text-danger">{heading}</div>
            <div className="mt-1 text-xs text-muted">
              {resolved.length ? `Ranked so far: ${resolved.map((name) => unitDisplay(state, name).label).join(" > ")} — ` : ""}
              tied: {tie.players.map((player) => unitDisplay(state, player.name).label).join(", ")} — pick who ranks next
            </div>
          </div>
          <ButtonRow className="mt-0">
            {remaining.map((player) => (
              <Button
                size="sm"
                variant="warning"
                key={player.name}
                onClick={() => app.updateState((current) => resolveTournamentTie(current, key, player.name))}
              >
                {unitDisplay(state, player.name).label} ranks next
              </Button>
            ))}
          </ButtonRow>
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
    <ScoreField
      className="w-16 text-sm"
      min="0"
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
    <div className="mb-5">
      <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-t-lg border border-b-0 border-surface-hover bg-surface-low px-4 py-2.5">
        <div className="text-xl font-bold tracking-[0.05em] text-primary">
          {round.isGroupStage ? `Group ${round.roomGroups?.[room - 1]} · ` : ""}Room {room}
        </div>
        <div className="mt-1 text-xs text-muted">
          {assignments.length} {format?.unitLabelPlural.toLowerCase()} · top {round.isNoElim ? "all" : direct} advance directly
          {round.luckyCount ? " + lucky losers" : ""}
        </div>
      </div>
      <TableScroll>
        <Table>
          <thead><TableRow><TableHeadCell>Pos</TableHeadCell><TableHeadCell>{format?.unitLabel ?? "Player"}</TableHeadCell><TableHeadCell>Score{games > 1 ? ` (${games} games)` : ""}</TableHeadCell><TableHeadCell>Status</TableHeadCell></TableRow></thead>
          <tbody>
            {assignments.map((assignment, position) => {
              const rank = rankByName.get(assignment.name);
              const status = !rank ? "—" : unresolvedNames.has(assignment.name) ? "⚠ Tie" : round.isNoElim || rank <= direct ? "Advances" : luckyNames.includes(assignment.name) ? "★ Lucky Loser" : "Eliminated";
              const team = teamSize ? (state.players as TournamentTeam[]).find((entry) => entry.teamId === assignment.name) : null;
              return (
                <TableRow key={assignment.name} tone={status === "Advances" ? "advance" : status.includes("Lucky") ? "lucky" : status === "Eliminated" ? "eliminate" : status.includes("Tie") ? "tie" : "default"}>
                  <TableCell><Position highlighted={Boolean(rank && rank <= direct)}>{rank ?? "—"}</Position></TableCell>
                  <TableCell><UnitName state={state} name={assignment.name} /></TableCell>
                  <TableCell>
                    {teamSize ? (
                      <div className="grid gap-1.5">
                        {Array.from({ length: teamSize }, (_, memberIndex) => {
                          const member = team?.members?.[memberIndex];
                          if (!member) return <span className="text-muted" key={memberIndex}>Vacant slot</span>;
                          return (
                            <div className="flex flex-wrap items-center gap-1.5" key={memberIndex}>
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
                      <div className="flex flex-wrap items-center gap-1.5">
                        {Array.from({ length: games }, (_, gameIndex) => {
                          const key = `r${roundIndex}-rm${room}-p${position}-g${gameIndex + 1}`;
                          return <ScoreInput key={key} scoreKey={key} value={state.scores[key]} roundIndex={roundIndex} room={room} />;
                        })}
                        <strong>{getUnitScore(state, roundIndex, room, position, 0)}</strong>
                      </div>
                    ) : (
                      <ScoreInput scoreKey={`r${roundIndex}-rm${room}-p${position}`} value={state.scores[`r${roundIndex}-rm${room}-p${position}`]} roundIndex={roundIndex} room={room} />
                    )}
                  </TableCell>
                  <TableCell><Badge tone={status === "Advances" ? "success" : status.includes("Lucky") ? "accent" : status === "Eliminated" || status.includes("Tie") ? "danger" : "neutral"}>{status}</Badge></TableCell>
                </TableRow>
              );
            })}
          </tbody>
        </Table>
      </TableScroll>
      {!round.isNoElim && !round.isFinal ? <div className="rounded-b-[5px] border border-t-0 border-surface-hover bg-success-soft p-1.5 text-center text-[0.68rem] italic">▲ Top {direct} advance directly{round.luckyCount ? ` · ${round.luckyCount} lucky loser spot(s) across all rooms` : ""}</div> : null}
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
    <Panel>
      {progress.race ? (
        <div className="mb-3 flex flex-wrap gap-3.5">
          <span>{unitDisplay(state, progress.race.wbName).label} (Winners&apos; bracket): <strong>{progress.race.wbWins} / {progress.race.wbTarget}</strong></span>
          <span>{unitDisplay(state, progress.race.lbName).label} (Losers&apos; bracket): <strong>{progress.race.lbWins} / {progress.race.lbTarget}</strong></span>
          {progress.race.decided ? <span>🏆 {unitDisplay(state, progress.race.winnerName as string).label} wins the Grand Final!</span> : null}
        </div>
      ) : null}
      <div className="mb-3.5 flex flex-wrap gap-1.5">
        {Array.from({ length: games }, (_, index) => <Button key={index} className={cn(activeTab === index + 1 && tab !== 0 && "border-primary bg-primary-soft text-primary")} size="sm" onClick={() => setTab(index + 1)}>Game {index + 1}</Button>)}
        <Button className={cn(tab === 0 && "border-primary bg-primary-soft text-primary")} size="sm" onClick={() => setTab(0)}>📊 Total</Button>
      </div>
      {tab === 0 ? (
        <TableScroll><Table><thead><TableRow><TableHeadCell>Pos</TableHeadCell><TableHeadCell>{teamSize ? "Team" : "Player"}</TableHeadCell>{Array.from({ length: games }, (_, index) => <TableHeadCell key={index}>G{index + 1}</TableHeadCell>)}<TableHeadCell>Total</TableHeadCell></TableRow></thead><tbody>
          {[...progress.units].sort((a, b) => b.total - a.total).map((unit, index) => <TableRow key={unit.name} tone={index === 0 ? "advance" : "default"}><TableCell>{index + 1}</TableCell><TableCell><UnitName state={state} name={unit.name} /></TableCell>{unit.perGame.map((score, game) => <TableCell key={game}>{score ?? "—"}</TableCell>)}<TableCell className="text-base font-bold text-primary">{unit.total}</TableCell></TableRow>)}
        </tbody></Table></TableScroll>
      ) : (
        <TableScroll><Table><thead><TableRow><TableHeadCell>{teamSize ? "Team" : "Player"}</TableHeadCell><TableHeadCell>Score G{activeTab}</TableHeadCell></TableRow></thead><tbody>
          {assignments.map((assignment) => {
            const team = teamSize ? (state.players as TournamentTeam[]).find((entry) => entry.teamId === assignment.name) : null;
            return <TableRow key={assignment.name}><TableCell><UnitName state={state} name={assignment.name} /></TableCell><TableCell>{teamSize ? <div className="grid gap-1.5">{Array.from({ length: teamSize }, (_, memberIndex) => {
              const member = team?.members?.[memberIndex];
              if (!member) return <span className="text-muted" key={memberIndex}>Vacant</span>;
              const key = `game${activeTab}-${assignment.name}-m${memberIndex}`;
              return <div className="flex flex-wrap items-center gap-1.5" key={key}><ScoreField min="0" value={state.finalScores[key] ?? ""} onChange={(event) => app.updateState((current) => setFinalScore(current, key, event.target.value))} /><span>{member.name}</span></div>;
            })}</div> : (() => {
              const key = `game${activeTab}-${assignment.name}`;
              return <ScoreField min="0" value={state.finalScores[key] ?? ""} onChange={(event) => app.updateState((current) => setFinalScore(current, key, event.target.value))} />;
            })()}</TableCell></TableRow>;
          })}
        </tbody></Table></TableScroll>
      )}
    </Panel>
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
    <div className="mb-4.5 rounded-lg border border-dashed border-warning bg-surface px-4.5 py-3.5">
      <div className="mb-2.5 text-[0.72rem] font-semibold tracking-[0.12em] text-warning uppercase">Reserves</div>
      {!state.reserveOpen ? <div className="mt-1 text-xs text-danger">⛔ Reserve window closed — eliminations have started.</div> : (
        <>
          {!format?.teamSize ? <div className="flex items-center gap-2"><Input className="max-w-75" type="text" placeholder="Name of a new/walk-up player" value={walkup} onChange={(event) => setWalkup(event.target.value)} onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            handleReserveResult(addWalkUpIndividual(state, walkup), () => addWalkUpIndividual(state, walkup, { allowOverCap: true }), app.updateState);
            setWalkup("");
          }} /><Button size="sm" variant="warning" onClick={() => {
            handleReserveResult(addWalkUpIndividual(state, walkup), () => addWalkUpIndividual(state, walkup, { allowOverCap: true }), app.updateState);
            setWalkup("");
          }}>＋ Add new player</Button></div> : null}
          <div className="my-2.5 flex flex-wrap gap-2">
            {keys.map((key) => <div className="flex items-center gap-2 rounded-full border border-surface-hover bg-surface-low px-3 py-1 text-xs" key={key}><UnitName state={state} name={key} /><Button aria-label={`Add ${key}`} className="size-6 min-h-0 p-0 text-warning" onClick={() => add(key)} size="sm" variant="ghost">＋</Button><Button aria-label={`Remove ${key}`} className="size-6 min-h-0 p-0 text-warning" onClick={() => app.updateState((current) => removeReserveUnit(current, key))} size="sm" variant="ghost">✕</Button></div>)}
          </div>
          <div className="mt-1 text-xs text-muted">{keys.length ? "Click ＋ to add a reserve to the smallest available room." : `No ${format?.teamSize ? "reserve teams" : "reserves"} on the bench.`}</div>
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
    return <Panel><PanelTitle hint="— rename, swap, or remove">Manage Players</PanelTitle><div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
      {[...(state.players as string[])].sort().map((name) => <div className="flex min-w-0 items-center justify-between gap-2 rounded-[5px] border border-surface-hover bg-surface-low px-3 py-2" key={name}><span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span><span className="flex gap-1"><Button size="sm" title="Rename" onClick={() => {
        const value = window.prompt(`Rename "${name}" to:`, name);
        if (value !== null) app.updateState((current) => renameIndividual(current, name, value));
      }}>✎</Button><Button size="sm" title="Swap" onClick={() => {
        const value = window.prompt(`Swap out "${name}". Enter the replacement's name:`);
        if (value !== null) app.updateState((current) => swapIndividual(current, name, value));
      }}>⇄</Button><Button size="sm" title="Remove" onClick={() => {
        if (window.confirm(`Remove "${name}" from the tournament? This cannot be undone.`)) app.updateState((current) => removeRosterUnit(current, name));
      }}>✕</Button></span></div>)}
    </div></Panel>;
  }
  const teams = state.players as TournamentTeam[];
  return <Panel><PanelTitle hint="— rename/remove teams and manage members">Manage Teams</PanelTitle><div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
    {[...teams].sort((a, b) => a.teamName.localeCompare(b.teamName)).map((team) => {
      const defender = getDefenderIndex(state, team.teamId, state.curRound);
      return <div className="flex min-w-0 flex-col items-stretch gap-2 rounded-[5px] border border-surface-hover bg-surface-low px-3 py-2" key={team.teamId}><div className="flex items-center justify-between gap-2"><strong>{team.teamName}</strong><span className="flex gap-1"><Button size="sm" title="Rename team" onClick={() => {
        const value = window.prompt(`Rename team "${team.teamName}" to:`, team.teamName);
        if (value?.trim()) app.updateState((current) => updateTeam(current, team.teamId, (entry) => ({ ...entry, teamName: value.trim() })));
      }}>✎</Button><Button size="sm" title="Swap team" onClick={() => {
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
      }}>⇄</Button><Button size="sm" title="Remove team" onClick={() => {
        if (state.gamemodeConfig.oddCountStrategy === "none" && (state.assignments[state.curRound] ?? []).some((entry) => entry.name === team.teamId)) {
          const ideal = state.gamemodeConfig.roomSize?.ideal ?? 1;
          const remaining = (state.assignments[state.curRound] ?? []).length - 1;
          if (remaining % ideal !== 0) {
            window.alert(`Can't remove "${team.teamName}" — the strict odd-count strategy requires rooms of ${ideal} teams.`);
            return;
          }
        }
        if (window.confirm(`Remove team "${team.teamName}" from the tournament? This cannot be undone.`)) app.updateState((current) => removeRosterUnit(current, team.teamId));
      }}>✕</Button></span></div>{Array.from({ length: format.teamSize ?? 0 }, (_, memberIndex) => {
        const member = team.members[memberIndex];
        if (!member) return <div className="flex items-center justify-between gap-2 border-t border-surface-hover pt-1.5 text-xs" key={memberIndex}><span className="text-muted">Vacant slot</span>{state.reserveOpen ? <span className="flex gap-1">{state.reserveIndividuals.length ? <Select className="py-1 text-xs" aria-label={`Reserve for ${team.teamName} slot ${memberIndex + 1}`} defaultValue="" onChange={(event) => {
          const reserveIndex = Number.parseInt(event.target.value, 10);
          const reserve = state.reserveIndividuals[reserveIndex];
          if (reserve) app.updateState((current) => fillTeamSlot(current, team.teamId, memberIndex, reserve, reserveIndex));
        }}><option value="">— pick a reserve —</option>{state.reserveIndividuals.map((reserve, index) => <option key={`${reserve.name}-${index}`} value={index}>{reserve.name}</option>)}</Select> : null}<Button size="sm" variant="warning" onClick={() => {
          const value = window.prompt("Name of the new/walk-up player filling this slot:");
          if (value?.trim()) app.updateState((current) => fillTeamSlot(current, team.teamId, memberIndex, { name: value.trim() }));
        }}>＋ New</Button></span> : null}</div>;
        return <div className="flex items-center justify-between gap-2 border-t border-surface-hover pt-1.5 text-xs" key={memberIndex}><span>{member.name}{state.gamemodeConfig.teamScoringRule === "designated-player" && defender === memberIndex ? " 🛡 Defender" : ""}</span><span className="flex gap-1">{state.gamemodeConfig.teamScoringRule === "designated-player" && defender !== memberIndex ? <Button size="sm" title="Make defender" onClick={() => app.updateState((current) => setTeamDefender(current, team.teamId, memberIndex))}>🛡</Button> : null}<Button size="sm" title="Rename member" onClick={() => {
          const value = window.prompt(`Rename "${member.name}" to:`, member.name);
          if (value?.trim()) app.updateState((current) => updateTeam(current, team.teamId, (entry) => ({ ...entry, members: entry.members.map((item, index) => index === memberIndex && item ? { ...item, name: value.trim() } : item) })));
        }}>✎</Button><Button size="sm" title="Remove member" onClick={() => {
          if (window.confirm(`Remove "${member.name}" from team "${team.teamName}"? This cannot be undone.`)) app.updateState((current) => updateTeam(current, team.teamId, (entry) => ({ ...entry, members: entry.members.map((item, index) => index === memberIndex ? null : item) })));
        }}>✕</Button></span></div>;
      })}</div>;
    })}
  </div></Panel>;
}

function Standings({ state }: { state: TournamentState }) {
  const hasStandings = state.rounds.slice(0, state.curRound + 1).some((round) => round.isQual || round.isSwiss);
  const hasGroups = state.rounds.slice(0, state.curRound + 1).some((round) => round.isGroupStage);
  if (!hasStandings && !hasGroups) return null;
  const tables = hasGroups
    ? state.groups.map((group) => [group.label, state.groupStandings[group.label] ?? []] as const)
    : [[state.cfg.poolingPhase === "swiss" ? "Swiss Standings" : "Qualification Table", computeQualificationStandings(state)] as const];
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(310px,1fr))] gap-3.5">{tables.map(([label, entries]) => <Panel key={label}><PanelTitle>{label}</PanelTitle><TableScroll><Table><thead><TableRow><TableHeadCell>Pos</TableHeadCell><TableHeadCell>Player / Team</TableHeadCell><TableHeadCell>Fair Points</TableHeadCell><TableHeadCell>Score</TableHeadCell><TableHeadCell>Played</TableHeadCell></TableRow></thead><tbody>{entries.map((entry, index) => <TableRow key={entry.name}><TableCell>{index + 1}</TableCell><TableCell><UnitName state={state} name={entry.name} /></TableCell><TableCell>{entry.totalFP?.toFixed(5) ?? "—"}</TableCell><TableCell>{entry.totalScore}</TableCell><TableCell>{entry.played}</TableCell></TableRow>)}</tbody></Table></TableScroll></Panel>)}</div>;
}

function LiveSyncCard() {
  const app = useTournamentApp();
  const [copied, setCopied] = useState(false);
  if (!app.state.tournamentId) return null;
  const url = `${window.location.origin}${window.location.pathname}?t=${encodeURIComponent(app.state.tournamentId)}`;
  const status = app.syncStatus.kind === "unavailable"
    ? <span className="text-danger">⚪ Live sync unavailable (couldn&apos;t reach the sync service) — viewers need to refresh manually, same as before.</span>
    : app.syncStatus.kind === "error"
      ? <span className="text-danger">🔴 Sync error — viewers may be seeing stale data ({app.syncStatus.message})</span>
      : app.syncStatus.kind === "active"
        ? <span className="text-success">🟢 Live sync active</span>
        : <span className="text-muted">🔄 Connecting…</span>;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }
  return <Panel id="sync-status-panel">
    <PanelTitle>Live Sync — viewer link</PanelTitle>
    <Field className="mb-2" label="Viewer link"><Input type="text" readOnly value={url} onClick={(event) => event.currentTarget.select()} /></Field>
    <ButtonRow className="items-center gap-2.5"><Button onClick={() => void copy()}>📋 Copy Live Link</Button>{copied ? <span className="text-xs text-success">Copied!</span> : null}</ButtonRow>
    <div className="mt-2 text-xs">{status}</div>
  </Panel>;
}

export function RunningAdmin() {
  const app = useTournamentApp();
  const state = app.state;
  const round = state.rounds[state.curRound];
  const [message, setMessage] = useState("");
  const [archiveStatus, setArchiveStatus] = useState("");
  const [prompt, setPrompt] = useState<AdminPrompt | null>(null);
  useEffect(() => {
    const showStatus = (event: Event) => setArchiveStatus((event as CustomEvent<string>).detail);
    window.addEventListener("curve-tour:archive-status", showStatus);
    return () => window.removeEventListener("curve-tour:archive-status", showStatus);
  }, []);
  const pendingTies = useMemo(() => Object.entries(getAllTies(state, state.curRound)).some(([key, tie]) => !isTieResolved(key, tie, state)), [state]);
  if (!round) return <Alert tone="danger">The saved tournament has no current round.</Alert>;
  const assignments = state.assignments[state.curRound] ?? [];
  const last = state.curRound >= state.rounds.length - 1 || round.bracket === "grand-final";

  function mintArchiveId(index = loadArchiveIndex(window.localStorage)) {
    let id = String(app.runtime.clock.now());
    while (index.some((entry) => String(entry.id) === id) || window.localStorage.getItem(`curveFFA_archive_${id}`) !== null) {
      id = String(Number(id) + 1);
    }
    return id;
  }

  function saveArchive(id: string, keepAnnotations: boolean, status = "Tournament saved to archive.") {
    writeArchiveSnapshot({
      storage: window.localStorage,
      state,
      id,
      dateSaved: new Date(app.runtime.clock.now()).toISOString(),
      keepAnnotations,
    });
    app.updateState((current) => ({ ...current, needsSave: false }));
    setArchiveStatus(status);
    setPrompt(null);
  }

  function saveSilently() {
    const index = loadArchiveIndex(window.localStorage);
    const existing = findLatestArchiveEntryForTournament(index, state.tournamentId);
    saveArchive(existing?.id ?? mintArchiveId(index), Boolean(existing));
  }

  function requestArchiveSave() {
    const index = loadArchiveIndex(window.localStorage);
    const title = state.title.trim() || "Unnamed Tournament";
    const sameTournament = findLatestArchiveEntryForTournament(index, state.tournamentId);
    if (sameTournament) {
      setPrompt({ kind: "save", sameTournament });
      return;
    }
    const titleCollision = index.find((entry) => entry.title === title);
    if (titleCollision) {
      setPrompt({ kind: "save", titleCollision });
      return;
    }
    saveArchive(mintArchiveId(index), false);
  }

  function resetNow() {
    saveBracketFollow(window.localStorage, null);
    app.updateState(resetTournamentState(state));
    setPrompt(null);
  }
  return (
    <div id="panel-running">
      <Panel className="pb-1.5"><PanelTitle>Tournament running</PanelTitle><Field htmlFor="running-title" label="Tournament name"><Input id="running-title" type="text" value={state.title} placeholder="Unnamed Tournament" onChange={(event) => app.updateState((current) => ({ ...current, title: event.target.value, needsSave: true }))} /></Field></Panel>
      <TieBanners state={state} />
      {message ? <Alert tone="danger">{message}</Alert> : null}
      {archiveStatus ? <Alert tone="success" id="archive-save-status">{archiveStatus}</Alert> : null}
      <LiveSyncCard />
      <StatStrip items={[
        { label: "Round", value: phaseLabel(state) },
        { label: getGameFormat(state.gameFormat)?.unitLabelPlural, value: assignments.length },
        { label: "Rooms", value: round.rooms.length },
        { label: "Advancing", value: round.isNoElim ? "All" : round.isFinal ? "—" : `${round.advTotal}${round.luckyCount ? ` + ${round.luckyCount} LL` : ""}` },
      ]} />
      <Panel><PanelTitle>Tournament progress</PanelTitle><Timeline>{state.rounds.map((entry, index) => <TimelineItem key={index} label={entry.isFinal ? "Final" : entry.isSemis ? "Semis" : `R${entry.roundNum}`} state={index < state.curRound ? "done" : index === state.curRound ? "current" : "upcoming"}>{index < state.curRound ? "✓" : entry.isFinal ? "🏆" : entry.isSemis ? "S" : entry.roundNum}</TimelineItem>)}</Timeline></Panel>
      <ReservePanel state={state} />
      <ManageRoster state={state} />
      <Standings state={state} />
      {state.curRound > 0 && assignments.length && !round.isQual && !round.isSwiss && !round.isGroupStage ? <div className="mb-4.5 rounded-lg border border-surface-hover bg-surface-low px-4 py-3.5"><div className="mb-2.5 text-[0.72rem] font-semibold tracking-[0.12em] text-warning uppercase">Room Assignments — {phaseLabel(state)}</div><div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">{[...assignments].sort((a, b) => (a.room ?? 0) - (b.room ?? 0)).map((entry) => <div className={cn("flex min-w-0 items-center justify-between gap-2 rounded-[5px] border border-surface-hover bg-surface px-3 py-2", entry.room === null && "border-accent")} key={entry.name}><UnitName state={state} name={entry.name} /><span className="shrink-0 rounded-sm bg-primary-soft px-2.5 py-0.5 text-sm font-bold text-primary">{entry.room === null ? "BYE" : `Room ${entry.room}`}</span></div>)}</div></div> : null}
      {round.isFinal ? <FinalsScores state={state} /> : <>{Array.from({ length: round.rooms.length }, (_, index) => <RoomScores key={index} state={state} room={index + 1} />)}{(state.byes[state.curRound] ?? []).map((name) => <ByeCard key={name}><strong>BYE</strong><UnitName state={state} name={name} /><span className="ml-auto text-xs text-muted">Advances automatically — no room this round</span></ByeCard>)}</>}
      <ButtonRow className="sticky bottom-2.5 z-20 rounded-lg border border-surface-hover bg-background/90 p-2.5 backdrop-blur-md">
        {!last ? <Button variant="success" disabled={pendingTies} title={pendingTies ? "Resolve tie-breaks first" : undefined} onClick={() => {
          const result = advanceTournamentRound(state);
          if (result.status === "advanced") { setMessage(""); app.updateState(result.state); }
          else if (result.status === "blocked") setMessage(result.message);
        }}>Next Round →</Button> : null}
        {state.curRound > 0 ? <Button onClick={() => app.updateState((current) => ({ ...current, curRound: current.curRound - 1 }))}>← Previous</Button> : null}
        <Button variant="accent" onClick={requestArchiveSave}>💾 Save to Archive</Button>
        <Button onClick={() => {
          if (state.needsSave) setPrompt({ kind: "reset" });
          else if (window.confirm("Reset the full tournament? All scores will be lost.")) resetNow();
        }}>↺ Reset</Button>
      </ButtonRow>
      {prompt?.kind === "save" ? <Modal titleId="archive-save-title" title={prompt.sameTournament ? "Tournament already archived" : "Title already used"}>
        <p>{prompt.sameTournament
          ? `A tournament named "${state.title.trim() || "Unnamed Tournament"}" already exists. Overwrite, save as a new entry, or cancel?`
          : `A different archived tournament is also named "${state.title.trim() || "Unnamed Tournament"}". Save this as a new entry, or cancel to rename it first?`}</p>
        <ModalActions>
          {prompt.sameTournament ? <Button variant="danger" onClick={() => saveArchive(prompt.sameTournament!.id, true)}>Overwrite existing</Button> : null}
          <Button onClick={() => saveArchive(mintArchiveId(), false)}>Save as new entry</Button>
          <Button onClick={() => setPrompt(null)}>Cancel</Button>
        </ModalActions>
      </Modal> : null}
      {prompt?.kind === "reset" ? <Modal titleId="reset-title" title="Unsaved tournament">
        <p>This tournament has changes that are not in the archive. Save a snapshot before resetting, discard the changes, or cancel?</p>
        <ModalActions>
          <Button variant="success" onClick={() => { saveSilently(); resetNow(); }}>Save &amp; reset</Button>
          <Button variant="danger" onClick={resetNow}>Reset without saving</Button>
          <Button onClick={() => setPrompt(null)}>Cancel</Button>
        </ModalActions>
      </Modal> : null}
    </div>
  );
}
