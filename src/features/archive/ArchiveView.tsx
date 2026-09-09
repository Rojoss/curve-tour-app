import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { getGameFormat } from "../../domain/tournament";
import {
  ARCHIVE_IMPORT_MAX_BYTES,
  archiveBundle,
  deleteArchive,
  loadArchiveEntry,
  loadArchiveIndex,
  normalizeLiveTournamentState,
  parseArchiveImport,
  runArchiveImport,
  updateArchiveAnnotations,
  type ArchiveEntry,
  type ArchiveImportMode,
  type ArchiveSummary,
  type ParsedArchiveImport,
} from "../../lib/persistence";
import { downloadJson, sanitizeFilename } from "../../lib/browser-download";
import { ArchivedBracket } from "../bracket/BracketView";
import { RankingsContent } from "../rankings/RankingsView";
import { downloadRankingsImage } from "../rankings/rankings-image";
import { useTournamentApp } from "../tournament/TournamentProvider";

interface PendingImport {
  parsed: Extract<ParsedArchiveImport, { status: "valid" }>;
  collisions: ArchiveSummary[];
}

function describeImport(
  counts: ReturnType<typeof runArchiveImport>,
  invalid: number,
  isBundle: boolean,
): string {
  const total = counts.added + counts.overwritten;
  if (!isBundle) {
    if (!total) return counts.failed
      ? "Couldn't import — your browser's storage is full."
      : "That file doesn't contain a usable tournament — nothing was imported.";
    const name = `Imported "${counts.lastTitle}"`;
    if (counts.overwritten) return `${name} — replaced the copy already in your archive.`;
    if (counts.mode === "new") return `${name} as a second, separate archive entry.`;
    return `${name}.`;
  }
  const parts: string[] = [];
  if (counts.overwritten) parts.push(`${counts.overwritten} replaced existing ${counts.overwritten === 1 ? "copy" : "copies"}`);
  if (counts.skippedDup) parts.push(`${counts.skippedDup} skipped — already archived`);
  if (invalid) parts.push(`${invalid} skipped — invalid data`);
  if (!total) {
    if (counts.failed) return "Couldn't import — your browser's storage is full.";
    const reasons: string[] = [];
    if (counts.skippedDup) reasons.push(`${counts.skippedDup} were already archived`);
    if (invalid) reasons.push(`${invalid} contained no usable tournament data`);
    return reasons.length
      ? `Nothing was imported — of the ${counts.skippedDup + invalid} entries in that file, ${reasons.join(" and ")}.`
      : "Nothing was imported — none of the entries in that file contained usable tournament data.";
  }
  let message = `Imported ${total} tournament${total === 1 ? "" : "s"}${parts.length ? ` (${parts.join(", ")})` : ""}.`;
  if (counts.failed) message += ` Ran out of browser storage — the remaining ${counts.failed} were not imported.`;
  return message;
}

