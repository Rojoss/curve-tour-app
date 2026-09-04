// render-viewer.js — viewer-facing tabs: Scoreboard, Bracket, Players,
// Rankings (including the PNG export), and the auto-refresh interval that
// keeps Scoreboard/Bracket live for a viewer who never touches Admin.

// Shared standings-table renderer for both cumulative-standings pooling
// phases — the accumulation (T.qualTable) is identical in mechanism for
// Qualification Table and Swiss (see isStandingsRound/updateQualTable), only
// the title and the "played / of how many" denominator differ, so this stays
// one function with a small phase-driven branch rather than two near-
// duplicates. Named for what it now does (render the standings table,
// whichever phase produced it), not for "qual" specifically, since that name
// would be actively misleading once it's just as often showing Swiss
// standings — same renaming precedent as classicEliminationBuildProgression
// -> composedBuildProgression.
function renderStandingsTable() {
  var qualAdv = T.cfg.qualAdv || 24;
  var descriptor = getGamemodeDescriptor();
  var isSwiss = T.cfg.poolingPhase === 'swiss';
  var totalPoolRounds = isSwiss
    ? ((descriptor.config && descriptor.config.swissRounds) || MIN_SWISS_ROUNDS)
    : ((descriptor.config && descriptor.config.qualRounds) || QUAL_ROUNDS);
  // Only meaningful (and only actually blocks advanceRound()) on the last
  // standings round — showing it earlier would flag a "tie" based on
  // incomplete cumulative totals that's very likely to resolve itself once
  // the remaining pooling rounds are played.
  var cr = T.rounds[T.curRound];
  var isLastStandingsRound = cr && T.cfg.poolingPhase !== 'none' && isStandingsRound(cr) &&
    !(T.rounds[T.curRound + 1] && isStandingsRound(T.rounds[T.curRound + 1]));
  var cutoffTie = isLastStandingsRound ? detectQualCutoffTie() : null;
  var tiedNames = cutoffTie && !isTieResolved(cutoffTie.key, cutoffTie) ? cutoffTie.players.map(p => p.name) : [];
  var title = isSwiss ? 'Swiss Standings' : 'Qualification Table';
  var html = '<div class="card"><div class="card-title">' + title + ' <span style="color:var(--muted);font-weight:400;font-size:10px">— lower Fair Points = better</span></div>' +
    '<div style="overflow-x:auto"><table class="gs-table"><thead><tr>' +
    `<th>#</th><th>${esc(descriptor.format.unitLabel)}</th><th>Fair Points</th><th>Total Score</th><th>Rounds</th><th>Status</th>` +
    '</tr></thead><tbody>';
  T.qualTable.forEach((p, i) => {
    var rank = i + 1, passes = rank <= qualAdv;
    var isTied = tiedNames.indexOf(p.name) !== -1;
    html += `<tr class="${isTied?'tie-row':passes?'pass-row':'out-row'}">
      <td><span class="rank-cell">${rank}</span></td>
      <td>${renderUnitCell(T, p.name, false)}</td>
      <td><span class="pts-cell">${p.totalFP !== null ? p.totalFP.toFixed(5) : '—'}</span></td>
      <td>${p.totalScore || 0}</td>
      <td>${p.played}/${totalPoolRounds}</td>
      <td>${isTied ? '<span class="pill pill-tie">⚠ Tie</span>' :
           p.totalFP===null ? '<span class="pill pill-neut">No scores</span>' :
           passes ? '<span class="pill pill-adv">✔ Advances</span>' :
                    '<span class="pill pill-elim">✘ Eliminated</span>'}</td></tr>`;
  });
  html += '</tbody></table></div></div>';
  return html;
}

