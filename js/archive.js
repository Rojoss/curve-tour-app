// archive.js — the Tournament Archive: storage, save/auto-save, the list/
// detail views, annotations, and JSON export.

// ═══════════════════════════════════════════════════════════════
// ARCHIVE — DATA LAYER & SAVE FLOWS. Completed (or manually saved)
//  tournaments, stored separately from the live curveFFA_state_v1
//  key so the two never collide. Index (curveFFA_archive_index) holds
//  lightweight summary rows for fast listing; each full snapshot
//  lives at its own curveFFA_archive_{id} key, storing a deep copy
//  of T at save time plus organiser annotations.
//  No DOM rendering below this point until renderArchiveList() —
//  see ARCHIVE RENDERING further down for the read-only views.
// ═══════════════════════════════════════════════════════════════
var ARCHIVE_INDEX_KEY = 'curveFFA_archive_index';

function getArchiveIndex() {
  try { return JSON.parse(localStorage.getItem(ARCHIVE_INDEX_KEY) || '[]'); }
  catch (e) { return []; }
}

function saveArchiveIndex(index) {
  localStorage.setItem(ARCHIVE_INDEX_KEY, JSON.stringify(index));
}

function getArchiveEntry(id) {
  try { return JSON.parse(localStorage.getItem('curveFFA_archive_' + id)); }
  catch (e) { return null; }
}

function saveArchiveEntry(entry) {
  localStorage.setItem('curveFFA_archive_' + entry.id, JSON.stringify(entry));
}

function buildArchiveSummary(id, title, dateSaved) {
  return {
    id, title, dateSaved,
    tournamentId: T.tournamentId, // identity for de-dup matching — see saveToArchive/archiveSilently
    playerCount: T.players.length,
    roundsPlayed: T.rounds[T.curRound] ? T.rounds[T.curRound].roundNum : 0
  };
}

