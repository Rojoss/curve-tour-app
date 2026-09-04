// sync.js — cross-tab / cross-device live sync via Firebase Realtime
// Database. See "Cross-tab / cross-device live sync" in HANDOFF.md for the
// full design writeup and threat model.
//
// Two modes, decided ONCE at page load from the URL, never re-evaluated:
//  - WRITER (no "?t=" param — the organiser's own tab): behaves exactly as
//    before (localStorage-driven), PLUS pushes T to Firebase, debounced,
//    every time saveState() runs, so any real mutation gets picked up.
//  - VIEWER (opened via a shared "?t=<tournamentId>" link): never touches
//    localStorage or the real T persistence path at all — purely mirrors
//    whatever the writer last pushed, read-only. Admin is inaccessible in
//    this mode (see the switchTab() guard in core.js) since any local
//    mutation a viewer made would just be silently overwritten by the next
//    real update and could never actually affect the live tournament.
//
// Only the writer ever calls .set() — no operational-transform/merge logic
// for two simultaneous writer tabs; last write wins, an accepted risk at
// the same level as this app's other "organiser is a single trusted person"
// assumptions (see Admin password protection in HANDOFF.md).
// ═══════════════════════════════════════════════════════════════

var SYNC_VIEW_TID = new URLSearchParams(location.search).get('t');
var SYNC_IS_VIEWER = !!SYNC_VIEW_TID;
var SYNC_WRITEKEY_KEY = 'curveFFA_sync_writekey_v1';

// Public client config — not a secret; the Realtime Database security rules
// (see HANDOFF.md) are what actually gate access, not hiding this object.
var SYNC_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAzbwk2ZJj2jmtKRFjzDJyPk4ePmF3Q04M",
  authDomain: "curve-tour-app.firebaseapp.com",
  databaseURL: "https://curve-tour-app-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "curve-tour-app",
  storageBucket: "curve-tour-app.firebasestorage.app",
  messagingSenderId: "840551568118",
  appId: "1:840551568118:web:40e3c22de01e2587e8d2d7"
};

// Guarded, not assumed — an ad-blocker, offline load, or a firewall can all
// keep the Firebase script tags from ever defining `firebase`. The whole
// app (including the organiser's own local-only workflow) must keep working
// exactly as before regardless, so every function below no-ops cleanly if
// this is null rather than throwing.
var SYNC_DB = null;
try {
  if (typeof firebase !== 'undefined') {
    firebase.initializeApp(SYNC_FIREBASE_CONFIG);
    SYNC_DB = firebase.database();
  }
} catch (e) { console.warn('Live sync unavailable — Firebase failed to initialize', e); }

var syncPushTimer = null;
var syncLastError = null;
var syncHasPushedOnce = false;

// ═══════════════════════════════════════════════════════════════
// WRITER SIDE
// ═══════════════════════════════════════════════════════════════

function generateSyncWriteKey() {
  var key = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36);
  localStorage.setItem(SYNC_WRITEKEY_KEY, key);
  return key;
}

// Called once at load for a writer tab — resumes the shareable URL/status
// panel for an already-generated tournament restored from localStorage, so
// the organiser doesn't have to regenerate just to get their link back.
function initWriterMode() {
  if (T.tournamentId) updateSyncUrlBar();
  renderSyncStatusPanel();
}

function updateSyncUrlBar() {
  if (!T.tournamentId) return;
  history.replaceState(null, '', location.pathname + '?t=' + T.tournamentId);
}

function clearSyncUrlBar() {
  history.replaceState(null, '', location.pathname);
}

// Debounced — saveState() runs on every real mutation (and every tab
// switch), so without this a quick run of score entries would fire one
// Firebase write per keystroke/click instead of one per pause.
function pushSyncUpdate() {
  if (SYNC_IS_VIEWER || !SYNC_DB || !T.tournamentId) return;
  var writeKey = localStorage.getItem(SYNC_WRITEKEY_KEY);
  if (!writeKey) return; // no key yet — proceedGenerateSchedule() hasn't run, nothing to push
  clearTimeout(syncPushTimer);
  syncPushTimer = setTimeout(function () {
    var payload;
    try { payload = JSON.parse(JSON.stringify(T)); } catch (e) { return; }
    payload.writeKey = writeKey; // read by the security rules — see HANDOFF.md
    SYNC_DB.ref('tournaments/' + T.tournamentId).set(payload).then(function () {
      syncLastError = null;
      syncHasPushedOnce = true;
      renderSyncStatusPanel();
    }).catch(function (e) {
      syncLastError = (e && e.message) ? e.message : String(e);
      renderSyncStatusPanel();
    });
  }, 400);
}

function copyLiveLink() {
  if (!T.tournamentId) { alert('Generate and start a tournament first.'); return; }
  var url = location.origin + location.pathname + '?t=' + T.tournamentId;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function () {
      var el = document.getElementById('sync-copy-status');
      if (el) { el.textContent = 'Copied!'; setTimeout(function () { el.textContent = ''; }, 2000); }
    }).catch(function () { prompt('Copy this link:', url); });
  } else {
    prompt('Copy this link:', url);
  }
}