// Genuinely new renderer, not forced into renderStandingsTable()'s
// single-list assumption (see "Group stage" in HANDOFF.md, Part 5) — K
// separate small tables, one per group, each shaped like the standings
// table above but headed "Group A"/"Group B"/... and cut at
// qualifiersPerGroup instead of one global qualAdv. No "played / of N"
// column here (unlike renderStandingsTable()'s) — a mixed group-size
// distribution can give different groups genuinely different round-robin
// lengths (see "Group stage" in HANDOFF.md), so one shared denominator
// would misrepresent some groups' own totals; each row's `played` count
// alone is still shown, just without an implied common denominator.
function renderGroupStandingsTables() {
  var descriptor = getGamemodeDescriptor();
  var qpg = T.cfg.qualifiersPerGroup || 2;
  var cr = T.rounds[T.curRound];
  var isLastGroupStageRound = cr && cr.isGroupStage && !(T.rounds[T.curRound + 1] && T.rounds[T.curRound + 1].isGroupStage);
  var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">';
  T.groups.forEach(g => {
    var table = T.groupStandings[g.label] || [];
    var cutoffTie = isLastGroupStageRound ? detectGroupCutoffTie(g.label) : null;
    var tiedNames = cutoffTie && !isTieResolved(cutoffTie.key, cutoffTie) ? cutoffTie.players.map(p => p.name) : [];
    html += '<div class="card"><div class="card-title">Group ' + esc(g.label) + ' <span style="color:var(--muted);font-weight:400;font-size:10px">— lower FP = better</span></div>' +
      '<div style="overflow-x:auto"><table class="gs-table"><thead><tr>' +
      `<th>#</th><th>${esc(descriptor.format.unitLabel)}</th><th>FP</th><th>Score</th><th>Pld</th><th>Status</th>` +
      '</tr></thead><tbody>';
    table.forEach((p, i) => {
      var rank = i + 1, passes = rank <= qpg;
      var isTied = tiedNames.indexOf(p.name) !== -1;
      html += `<tr class="${isTied?'tie-row':passes?'pass-row':'out-row'}">
        <td><span class="rank-cell">${rank}</span></td>
        <td>${renderUnitCell(T, p.name, false)}</td>
        <td><span class="pts-cell">${p.totalFP !== null ? p.totalFP.toFixed(5) : '—'}</span></td>
        <td>${p.totalScore || 0}</td>
        <td>${p.played}</td>
        <td>${isTied ? '<span class="pill pill-tie">⚠ Tie</span>' :
             p.totalFP===null ? '<span class="pill pill-neut">No scores</span>' :
             passes ? '<span class="pill pill-adv">✔ Advances</span>' :
                      '<span class="pill pill-elim">✘ Eliminated</span>'}</td></tr>`;
    });
    html += '</tbody></table></div></div>';
  });
  html += '</div>';
  return html;
}

// ═══════════════════════════════════════════════════════════════
// SCOREBOARD & BRACKET — Scoreboard (live only; shows the current round,
//  partial scores included — unlike Bracket, does not gate on completion)
// ═══════════════════════════════════════════════════════════════
// One row per roster unit — a player for individual formats, a team (name +
// derived score) for team formats; see renderUnitCell()/getUnitScore().
function renderScoreboard() {
  if (!T.rounds.length) return;
  document.getElementById('sb-empty').style.display = 'none';
  document.getElementById('sb-content').style.display = 'block';

  var formatDescriptor = getGamemodeDescriptor().format;
  var ri = T.curRound, round = T.rounds[ri], asgn = T.assignments[ri] || [];
  var lbl = round.isFinal ? '🏆 Grand Final' : round.isSemis ? '⚔ Semi-Finals' : 'Round '+round.roundNum;
  document.getElementById('sb-summary').innerHTML =
    statEl('Round', lbl, 'cyan') + statEl(formatDescriptor.unitLabelPlural, asgn.length) +
    statEl('Rooms', round.rooms.length) +
    statEl('Advancing', round.isNoElim?'All':(round.isFinal?'—':round.advTotal));

  var sqt = document.getElementById('sb-qual-table');
  if (T.rounds.slice(0, ri + 1).some(r => r.isGroupStage)) {
    sqt.style.display = 'block'; sqt.innerHTML = renderGroupStandingsTables();
  } else if (T.cfg.poolingPhase !== 'none' && T.rounds.slice(0, ri + 1).some(r => isStandingsRound(r))) {
    sqt.style.display = 'block'; sqt.innerHTML = renderStandingsTable();
  } else sqt.style.display = 'none';

  var lls = computeLuckyLosers(ri, round);
  var html = '';
  for (var rm = 1; rm <= round.rooms.length; rm++) {
    var players = asgn.filter(a => a.room === rm);
    var thisAdv = round.isNoElim || round.isFinal ? players.length : round.advPerRoom;
    var withScores = players.map((p, pi) => ({ name: p.name, score: getUnitScore(T, ri, rm, pi, null) }));
    var ranked = orderRoomByScore(withScores.filter(p => p.score !== null), ri, rm)
      .concat(withScores.filter(p => p.score === null));
    var sbRoomHeading = round.isGroupStage ? 'Group ' + esc(round.roomGroups[rm - 1]) + ' · Room ' + roomLabel(rm) : 'Room ' + roomLabel(rm);
    html += `<div class="room-block"><div class="room-header"><div class="room-name">${sbRoomHeading}</div><div class="room-meta">Top ${round.isNoElim?'all':thisAdv} advance</div></div>
      <table><thead><tr><th>Pos</th><th>${esc(formatDescriptor.unitLabel)}</th><th>Score</th><th>Status</th></tr></thead><tbody>`;
    ranked.forEach((p, i) => {
      // A lucky-loser candidate merges cleanly into "Advances" here — the
      // ★ Lucky Loser badge is Bracket's job now (on the round where the
      // decision actually happened), not Scoreboard's, which only ever
      // shows "the only thing that matters is that they're qualified."
      var rank = i + 1, adv = round.isNoElim || rank <= thisAdv || lls.includes(p.name);
      var cls = p.score !== null ? (adv ? 'adv-row' : 'elim-row') : '';
      var pill = p.score === null ? '<span class="pill pill-neut">—</span>' :
                 adv ? '<span class="pill pill-adv">Advances</span>' :
                       '<span class="pill pill-elim">Eliminated</span>';
      html += `<tr class="${cls}"><td><span class="pos-num${p.score!==null&&adv?' top':''}">${p.score!==null?rank:'—'}</span></td>
        <td>${renderUnitCell(T, p.name, true, ri)}</td><td style="font-family:var(--font-d);font-size:18px;font-weight:700">${p.score!==null?p.score:'—'}</td>
        <td>${pill}</td></tr>`;
    });
    html += '</tbody></table></div>';
  }
  // Bye recipient for this round ("Bye" odd-count strategy) — advancing, no
  // score, and never inside any room's table above (a room:null entry never
  // matches the per-room filter those tables are built from).
  if (T.byes && T.byes[ri] && T.byes[ri].length) {
    T.byes[ri].forEach(function (byeUnit) {
      html += `<div class="sb-bye-card"><span class="sb-bye-label">BYE</span><span class="sb-bye-name">${esc(unitDisplay(T, byeUnit).label)}</span><span class="pill pill-adv" style="margin-left:auto">Advances</span></div>`;
    });
  }
  document.getElementById('sb-rooms').innerHTML = html;
}