function showArchiveStatus(msg) {
  var el = document.getElementById('archive-save-status');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(showArchiveStatus._t);
  showArchiveStatus._t = setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// Writes the actual archive entry + index update. Shared by the
// interactive Save button, the silent save-and-proceed flows, and the
// Final-completion auto-save — none of those differ in HOW a save
// happens, only in WHETHER they ask the organiser first.
function performArchiveSave(id, title, keepAnnotations) {
  var index = getArchiveIndex();
  var dateSaved = new Date().toISOString();
  var oldEntry = keepAnnotations ? getArchiveEntry(id) : null;
  var entry = {
    id, title, dateSaved,
    tournamentId: T.tournamentId,
    snapshot: JSON.parse(JSON.stringify(T)),
    annotations: (oldEntry && oldEntry.annotations) || []
  };
  saveArchiveEntry(entry);
  var summary = buildArchiveSummary(id, title, dateSaved);
  var idx = index.findIndex(e => e.id === id);
  if (idx === -1) index.push(summary); else index[idx] = summary;
  saveArchiveIndex(index);
  T.needsSave = false;
  saveState();
  if (getActiveTab() === 'archive') renderArchiveList();
}

// Interactive save — the one path that can prompt. Matches by T.tournamentId
// (stable per-generation identity), not by title — organisers can and do reuse
// titles across genuinely different tournaments (e.g. a recurring weekly event),
// and matching by title alone would silently overwrite an unrelated saved entry.
// A title collision with a *different* tournamentId still prompts (never a
// silent overwrite), it just can't offer "Overwrite" since that would target
// the wrong entry.
function saveToArchive() {
  if (!T.rounds.length) return;
  var title = (T.title || '').trim() || 'Unnamed Tournament';
  var index = getArchiveIndex();
  var sameTournament = T.tournamentId ? index.find(e => e.tournamentId === T.tournamentId) : undefined;
  function doSave(id, keepAnnotations) {
    performArchiveSave(id, title, keepAnnotations);
    showArchiveStatus('Tournament saved to archive.');
  }

  if (sameTournament) {
    showModal('Tournament already archived',
      'A tournament named "' + title + '" already exists. Overwrite, save as a new entry, or cancel?',
      [
        { label: 'Overwrite existing', className: 'btn-danger', onClick: () => doSave(sameTournament.id, true) },
        { label: 'Save as new entry', className: 'btn-secondary', onClick: () => doSave(String(Date.now()), false) },
        { label: 'Cancel', className: 'btn-secondary' }
      ]);
    return;
  }

  var titleCollision = index.find(e => e.title === title);
  if (titleCollision) {
    showModal('Title already used',
      'A different archived tournament is also named "' + title + '". Save this as a new entry, or cancel to rename it first?',
      [
        { label: 'Save as new entry', className: 'btn-secondary', onClick: () => doSave(String(Date.now()), false) },
        { label: 'Cancel', className: 'btn-secondary' }
      ]);
    return;
  }

  doSave(String(Date.now()), false);
}

// Non-interactive save — always resolves immediately (overwrite on a
// same-title match, otherwise create new), never shows a dialog. Used
// for the real Final-completion auto-save and for the "Save & ..."
// choices inside the unsaved-changes modal, since chaining a second
// interactive prompt from inside a modal callback risks T being
// mutated by whatever comes next before the user responds to it.
function archiveSilently(statusMsg) {
  if (!T.rounds.length) return;
  var title = (T.title || '').trim() || 'Unnamed Tournament';
  // Matches by tournamentId only — never by title, so a title shared with a
  // different tournament can never be silently overwritten here.
  var existing = T.tournamentId ? getArchiveIndex().find(e => e.tournamentId === T.tournamentId) : undefined;
  performArchiveSave(existing ? existing.id : String(Date.now()), title, !!existing);
  showArchiveStatus(statusMsg);
}

// Fires once per tournament, the moment every finalist has a score for
// every Final game — reuses the exact same completion check Rankings
// already computes, so "Final complete" means the same thing everywhere.
function checkAutoArchive() {
  if (T.autoSaved) return;
  var round = T.rounds[T.curRound];
  if (!round || !round.isFinal) return;
  var data = computeRankings();
  if (data && data.finalComplete) {
    archiveSilently('Tournament archived automatically.');
    T.autoSaved = true;
    saveState();
  }
}

// ═══════════════════════════════════════════════════════════════
// ARCHIVE RENDERING — read-only views over saved snapshots (list,
//  detail Rankings/Bracket, annotations, JSON export). Kept separate
//  from the live-tournament renderers above (Scoreboard, Bracket,
//  Rankings) since the two read from different data sources (a
//  snapshot object vs. the live T) and mixing them up would be a
//  source of bugs. Detail rendering reuses the same pure, DOM-free
//  builders (computeRankings/buildBracketHtml/buildRankingsRows) the
//  live tabs use, just fed an archived snapshot instead of T.
// ═══════════════════════════════════════════════════════════════
function renderArchiveList() {
  document.getElementById('ar-detail-view').style.display = 'none';
  document.getElementById('ar-list-view').style.display = 'block';
  var index = getArchiveIndex().slice().sort((a, b) => new Date(b.dateSaved) - new Date(a.dateSaved));
  var emptyEl = document.getElementById('ar-empty');
  document.getElementById('ar-export-all-wrap').style.display = index.length ? 'block' : 'none';
  if (!index.length) {
    emptyEl.style.display = 'block';
    document.getElementById('ar-list').innerHTML = '';
    return;
  }
  emptyEl.style.display = 'none';
  var html = '';
  index.forEach(entry => {
    var dateStr = new Date(entry.dateSaved).toLocaleString();
    html += `<div class="archive-row" style="cursor:pointer" onclick="openArchiveEntry('${entry.id}')">
      <div class="archive-row-main">
        <div class="archive-row-title">${esc(entry.title)}</div>
        <div class="archive-row-meta">${dateStr} · ${entry.playerCount} players · ${entry.roundsPlayed} round${entry.roundsPlayed === 1 ? '' : 's'} played</div>
      </div>
    </div>`;
  });
  document.getElementById('ar-list').innerHTML = html;
}

// --- Archive detail view: read-only Rankings + Bracket for one saved snapshot ---
var currentArchiveEntry = null;

function openArchiveEntry(id) {
  var entry = getArchiveEntry(id);
  if (!entry) return;
  currentArchiveEntry = entry;
  document.getElementById('ar-list-view').style.display = 'none';
  document.getElementById('ar-detail-view').style.display = 'block';

  var snap = entry.snapshot;
  var snapFormat = GAME_FORMATS[snap.gameFormat] || GAME_FORMATS['ffa-individual']; // pre-gamemode-refactor archives have no gameFormat field
  document.getElementById('ar-detail-summary').innerHTML =
    statEl('Tournament', entry.title, 'cyan') +
    statEl('Saved', new Date(entry.dateSaved).toLocaleString()) +
    statEl(snapFormat.unitLabelPlural, snap.players.length) +
    statEl('Rounds played', snap.rounds[snap.curRound] ? snap.rounds[snap.curRound].roundNum : '—');

  var rankData = computeRankings(snap);
  document.getElementById('ar-rk-list').innerHTML = rankData ? buildRankingsRows(rankData) :
    '<div style="text-align:center;color:var(--muted);padding:20px">No data.</div>';

  document.getElementById('ar-bracket-rounds').innerHTML = buildBracketHtml(snap);

  renderAnnotationsList(entry);
}

function backToArchiveList() {
  currentArchiveEntry = null;
  renderArchiveList();
}

function renderAnnotationsList(entry) {
  var wrap = document.getElementById('ar-annotations-list');
  if (!entry.annotations.length) {
    wrap.innerHTML = '<div style="color:var(--muted);font-size:12px;margin-bottom:8px">No annotations yet.</div>';
    return;
  }
  var html = '';
  entry.annotations.forEach((note, i) => {
    html += `<div class="seed-card" style="align-items:flex-start;flex-direction:column;gap:4px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;width:100%;gap:10px">
        <div style="font-size:13px;white-space:pre-wrap;flex:1">${esc(note.text)}</div>
        <button class="btn btn-secondary btn-sm" onclick="deleteAnnotation(${i})" title="Delete">✕</button>
      </div>
      <div style="font-size:10px;color:var(--muted)">${new Date(note.timestamp).toLocaleString()}</div>
    </div>`;
  });
  wrap.innerHTML = html;
}

// Annotations are stored on the archived entry itself and saved back
// immediately — they never touch the index or the live curveFFA_state_v1.
function addAnnotation() {
  if (!currentArchiveEntry) return;
  var input = document.getElementById('ar-note-input');
  var text = input.value.trim();
  if (!text) return;
  currentArchiveEntry.annotations.push({ text, timestamp: new Date().toISOString() });
  saveArchiveEntry(currentArchiveEntry);
  input.value = '';
  renderAnnotationsList(currentArchiveEntry);
}

function deleteAnnotation(index) {
  if (!currentArchiveEntry) return;
  if (!confirm('Delete this annotation? This cannot be undone.')) return;
  currentArchiveEntry.annotations.splice(index, 1);
  saveArchiveEntry(currentArchiveEntry);
  renderAnnotationsList(currentArchiveEntry);
}

function exportEntryAsJson(id) {
  var entry = id ? getArchiveEntry(id) : currentArchiveEntry;
  if (!entry) return;
  var dateStr = new Date(entry.dateSaved).toISOString().slice(0, 10);
  downloadJson(`curve-tournament_${sanitizeFilename(entry.title)}_${dateStr}.json`, entry);
}

function exportFullArchive() {
  var index = getArchiveIndex();
  var entries = index.map(e => getArchiveEntry(e.id)).filter(Boolean);
  var dateStr = new Date().toISOString().slice(0, 10);
  downloadJson(`curve-tournament-archive_${dateStr}.json`, { exportedAt: new Date().toISOString(), tournaments: entries });
}