// Small status card in the running Admin panel — link to share, plus a
// coarse "is this actually reaching viewers" indicator. Re-rendered after
// every push attempt (success or failure) rather than on a timer, since
// pushSyncUpdate() already tells us exactly when state changes.
function renderSyncStatusPanel() {
  var el = document.getElementById('sync-status-panel');
  if (!el) return;
  if (!T.tournamentId) { el.innerHTML = ''; return; }
  var url = location.origin + location.pathname + '?t=' + T.tournamentId;
  var statusHtml;
  if (!SYNC_DB) {
    statusHtml = '<span style="color:var(--red)">⚪ Live sync unavailable (couldn\'t reach the sync service) — viewers need to refresh manually, same as before.</span>';
  } else if (syncLastError) {
    statusHtml = '<span style="color:var(--red)">🔴 Sync error — viewers may be seeing stale data (' + esc(syncLastError) + ')</span>';
  } else if (syncHasPushedOnce) {
    statusHtml = '<span style="color:var(--green)">🟢 Live sync active</span>';
  } else {
    statusHtml = '<span style="color:var(--muted)">🔄 Connecting…</span>';
  }
  el.innerHTML =
    '<div class="card-title">Live Sync — viewer link</div>' +
    '<div class="field" style="margin-bottom:8px"><input type="text" readonly value="' + esc(url) + '" onclick="this.select()"></div>' +
    '<div class="btn-row" style="align-items:center;gap:10px">' +
      '<button class="btn btn-secondary" onclick="copyLiveLink()">📋 Copy Live Link</button>' +
      '<span id="sync-copy-status" style="font-size:12px;color:var(--green)"></span>' +
    '</div>' +
    '<div style="margin-top:8px;font-size:12px">' + statusHtml + '</div>';
}

// ═══════════════════════════════════════════════════════════════
// VIEWER SIDE
// ═══════════════════════════════════════════════════════════════

function initViewerMode() {
  var adminBtn = document.querySelector('nav button[data-tab="admin"]');
  if (adminBtn) adminBtn.style.display = 'none';
  var archiveBtn = document.querySelector('nav button[data-tab="archive"]');
  if (archiveBtn) archiveBtn.style.display = 'none'; // archive is organiser-only local data, meaningless for a viewer
  showSyncViewerOverlay('Connecting…', 'Loading the live tournament.');
  switchTab('bracket', document.querySelector('nav button[data-tab="bracket"]'));
  startViewerListener();
}

function startViewerListener() {
  if (!SYNC_DB) {
    showSyncViewerOverlay('Live sync unavailable', 'The live-sync library couldn\'t load — check your connection and reload the page.');
    return;
  }
  SYNC_DB.ref('tournaments/' + SYNC_VIEW_TID).on('value', function (snapshot) {
    var payload = snapshot.val();
    if (!payload) {
      showSyncViewerOverlay('Waiting for the tournament to start…', 'This link is valid, but the organiser hasn\'t generated a schedule yet. This page updates automatically once they do.');
      return;
    }
    delete payload.writeKey;
    Object.assign(T, payload);
    hideSyncViewerOverlay();
    hideSyncStaleBanner();
    renderTabForViewerSync();
  }, function (error) {
    showSyncStaleBanner(); // data already on screen stays visible — only a banner, not a blocking overlay, see HANDOFF.md
    console.warn('Live sync connection lost', error);
  });
}

function showSyncViewerOverlay(title, msg) {
  document.getElementById('sync-viewer-title').textContent = title;
  document.getElementById('sync-viewer-msg').textContent = msg;
  document.getElementById('sync-viewer-overlay').style.display = 'flex';
}

function hideSyncViewerOverlay() {
  document.getElementById('sync-viewer-overlay').style.display = 'none';
}

function showSyncStaleBanner() {
  var el = document.getElementById('sync-stale-banner');
  if (el) el.style.display = 'block';
}

function hideSyncStaleBanner() {
  var el = document.getElementById('sync-stale-banner');
  if (el) el.style.display = 'none';
}

// Re-renders whichever tab a viewer is actually looking at, plus the header
// (title/round), which normally only renderAdminRound() keeps in sync — a
// viewer tab never calls that, since it never touches the Admin view at all.
function renderTabForViewerSync() {
  updateTitleDisplay();
  var hdrRound = document.getElementById('hdr-round');
  if (hdrRound) hdrRound.textContent = (T.rounds && T.rounds[T.curRound]) ? T.rounds[T.curRound].roundNum : '—';
  var activeTab = getActiveTab();
  if (activeTab === 'scoreboard') renderScoreboard();
  else if (activeTab === 'bracket') renderBracket();
  else if (activeTab === 'players') renderPlayers();
  else if (activeTab === 'rankings') renderRankings();
}