// --- Scoreboard & Bracket: Bracket Overview ---
// SHARED builder below (buildBracketHtml) — pure HTML builder that takes any
// tournament-shaped state object (the live T, or an archived snapshot) and
// returns the bracket columns markup. No DOM access here, so it's safe to
// reuse for the read-only Archive detail view (see ARCHIVE RENDERING).
// renderBracket() further down is the live-only DOM-writing wrapper.
// state carries gameFormat/scheduleLogic/gamemodeConfig alongside the rest of
// the tournament data (live T or an archived snapshot), so a format-aware
// label change here would read state.gameFormat the same way computeRankings
// already reads other state fields — no separate parameter needed. No
// dynamic "Player" text exists in this builder's output today (bracket cards
// show names directly, no table header), so there's nothing to wire up yet.
function buildBracketHtml(state) {
  var html = '';
  var teamSize = getGamemodeDescriptorFor(state).format.teamSize;
  // Local per-bracket round counters for double-elimination's own column
  // labels ("WB Round 1", "LB Round 2", ...) — derived here at render time
  // from round.bracket rather than stored per round, same "compute from
  // existing structure" preference as the rest of this app (see "Double
  // elimination" Part 5 in HANDOFF.md).
  var wbCounter = 0, lbCounter = 0;
  state.rounds.forEach((round, ri) => {
    var asgn = state.assignments[ri] || [];
    var isCurrent = ri === state.curRound;
    var isPast    = ri < state.curRound;
    // Lucky-loser record for round ri's OWN card: T.luckyLosers[ri+1] is
    // written by advanceRound() for the round arrived INTO — i.e. it's the
    // record of who was saved advancing OUT OF round ri, which is exactly
    // the round whose card should show it (the decision happened because of
    // ri's own results, not ri+1's — by the next round it's irrelevant that
    // someone got there as a lucky loser). Round ri+1's card intentionally
    // never looks at luckyLosers at all; a unit who arrived as a lucky
    // loser is shown there exactly like any other participant.
    var lls = state.luckyLosers[ri + 1] || [];

    // Tie-break badge (new — first time this appears in Bracket): every
    // participant belonging to a cluster this round has an entry for in
    // state.tieResolutions (i.e. was actually surfaced/addressed) gets a
    // small "TB" marker on round ri's own card, same "belongs to this
    // round's own outcome" rule as the lucky-loser marker above.
    var tieClusters = detectTieBreaks(ri, round, state);
    var tbNames = new Set();
    Object.keys(state.tieResolutions || {}).forEach(k => {
      if (k.indexOf(`r${ri}-`) !== 0) return;
      var cluster = tieClusters[k];
      if (cluster) cluster.players.forEach(p => tbNames.add(p.name));
    });

    var hdrAccentCls = '';
    var rLabel;
    if (round.bracket === 'winners') { wbCounter++; rLabel = 'WB Round ' + wbCounter; hdrAccentCls = ' wb-hdr'; }
    else if (round.bracket === 'losers') { lbCounter++; rLabel = 'LB Round ' + lbCounter; hdrAccentCls = ' lb-hdr'; }
    else if (round.bracket === 'grand-final') { rLabel = '🏆 Grand Final'; hdrAccentCls = ' gf-hdr'; }
    else {
      rLabel = round.isFinal ? '🏆 Final' : round.isSemis ? '⚔ Semis' :
               round.isQual ? 'Round '+round.roundNum+' (Qual)' :
               round.isSwiss ? 'Round '+round.roundNum+' (Swiss)' :
               round.isGroupStage ? 'Round '+round.roundNum+' (Group)' : 'Round '+round.roundNum;
    }
    html += `<div class="bracket-round-col">
      <div class="bracket-round-hdr${isCurrent?' current-hdr':''}${hdrAccentCls}">${rLabel}</div>`;

    if (!asgn.length) {
      html += `<div style="color:var(--muted);font-size:12px;padding:8px">Not yet seeded</div>`;
    } else {
      for (var rm = 1; rm <= round.rooms.length; rm++) {
        var players = asgn.filter(a => a.room === rm);
        var thisAdv = round.isNoElim || round.isFinal ? players.length : round.advPerRoom;
        // Group stage: label each room card with its owning group (round.
        // roomGroups[rm-1]) instead of a bare room letter, since "Room A"
        // alone doesn't say which of the K groups it belongs to.
        var roomHeading = round.isGroupStage ? 'Group ' + esc(round.roomGroups[rm - 1]) + ' · Room ' + roomLabel(rm) : 'Room ' + roomLabel(rm);
        html += `<div class="bracket-room-card"><div class="bracket-room-name">${roomHeading}</div>`;

        var scoredList = players.map((p, pi) => ({ name: p.name, score: getUnitScore(state, ri, rm, pi, null) }));
        // Only reveal a room's scores/outcome once every player in it has a
        // score entered — a partially-scored room shows exactly as it did
        // before any scores existed (plain list, no colours, no numbers).
        var roomComplete = scoredList.length > 0 && scoredList.every(p => p.score !== null);
        var showResults = (isPast || isCurrent) && roomComplete;

        var display = showResults ? orderRoomByScore(scoredList, ri, rm, state) : scoredList.slice();

        display.forEach((p, i) => {
          var rank = i + 1;
          var adv = round.isNoElim || rank <= thisAdv;
          var isLL = lls.includes(p.name);
          var isTB = tbNames.has(p.name);
          // A lucky-loser candidate always renders as the purple "lucky"
          // state on its own round's card, regardless of adv — by
          // definition they rank outside the direct cutoff (adv false)
          // here but did actually advance via this mechanism.
          var cls = showResults ? (isLL ? 'lucky' : adv ? 'adv' : 'elim') : '';
          var tbBadge = showResults && isTB ? ' <span class="bracket-tb-badge" title="Tie-break resolved this round">⚖ TB</span>' : '';
          if (teamSize) {
            var info = unitDisplay(state, p.name);
            html += `<div class="bracket-team-row ${cls}">
              <div class="bracket-team-line1">
                <span class="bracket-team-name">${showResults && isLL ? '★ ' : ''}${esc(info.label)}${tbBadge}</span>
                ${showResults ? `<span class="bracket-score">${p.score}</span>` : ''}
              </div>
              <div class="bracket-team-members">${markedMemberNames(state, p.name, ri, info.members || []).join(', ')}</div>
            </div>`;
          } else {
            html += `<div class="bracket-player-row ${cls}">
              <span>${showResults && isLL ? '★ ' : ''}${renderUnitCell(state, p.name, false)}${tbBadge}</span>
              ${showResults ? `<span class="bracket-score">${p.score}</span>` : ''}
            </div>`;
          }
        });
        html += '</div>';
      }
      // Bye recipient for this round ("Bye" odd-count strategy) — no room
      // card is generated for them; they get a distinct small card instead,
      // after all of this round's real rooms.
      if (state.byes && state.byes[ri] && state.byes[ri].length) {
        state.byes[ri].forEach(function (byeUnit) {
          html += `<div class="bracket-bye-card"><span class="bracket-bye-label">BYE</span>${esc(unitDisplay(state, byeUnit).label)}</div>`;
        });
      }
    }
    html += '</div>';
  });
  return html;
}