export function ArchiveView() {
  const app = useTournamentApp();
  const input = useRef<HTMLInputElement>(null);
  const [index, setIndex] = useState<ArchiveSummary[]>([]);
  const [selected, setSelected] = useState<ArchiveEntry | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState<PendingImport | null>(null);

  function reload() {
    setIndex(loadArchiveIndex(window.localStorage));
  }

  useEffect(reload, []);

  const sorted = useMemo(
    () => [...index].sort((a, b) => new Date(b.dateSaved).getTime() - new Date(a.dateSaved).getTime()),
    [index],
  );

  function mintId(current: ArchiveSummary[]) {
    let id = String(app.runtime.clock.now());
    while (current.some((entry) => String(entry.id) === id) || window.localStorage.getItem(`curveFFA_archive_${id}`) !== null) {
      id = String(Number(id) + 1);
    }
    return id;
  }

  function finishImport(parsed: PendingImport["parsed"], mode: ArchiveImportMode) {
    const counts = runArchiveImport({
      storage: window.localStorage,
      entries: parsed.entries,
      mode,
      now: new Date(app.runtime.clock.now()).toISOString(),
      mintId,
    });
    setPending(null);
    reload();
    setStatus(describeImport(counts, parsed.invalid, parsed.isBundle));
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > ARCHIVE_IMPORT_MAX_BYTES) {
      setStatus("That file is too large to be a tournament export — nothing was imported.");
      return;
    }
    let text: string;
    try { text = await file.text(); } catch {
      setStatus("Couldn't read that file — it may be unreadable or no longer available.");
      return;
    }
    const parsed = parseArchiveImport(text);
    if (parsed.status === "invalid-json") {
      setStatus("That file isn't valid JSON — it may be corrupted, or not a Curve tournament export.");
      return;
    }
    if (parsed.status === "empty-bundle") {
      setStatus("That full-archive file contains no tournaments — nothing to import.");
      return;
    }
    if (parsed.status === "invalid-shape") {
      setStatus("That JSON file isn't a Curve tournament export — expected either a single archived tournament or a full-archive file.");
      return;
    }
    const existing = new Map(index.map((entry) => [String(entry.id), entry]));
    const collisions = parsed.entries.flatMap((entry) => existing.get(String(entry.id)) ?? []);
    if (collisions.length) setPending({ parsed, collisions });
    else finishImport(parsed, "overwrite");
  }

  if (selected) {
    const state = normalizeLiveTournamentState(selected.snapshot, app.runtime.ids);
    const format = getGameFormat(state.gameFormat);
    return <div id="ar-detail-view">
      <div className="btn-row archive-detail-actions">
        <button className="btn btn-secondary" onClick={() => { setSelected(null); reload(); }}>← Back to Archive</button>
        <button className="btn btn-secondary" onClick={() => downloadJson(`curve-tournament_${sanitizeFilename(selected.title)}_${new Date(selected.dateSaved).toISOString().slice(0, 10)}.json`, selected)}>⬇ Export JSON</button>
        <button className="btn btn-secondary" onClick={() => void downloadRankingsImage(state)}>⬇ Rankings PNG</button>
        <button className="btn btn-danger" onClick={() => {
          if (!window.confirm(`Permanently delete "${selected.title}" from the archive? This cannot be undone.`)) return;
          deleteArchive(window.localStorage, selected.id);
          setSelected(null);
          reload();
        }}>Delete</button>
      </div>
      <div className="stats" id="ar-detail-summary">
        <div><span>Tournament</span><strong className="cyan">{selected.title}</strong></div>
        <div><span>Saved</span><strong>{new Date(selected.dateSaved).toLocaleString()}</strong></div>
        <div><span>{format?.unitLabelPlural ?? "Players"}</span><strong>{state.players.length}</strong></div>
        <div><span>Rounds played</span><strong>{state.rounds[state.curRound]?.roundNum ?? "—"}</strong></div>
      </div>
      <div className="card archive-notes">
        <div className="card-title">Organiser annotations</div>
        <div id="ar-annotations-list">
          {!selected.annotations.length ? <div className="muted archive-note-empty">No annotations yet.</div> : selected.annotations.map((annotation, annotationIndex) => <div className="seed-card archive-note" key={`${annotation.timestamp}-${annotationIndex}`}>
            <div className="archive-note-head"><div>{annotation.text}</div><button className="btn btn-secondary btn-sm" title="Delete" onClick={() => {
              if (!window.confirm("Delete this annotation? This cannot be undone.")) return;
              const annotations = selected.annotations.filter((_, indexToKeep) => indexToKeep !== annotationIndex);
              const updated = updateArchiveAnnotations(window.localStorage, selected.id, annotations);
              if (updated) setSelected(updated);
            }}>✕</button></div>
            <small>{new Date(annotation.timestamp).toLocaleString()}</small>
          </div>)}
        </div>
        <div className="archive-note-add"><textarea id="ar-note-input" value={note} placeholder="Add a note about this tournament…" onChange={(event) => setNote(event.target.value)} /><button className="btn btn-secondary" onClick={() => {
          const text = note.trim();
          if (!text) return;
          const updated = updateArchiveAnnotations(window.localStorage, selected.id, [...selected.annotations, { text, timestamp: new Date(app.runtime.clock.now()).toISOString() }]);
          if (updated) setSelected(updated);
          setNote("");
        }}>Add annotation</button></div>
      </div>
      <div className="card"><div className="card-title">Final rankings</div><RankingsContent state={state} downloads={false} /></div>
      <div className="card"><div className="card-title">Tournament bracket</div><ArchivedBracket state={state} /></div>
    </div>;
  }

  return <div id="ar-list-view">
    <div className="archive-toolbar">
      <div><h2>Tournament Archive</h2><p className="muted">Saved tournament snapshots are stored in this browser.</p></div>
      <div className="btn-row">
        {index.length ? <button className="btn btn-secondary" onClick={() => {
          const now = new Date(app.runtime.clock.now()).toISOString();
          downloadJson(`curve-tournament-archive_${now.slice(0, 10)}.json`, archiveBundle(window.localStorage, now));
        }}>⬇ Export full archive</button> : null}
        <button className="btn btn-secondary" onClick={() => input.current?.click()}>⬆ Import JSON</button>
        <input ref={input} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void importFile(event)} />
      </div>
    </div>
    {status ? <div className="msg msg-info" role="status">{status}</div> : null}
    {!sorted.length ? <div className="msg msg-info" id="ar-empty">No tournaments archived yet — completed tournaments saved from Admin will show up here, or import a previously exported file.</div> : <div id="ar-list" className="archive-list">{sorted.map((summary) => <button className="archive-row" key={summary.id} onClick={() => {
      const entry = loadArchiveEntry(window.localStorage, summary.id);
      if (entry) setSelected(entry);
    }}><span className="archive-row-title">{summary.title}</span><span className="archive-row-meta">{new Date(summary.dateSaved).toLocaleString()} · {summary.playerCount} players · {summary.roundsPlayed} round{summary.roundsPlayed === 1 ? "" : "s"} played</span></button>)}</div>}
    {pending ? <div className="modal-overlay" role="presentation"><div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="archive-import-title">
      <div className="modal-title" id="archive-import-title">{pending.parsed.isBundle ? "Some of these are already archived" : "Already in your archive"}</div>
      <p>{pending.parsed.isBundle
        ? `${pending.collisions.length} of the ${pending.parsed.entries.length} tournaments in this file are already in your archive. How should those be handled? This choice applies to all ${pending.collisions.length}.`
        : `An archived tournament with this ID already exists ("${pending.collisions[0]?.title}"). Overwrite it, import it as a separate new entry, or cancel?`}</p>
      <div className="modal-btns">
        <button className="btn btn-danger" onClick={() => finishImport(pending.parsed, "overwrite")}>Overwrite existing</button>
        <button className="btn btn-secondary" onClick={() => finishImport(pending.parsed, "new")}>{pending.parsed.isBundle ? "Import all as new copies" : "Import as new entry"}</button>
        {pending.parsed.isBundle ? <button className="btn btn-secondary" onClick={() => finishImport(pending.parsed, "skip")}>Skip the duplicates</button> : null}
        <button className="btn btn-secondary" onClick={() => setPending(null)}>Cancel</button>
      </div>
    </div></div> : null}
  </div>;
}
