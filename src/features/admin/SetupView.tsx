import { useMemo, useState } from "react";
import {
  GAME_FORMATS,
  ODD_COUNT_STRATEGY_LABELS,
  TEAM_SCORING_RULE_LABELS,
  generateTournament,
  getGameFormat,
  parseIndividualLines,
  parseMemberLine,
  parseTeamLines,
  type PersistedSetup,
} from "../../domain/tournament";
import { useTournamentApp } from "../tournament/TournamentProvider";

type SetupKey = keyof PersistedSetup;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="field"><label>{label}</label>{children}</div>;
}

export function SetupView() {
  const { state, setup, runtime, updateSetup, updateState } = useTournamentApp();
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [lbQualifiers, setLbQualifiers] = useState("2");
  const format = getGameFormat(setup.gameFormat);
  const teamSize = format?.teamSize;
  const raceCompatible =
    format?.idealRoomSize === 2 && setup.oddCountStrategy !== "flex";
  const scheduleOptions = useMemo(
    () => raceCompatible
      ? [{ value: "double-elimination", label: "Double elimination" }]
      : [{ value: "double-elimination-shared-final", label: "Double elimination — FFA/Team" }],
    [raceCompatible],
  );

  function change(key: SetupKey, value: string) {
    updateSetup((current) => ({ ...current, [key]: value } as PersistedSetup));
  }

  function changeFormat(value: string) {
    const nextFormat = getGameFormat(value as PersistedSetup["gameFormat"]);
    const defaultOdd = nextFormat?.supportedOddCountStrategies?.[0] ?? "";
    const compatible = nextFormat?.idealRoomSize === 2 && defaultOdd !== "flex";
    updateSetup((current) => ({
      ...current,
      gameFormat: value as PersistedSetup["gameFormat"],
      oddCountStrategy: defaultOdd,
      teamScoringRule: nextFormat?.teamSize ? "sum-members" : "",
      scheduleLogic:
        current.scheduleLogic === "double-elimination" && !compatible
          ? "single-elimination"
          : current.scheduleLogic === "double-elimination-shared-final" && compatible
            ? "single-elimination"
            : current.scheduleLogic,
    }));
  }

  function loadRoster() {
    if (!format) return;
    if (teamSize) {
      const players = parseTeamLines({
        value: setup.roster.trim(), idPrefix: "team", teamSize, ids: runtime.ids,
      });
      const reserves = parseTeamLines({
        value: setup.reserves.trim(), idPrefix: "reserveteam", teamSize, ids: runtime.ids,
      });
      const empty = [...players, ...reserves].filter((team) =>
        team.members.every((member) => !member),
      );
      if (empty.length) {
        const message = `These team(s) have no players listed at all — add at least one "TeamName, Player1, ..." member, or remove the line:\n\n${empty.map((team) => team.teamName).join("\n")}`;
        window.alert(message);
        return;
      }
      const reserveIndividuals = parseIndividualLines(setup.reserveIndividuals)
        .map(parseMemberLine);
      updateState({
        ...state,
        players,
        reserves,
        reserveIndividuals,
        confirmedCount: players.length,
      });
      setStatus(`${players.length} confirmed, ${reserves.length} reserves, ${reserveIndividuals.length} individual reserves`);
    } else {
      const players = parseIndividualLines(setup.roster.trim());
      const reserves = parseIndividualLines(setup.reserves.trim());
      updateState({
        ...state,
        players,
        reserves,
        reserveIndividuals: [],
        confirmedCount: players.length,
      });
      setStatus(`${players.length} confirmed, ${reserves.length} reserves`);
    }
    setError("");
  }

  function generate() {
    const result = generateTournament(
      state,
      { ...setup, lbQualifiers },
      runtime,
    );
    if (result.status === "invalid") {
      setError(result.message);
      return;
    }
    setError("");
    updateState(result.state);
  }

  const isGroup = setup.poolingPhase === "group-stage";
  const isSingle = setup.scheduleLogic === "single-elimination";
  const isRace = setup.scheduleLogic === "double-elimination";
  const isShared = setup.scheduleLogic === "double-elimination-shared-final";
  return (
    <div id="panel-setup">
      <div className="card">
        <div className="card-title">Tournament Name</div>
        <Field label="Tournament name">
          <input
            id="cfg-title"
            type="text"
            placeholder="Unnamed Tournament — click to name"
            value={state.title}
            onChange={(event) => updateState({ ...state, title: event.target.value, needsSave: true })}
          />
        </Field>
      </div>
      <div className="g2">
        <div className="card">
          <div className="card-title">Tournament Settings</div>
          <Field label="Game format">
            <select id="cfg-game-format" value={setup.gameFormat} onChange={(e) => changeFormat(e.target.value)}>
              {Object.values(GAME_FORMATS).map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
              <option value="last-man-standing" disabled>Last Man Standing (coming soon)</option>
            </select>
          </Field>
          <Field label="Schedule logic">
            <select id="cfg-schedule-logic" value={setup.scheduleLogic} onChange={(e) => change("scheduleLogic", e.target.value)}>
              <option value="single-elimination">Single elimination</option>
              {scheduleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              <option value="kings-valley" disabled>Kings Valley (coming soon)</option>
            </select>
          </Field>
          {teamSize ? <Field label="Team scoring">
            <select id="cfg-team-scoring-rule" value={setup.teamScoringRule || "sum-members"} onChange={(e) => change("teamScoringRule", e.target.value)}>
              {Object.entries(TEAM_SCORING_RULE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </Field> : null}
          <Field label="Pooling phase">
            <select id="cfg-pooling-phase" value={setup.poolingPhase} onChange={(e) => change("poolingPhase", e.target.value)}>
              <option value="none">None — standard elimination from R1</option>
              <option value="qual-table">Qualification Table — R1/R2/R3 feed cumulative table</option>
              <option value="swiss">Swiss — fold-paired rounds feed cumulative standings</option>
              <option value="group-stage">Group Stage — round-robin groups, top finishers advance</option>
            </select>
          </Field>
          {isGroup ? <>
            <Field label="Group size"><input id="cfg-group-size" type="number" min="3" max="5" value={setup.groupSize} onChange={(e) => change("groupSize", e.target.value)} /></Field>
            <Field label="Round-robin"><select id="cfg-round-robin-mode" value={setup.roundRobinMode} onChange={(e) => change("roundRobinMode", e.target.value)}><option value="single">Single — every pair meets once</option><option value="double">Double — every pair meets twice</option></select></Field>
            <Field label="Qualifiers per group"><input id="cfg-qualifiers-per-group" type="number" min="1" value={setup.qualifiersPerGroup} onChange={(e) => change("qualifiersPerGroup", e.target.value)} /></Field>
          </> : setup.poolingPhase !== "none" ? <Field label="Advance to bracket"><input id="cfg-qual-adv" type="number" min="1" value={setup.qualAdv} onChange={(e) => change("qualAdv", e.target.value)} /></Field> : null}
          {format?.supportedOddCountStrategies && format.supportedOddCountStrategies.length > 1 ? <Field label="Odd-count strategy">
            <select id="cfg-odd-count-strategy" value={setup.oddCountStrategy || format.supportedOddCountStrategies[0]} onChange={(e) => change("oddCountStrategy", e.target.value)}>
              {format.supportedOddCountStrategies.map((key) => <option key={key} value={key}>{ODD_COUNT_STRATEGY_LABELS[key]}</option>)}
            </select>
          </Field> : null}
          <Field label="Scoring system"><select id="cfg-scoring" value="fairpoints" disabled><option value="fairpoints">Fair Points (rank − score ÷ 100000)</option></select></Field>
          {!isRace ? <Field label="Finals format"><select id="cfg-finals-games" value={setup.finalsGames} onChange={(e) => change("finalsGames", e.target.value)}>{[1,2,3,4].map((n) => <option key={n} value={n}>{n === 1 ? "Single game" : `${n} games (sum)`}</option>)}</select></Field> : <Field label="Grand Final — wins needed to take the title"><div className="split-inputs"><input aria-label="Winners bracket target" type="number" min="1" value={setup.grandFinalWbTarget} onChange={(e) => change("grandFinalWbTarget", e.target.value)} /><input aria-label="Losers bracket target" type="number" min="1" value={setup.grandFinalLbTarget} onChange={(e) => change("grandFinalLbTarget", e.target.value)} /></div></Field>}
          {isSingle ? <>
            <Field label="Semis size override (optional)"><input id="cfg-semis-override" type="number" min="1" placeholder="derived" value={setup.semisOverride} onChange={(e) => change("semisOverride", e.target.value)} /></Field>
            <Field label="Semis format"><select id="cfg-semis-games" value={setup.semisGames} onChange={(e) => change("semisGames", e.target.value)}>{[1,2,3,4].map((n) => <option key={n} value={n}>{n === 1 ? "Single game" : `${n} games (sum)`}</option>)}</select></Field>
          </> : null}
          {isShared ? <Field label="LB qualifiers into the Final"><input id="cfg-lb-qualifiers" type="number" min="1" value={lbQualifiers} onChange={(e) => setLbQualifiers(e.target.value)} /></Field> : null}
          {isSingle || isShared ? <Field label="Final size override (optional)"><input id="cfg-final-override" type="number" min="1" placeholder="derived" value={setup.finalOverride} onChange={(e) => change("finalOverride", e.target.value)} /></Field> : null}
          {error ? <div id="generate-error" className="msg msg-err">{error}</div> : null}
          <div className="btn-row"><button className="btn btn-primary" onClick={generate}>▶ Generate Schedule</button></div>
        </div>
        <div className="card">
          <Field label="Registered players"><div className="field-display" id="cfg-n-display">{state.confirmedCount ?? "—"}{state.reserves.length ? ` (+ ${state.reserves.length} reserves)` : ""}</div></Field>
          <div className="card-title">Roster <span className="hint">— confirmed {teamSize ? "teams" : "players"}, one per line</span></div>
          <textarea id="cfg-roster" value={setup.roster} onChange={(e) => change("roster", e.target.value)} placeholder={teamSize ? `Team Rocket, ${Array.from({length: teamSize}, (_, i) => `Player${i + 1}`).join(", ")}` : "Harald\nLagtop\nArisu\n..."} />
          <div className="card-title section-gap">Reserves <span className="hint">— one per line</span></div>
          <textarea id="cfg-reserves" className="short-textarea" value={setup.reserves} onChange={(e) => change("reserves", e.target.value)} />
          {teamSize ? <><div className="card-title section-gap">Individual reserves <span className="hint">— substitutes for one member</span></div><textarea id="cfg-reserve-individuals" className="short-textarea" value={setup.reserveIndividuals} onChange={(e) => change("reserveIndividuals", e.target.value)} /></> : null}
          <div className="btn-row"><button className="btn btn-secondary" onClick={loadRoster}>Load roster & reserves</button><span className="inline-status">{status}</span></div>
        </div>
      </div>
      {state.rounds.length && !state.started ? <div id="preview-wrap" className="card">
        <div className="card-title">Schedule Preview</div>
        <div className="timeline">{state.rounds.map((round, index) => <div className="tl-item" key={index}><div className="tl-dot">{round.roundNum}</div><div className="tl-label">{round.isFinal ? "Final" : round.bracket === "winners" ? "WB" : round.bracket === "losers" ? "LB" : `${round.players} ${format?.unitLabelPlural ?? "Players"}`}</div></div>)}</div>
        <div className="btn-row"><button className="btn btn-success" onClick={() => updateState({ ...state, curRound: 0, started: true })}>✓ Confirm & Start</button></div>
      </div> : null}
    </div>
  );
}