// No separate mode parameter needed here — buildBracketHtml(state) already
// takes the full state object, which now carries gameFormat/scheduleLogic/
// gamemodeConfig alongside everything else, live T included.
function renderBracket() {
  if (!T.rounds.length) return;
  document.getElementById('br-empty').style.display = 'none';
  document.getElementById('br-content').style.display = 'block';
  document.getElementById('br-rounds').innerHTML = buildBracketHtml(T);
}

// ═══════════════════════════════════════════════════════════════
// PLAYERS & RANKINGS — Players View (live only)
// ═══════════════════════════════════════════════════════════════
function renderPlayers() {
  if (!T.players.length && !T.reserves.length) return;
  document.getElementById('pl-empty').style.display = 'none';
  document.getElementById('pl-content').style.display = 'block';

  // Roster loaded but no schedule generated yet — show a plain registration list.
  if (!T.rounds.length) {
    var html0 = '';
    var byLabel = (a, b) => unitDisplay(T, a).label.localeCompare(unitDisplay(T, b).label);
    rosterKeys(T.players).slice().sort(byLabel).forEach(key => {
      html0 += playerCard(key, '<span class="pill pill-neut">Registered — not started yet</span>');
    });
    rosterKeys(T.reserves).slice().sort(byLabel).forEach(key => {
      html0 += playerCard(key, '<span class="pill pill-neut">Reserve</span>');
    });
    document.getElementById('pl-list').innerHTML = html0;
    return;
  }

  // Find each roster unit's current round/room — mirrors computeRankings()'s
  // exact elimination rule (present in round ri's assignment but absent from
  // ri+1's, where ri+1 actually exists) instead of the score-completeness
  // proxy this used to use, which showed a unit as "Eliminated" the moment
  // their room was fully scored, even before the organiser clicked Next
  // Round. Find each unit's LATEST assignment round (later rounds always
  // supersede earlier ones here, so a plain overwrite is correct — no
  // "were they in the next round" check needed per iteration); a unit whose
  // latest appearance IS the last round that currently has any assignment
  // at all is still active/in progress, regardless of score completeness —
  // anyone whose latest appearance is an *earlier* round is eliminated
  // (a later round's assignment exists and doesn't include them).
  var lastRi = lastAssignedRound(T);
  var latestAppearance = {};
  for (var ri = 0; ri <= lastRi; ri++) {
    var asgn = T.assignments[ri] || [];
    var round = T.rounds[ri];
    asgn.forEach(p => {
      latestAppearance[p.name] = { round, ri, room: p.room, isLucky: p.isLucky || false };
    });
  }
  var playerStatus = {};
  rosterKeys(T.players).forEach(key => { playerStatus[key] = null; });
  Object.keys(latestAppearance).forEach(key => {
    if (latestAppearance[key].ri === lastRi) playerStatus[key] = latestAppearance[key];
  });

  var fpMap = {};
  if (T.cfg.poolingPhase === 'group-stage') {
    // No single global ranking exists for group stage — each unit's rank
    // is local to its own group's table, not comparable to another
    // group's rank 1 the way a flat qual/Swiss table's rank is.
    Object.keys(T.groupStandings).forEach(label => {
      (T.groupStandings[label] || []).forEach((p, i) => { fpMap[p.name] = { rank: i + 1, fp: p.totalFP, groupLabel: label }; });
    });
  } else if (T.cfg.poolingPhase !== 'none') {
    T.qualTable.forEach((p, i) => { fpMap[p.name] = { rank: i+1, fp: p.totalFP }; });
  }

  var allPlayers = [...new Set([...rosterKeys(T.players), ...Object.keys(playerStatus).filter(n => playerStatus[n])])];
  var sorted = allPlayers.slice().sort((a, b) => unitDisplay(T, a).label.localeCompare(unitDisplay(T, b).label));

  var html = '';
  sorted.forEach(key => {
    var status = playerStatus[key];
    var fp = fpMap[key];

    var statusHtml = '';
    if (!status) {
      statusHtml = '<span class="pill pill-elim">Eliminated</span>';
    } else {
      var rn = status.round.roundNum;
      var roundName = status.round.isFinal ? 'Final' : status.round.isSemis ? 'Semis' : 'Round '+rn;
      // status.isLucky data stays (harmless) but is no longer rendered here —
      // the ★ Lucky Loser marker belongs on Bracket's round-of-origin card
      // now, not on the Players tab's "current status" view. A bye entry
      // (room:null, "Bye" odd-count strategy) has no room to show — same
      // "advancing automatically, no room this round" wording as Scoreboard/
      // Admin's own bye cards, rather than a broken roomLabel(null).
      var whereHtml = status.room === null
        ? '<strong style="color:var(--amber)">BYE</strong> — advances automatically'
        : `Room <strong>${roomLabel(status.room)}</strong>`;
      statusHtml = `<div class="p-room"><span class="p-rnd">${roundName}</span> — ${whereHtml}</div>`;
    }

    var fpRankLabel = fp && fp.groupLabel ? 'Grp ' + fp.groupLabel + ' #' + fp.rank : fp ? '#' + fp.rank : '';
    var fpHtml = fp ? `<span class="p-pts" style="font-size:11px;color:var(--amber)">${fpRankLabel}${fp.fp!==null?' · '+fp.fp.toFixed(3)+' FP':''}</span>` : '';

    html += playerCard(key, statusHtml, fpHtml, !status);
  });
  document.getElementById('pl-list').innerHTML = html;
}

function filterPlayers() {
  var q = document.getElementById('pl-search').value.toLowerCase();
  document.querySelectorAll('.player-card-v').forEach(c => {
    c.style.display = c.querySelector('.p-name').textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

// key is a roster identity (a player name, or a team's teamId) — resolved to
// a display label (+ member names, for team formats) via unitDisplay().
// Avatar initials come from the resolved label, not the raw key, so a team
// format shows initials from the team name rather than an opaque teamId.
function playerCard(key, statusHtml, fpHtml, isOut) {
  var info = unitDisplay(T, key);
  var init = info.label.split(/[\s_\-]+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '?';
  var nameHtml = info.members
    ? `<div class="p-name">${esc(info.label)}</div><div style="font-size:11px;color:var(--muted)">${info.members.map(esc).join(' & ')}</div>`
    : `<div class="p-name">${esc(info.label)}</div>`;
  return `<div class="player-card-v">
    <div class="p-avatar">${init}</div>
    <div class="p-info">
      ${nameHtml}
      ${statusHtml}
    </div>
    ${fpHtml || ''}
    <div class="p-status">${isOut ? '<span class="pill pill-elim">Out</span>' : ''}</div>
  </div>`;
}

function roundShortLabel(round) {
  return round.isFinal ? '🏆 Final' : round.isSemis ? '⚔ Semis' :
         round.isQual  ? 'Qual R' + round.roundNum :
         round.isSwiss ? 'Swiss R' + round.roundNum :
         round.isGroupStage ? 'Group R' + round.roundNum : 'Round ' + round.roundNum;
}

// Pure HTML builder for the rankings table body — takes computeRankings()'s
// output, not a state object directly, since both live and archive callers
// already have that computed. No DOM access, safe to reuse for archive.
// Rows carry a resolved `label` (+ `members`, for team formats) attached by
// computeRankings() — this stays a pure display layer with no format lookup
// of its own.
function rankingUnitCell(entry) {
  var html = entry.members ? '<strong>' + esc(entry.label) + '</strong>' : esc(entry.label);
  if (entry.members) html += '<div style="font-size:10px;color:var(--muted);margin-top:2px">' + entry.members.map(esc).join(' &amp; ') + '</div>';
  return html;
}

// Block-level "row" (not a <tr> — see the .rk-columns CSS comment) so rows
// can flow into a CSS column-width container. rankHtml/badgeHtml are
// pre-built fragments since what goes in each varies by section (a
// still-active unit has no rank; a finalist/eliminated unit does).
function rankingRowHtml(rankHtml, entry, badgeHtml, extraCls) {
  return `<div class="rk-row${extraCls ? ' ' + extraCls : ''}">
    <span class="rk-rank">${rankHtml}</span>
    <span class="rk-unit">${rankingUnitCell(entry)}</span>
    ${badgeHtml}
  </div>`;
}

// Still-active and ranked (finalists + eliminated) are two INDEPENDENT
// column-flow blocks, not one shared one — otherwise the section title
// between them could land at the bottom of one column while its own
// section's rows start in the next, which reads as broken.
function buildRankingsRows(data) {
  var activeHtml = data.stillActive.map(u =>
    rankingRowHtml('—', u, '<span class="pill pill-neut">Still in tournament</span>', 'rk-active')
  ).join('');

  var rankedRows = [];
  if (data.finalComplete) {
    data.finalists.forEach(f => {
      rankedRows.push(rankingRowHtml(
        `<span class="pos-num${f.rank === 1 ? ' top' : ''}">${f.rank}</span>`,
        f, '<span class="pill pill-final">🏆 Reached Final</span>',
        f.rank === 1 ? 'rk-champion' : ''
      ));
    });
  }
  data.eliminatedList.forEach(e => {
    rankedRows.push(rankingRowHtml(
      `<span class="pos-num">${e.rank}</span>`,
      e, `<span class="pill pill-neut">${esc(roundShortLabel(e.round))}</span>`, ''
    ));
  });

  var out = '';
  if (activeHtml) out += `<div class="rk-section-title">Still in tournament</div><div class="rk-columns">${activeHtml}</div>`;
  if (rankedRows.length) out += `<div class="rk-section-title">Final standings</div><div class="rk-columns">${rankedRows.join('')}</div>`;
  return out || '<div style="text-align:center;color:var(--muted);padding:20px">No data yet.</div>';
}

// Live-only wrapper around the two shared builders above.
function renderRankings() {
  var data = computeRankings();
  var empty = document.getElementById('rk-empty'), content = document.getElementById('rk-content');
  if (!data) { empty.style.display = 'block'; content.style.display = 'none'; return; }
  empty.style.display = 'none';
  content.style.display = 'block';
  document.getElementById('rk-list').innerHTML = buildRankingsRows(data);
}

// ═══════════════════════════════════════════════════════════════
// RANKINGS IMAGE EXPORT — a shareable PNG of the rankings table, for
//  pasting into Discord/Website posts. Hand-drawn on a <canvas> rather
//  than rasterising the live DOM, since the app has no external JS
//  libraries and no backend to render with — this is the vanilla-canvas
//  equivalent of downloadJson()'s "build a blob, trigger an anchor
//  download" pattern below, just for image/png instead of
//  application/json. Colours are the same hex values as the CSS custom
//  properties in <style> — canvas can't read CSS vars, so they're
//  mirrored here as literals; keep the two in sync if the theme changes.
// ═══════════════════════════════════════════════════════════════
var RANK_IMG_COLORS = {
  bg: '#0D0F14', border: '#252D3D', cyan: '#00E5FF',
  green: '#00E096', text: '#E8EDF5', muted: '#6B7A99'
};

// Truncates text to fit maxWidth (in the ctx's current font), appending an
// ellipsis, via binary search over string length — avoids a linear
// character-by-character measureText() scan for long names.
function truncateToWidth(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  var lo = 0, hi = text.length;
  while (lo < hi) {
    var mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + '…';
}

// Path for a rounded rect, used for the status pill behind each row — falls
// back to manual arcs on the rare browser without native ctx.roundRect().
function tracePillPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
}

// Builds the rankings graphic for `state` (live T or an archived snapshot)
// as an offscreen <canvas>, reusing computeRankings() so the image can never
// disagree with what's on-screen. Rendered at 2x and downscaled via CSS-less
// canvas pixel dimensions for a crisp export on high-DPI displays / Discord
// embeds. Returns null if there's no ranking data yet (no schedule/no
// assignments) — callers should tell the organiser rather than download a
// blank image.
// Row count -> column count for a rankings section, mirroring the DOM's
// column-width-driven "up to 3, collapsing to fewer" behavior — the canvas
// has no viewport to auto-collapse against, so column count is chosen
// directly from how many rows actually need to fit (few rows in narrow
// columns reads as sparse/cramped, not efficient).
function pickRankColumnCount(n) {
  if (n <= 6) return 1;
  if (n <= 14) return 2;
  return 3;
}

// Lays out one rankings section (still-active, or ranked) into up to 3
// newspaper-style columns (column 1 filled top-to-bottom, then column 2,
// etc. — same fill order CSS column-width uses) and returns everything
// needed to draw it: how many columns, how wide each one is, and the pixel
// height the section occupies (rowsPerColumn * rowH) so the caller can
// stack sections vertically without guessing.
function layoutRankSection(rows, usableW, colGap, rowH) {
  var cols = pickRankColumnCount(rows.length);
  var colW = (usableW - colGap * (cols - 1)) / cols;
  var rowsPerCol = Math.ceil(rows.length / cols);
  return { cols: cols, colW: colW, rowsPerCol: rowsPerCol, height: rowsPerCol * rowH, rows: rows };
}

// Draws one row (rank, badge, name — no value column, dropped along with
// the DOM's "Relative score" column) at (x, y) within a colW-wide column.
function drawRankRow(ctx, r, x, y, colW, rowH) {
  if (r.champion) {
    ctx.fillStyle = 'rgba(0,224,150,0.08)';
    ctx.fillRect(x - 6, y, colW + 6, rowH - 2);
    ctx.fillStyle = RANK_IMG_COLORS.green;
    ctx.fillRect(x - 6, y, 3, rowH - 2);
  }
  var midY = y + rowH / 2 + 4;

  ctx.font = (r.champion ? '700 16px' : '700 13px') + ' Rajdhani';
  ctx.fillStyle = r.champion ? RANK_IMG_COLORS.green : RANK_IMG_COLORS.muted;
  ctx.textAlign = 'center';
  ctx.fillText(r.rank !== null ? String(r.rank) : '—', x + 12, midY);
  ctx.textAlign = 'left';

  ctx.font = '600 10px Inter';
  var badgeW = ctx.measureText(r.badge).width + 16;
  var badgeX = x + colW - badgeW;
  ctx.fillStyle = RANK_IMG_COLORS.muted + '22';
  tracePillPath(ctx, badgeX, y + rowH / 2 - 9, badgeW, 18, 9);
  ctx.fill();
  ctx.fillStyle = RANK_IMG_COLORS.muted;
  ctx.textAlign = 'center';
  ctx.fillText(r.badge, badgeX + badgeW / 2, y + rowH / 2 + 3);
  ctx.textAlign = 'left';

  ctx.font = (r.champion ? '600 13px' : '400 12px') + ' Inter';
  ctx.fillStyle = RANK_IMG_COLORS.text;
  ctx.fillText(truncateToWidth(ctx, r.name, badgeX - 8 - (x + 26)), x + 26, midY);
}

async function buildRankingsImageCanvas(state) {
  var data = computeRankings(state);
  if (!data) return null;

  // Ensure the actual font files are loaded before measuring/drawing text —
  // canvas silently falls back to a system font if the requested one isn't
  // marked ready yet, which would make the export inconsistent with the
  // live page (which has almost certainly already triggered these loads,
  // but don't rely on incidental timing).
  await Promise.all([
    document.fonts.load('700 20px Rajdhani'),
    document.fonts.load('700 14px Rajdhani'),
    document.fonts.load('600 17px Inter'),
    document.fonts.load('600 11px Inter'),
    document.fonts.load('500 12px Inter'),
    document.fonts.load('400 13px Inter')
  ]).catch(function () {});

  // Team formats fold member names into the drawn name string ("Team Rocket
  // (Ash & Misty)") since the canvas layout has one name slot per row, not a
  // separate sub-line like the HTML card.
  function rowName(entry) {
    return entry.members ? entry.label + ' (' + entry.members.join(' & ') + ')' : entry.label;
  }
  var activeRows = data.stillActive.map(function (u) {
    return { rank: null, name: rowName(u), badge: 'STILL IN TOURNAMENT', champion: false };
  });
  var rankedRows = [];
  if (data.finalComplete) {
    data.finalists.forEach(function (f) {
      rankedRows.push({ rank: f.rank, name: rowName(f), badge: 'REACHED FINAL', champion: f.rank === 1 });
    });
  }
  data.eliminatedList.forEach(function (e) {
    var round = e.round;
    var label = round.isFinal ? 'FINAL' : round.isSemis ? 'SEMIS' :
                round.isQual ? 'QUAL R' + round.roundNum :
                round.isSwiss ? 'SWISS R' + round.roundNum :
                round.isGroupStage ? 'GROUP R' + round.roundNum : 'ROUND ' + round.roundNum;
    rankedRows.push({ rank: e.rank, name: rowName(e), badge: label, champion: false });
  });

  // Wider than the original 720px single-column layout — needed to fit up
  // to 3 columns with badges comfortably; still a fixed-width export sized
  // reasonably for pasting into Discord or a website, not blown out.
  var W = 1100, padX = 36, padTop = 26, rowH = 34, headerH = 80, footerH = 34, colGap = 20, sectionTitleH = 24, sectionGap = 16;
  var usableW = W - padX * 2;

  var sections = [];
  if (activeRows.length) sections.push({ title: 'STILL IN TOURNAMENT', section: layoutRankSection(activeRows, usableW, colGap, rowH) });
  if (rankedRows.length) sections.push({ title: 'FINAL STANDINGS', section: layoutRankSection(rankedRows, usableW, colGap, rowH) });

  // Height is derived from rows-per-column now, not total row count — with
  // columns in play, total-row-count would produce far too much empty
  // vertical space (most of it never gets drawn into).
  var contentH = sections.reduce(function (sum, s) { return sum + sectionTitleH + s.section.height + sectionGap; }, 0);
  var H = padTop + headerH + contentH + footerH;

  var scale = 2;
  var canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  var ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  ctx.fillStyle = RANK_IMG_COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  // Header: logo, player/round count, tournament title, section label
  ctx.font = '700 22px Rajdhani';
  ctx.fillStyle = RANK_IMG_COLORS.cyan;
  ctx.fillText('CURVE', padX, padTop + 18);
  var curveW = ctx.measureText('CURVE ').width;
  ctx.fillStyle = RANK_IMG_COLORS.text;
  ctx.fillText('FFA', padX + curveW, padTop + 18);

  ctx.font = '500 12px Inter';
  ctx.fillStyle = RANK_IMG_COLORS.muted;
  ctx.textAlign = 'right';
  var unitPlLower = (getGamemodeDescriptorFor(state).format || {}).unitLabelPlural || 'Players';
  ctx.fillText((state.players || []).length + ' ' + unitPlLower.toLowerCase() + ' · ' + (state.rounds || []).length + ' rounds', W - padX, padTop + 16);
  ctx.textAlign = 'left';

  ctx.font = '600 17px Inter';
  ctx.fillStyle = RANK_IMG_COLORS.text;
  ctx.fillText(truncateToWidth(ctx, (state.title || '').trim() || 'Unnamed Tournament', W - padX * 2), padX, padTop + 48);

  ctx.font = '600 11px Inter';
  ctx.fillStyle = RANK_IMG_COLORS.muted;
  ctx.fillText('FINAL RANKINGS', padX, padTop + 68);

  ctx.strokeStyle = RANK_IMG_COLORS.border;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(padX, padTop + headerH); ctx.lineTo(W - padX, padTop + headerH); ctx.stroke();

  // Sections — each own column-flow block, stacked vertically, same
  // structural split as the DOM (still-active first, ranked below).
  var y = padTop + headerH + 8;
  sections.forEach(function (s) {
    ctx.font = '600 11px Inter';
    ctx.fillStyle = RANK_IMG_COLORS.muted;
    ctx.fillText(s.title, padX, y + 10);
    y += sectionTitleH;

    var sec = s.section;
    for (var c = 0; c < sec.cols; c++) {
      var colX = padX + c * (sec.colW + colGap);
      var colRows = sec.rows.slice(c * sec.rowsPerCol, (c + 1) * sec.rowsPerCol);
      var ry = y;
      colRows.forEach(function (r) {
        drawRankRow(ctx, r, colX, ry, sec.colW, rowH);
        ry += rowH;
      });
    }
    y += sec.height + sectionGap;
  });

  // Footer
  ctx.strokeStyle = RANK_IMG_COLORS.border;
  ctx.beginPath(); ctx.moveTo(padX, y + 6); ctx.lineTo(W - padX, y + 6); ctx.stroke();
  ctx.font = '500 10px Inter';
  ctx.fillStyle = RANK_IMG_COLORS.muted;
  ctx.textAlign = 'center';
  ctx.fillText('Generated by Curve FFA Tournament · ' + new Date().toLocaleDateString(), W / 2, y + 22);
  ctx.textAlign = 'left';

  return canvas;
}

// ═══════════════════════════════════════════════════════════════
//  AUTO-REFRESH — Scoreboard and Bracket poll the same in-memory
//  state every 5s so viewers don't need to manually switch tabs to
//  see updates. Only whichever of those two tabs is currently active
//  gets re-rendered (Admin, Players, Rankings are untouched here —
//  Players/Rankings still only refresh on tab visit). Reads T
//  directly, same as every other render call — no separate polling
//  or storage reads, and no saveState() call, since nothing changes.
// ═══════════════════════════════════════════════════════════════
setInterval(function() {
  var activeTab = getActiveTab();
  if (activeTab === 'scoreboard') renderScoreboard();
  else if (activeTab === 'bracket') renderBracket();
}, 5000);
