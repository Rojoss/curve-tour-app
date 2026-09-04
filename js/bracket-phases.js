// bracket-phases.js — every BRACKET_PHASES implementation (classic, single-
// and double-elimination) plus the SCHEDULE_LOGICS/POOLING_PHASES/
// BRACKET_PHASES/BRACKET_PHASE_MIN_UNITS registries.
// Load order: must come after pooling-phases.js (POOLING_PHASES references
// its functions) AND after advancement.js (SCHEDULE_LOGICS references
// roomBasedComputeAdvancement directly, at load time, not inside a function
// body — found during the multi-file split, see HANDOFF.md).

var SCHEDULE_LOGICS = {
  'classic-elimination': {
    label: 'Classic elimination',
    buildProgression: composedBuildProgression,
    computeAdvancement: roomBasedComputeAdvancement
  },
  'single-elimination': {
    label: 'Single elimination',
    // Same orchestrator, same room-based advancement — both are already
    // fully generic (they read gamemodeConfig.poolingPhase/bracketPhase and
    // round.isNoElim/advPerRoom/luckyCount, nothing classic-elimination-
    // specific baked in), so single-elimination reuses them verbatim rather
    // than duplicating. See "Phase composability refactor" and "True
    // single-elimination bracket phase" in HANDOFF.md.
    buildProgression: composedBuildProgression,
    computeAdvancement: roomBasedComputeAdvancement
  },
  'double-elimination': {
    label: 'Double elimination',
    // Same orchestrator (composedBuildProgression is unaware of what the
    // bracket phase itself looks like — it just concatenates whatever
    // doubleEliminationBracketPhase returns, see "Double elimination" in
    // HANDOFF.md). computeAdvancement here is roomBasedComputeAdvancement,
    // same as every other entry — NOT doubleEliminationComputeAdvancement.
    // This registry entry is only ever reached generically for a round that
    // ISN'T round.bracket-tagged (a pooling-phase round — warmup/qual/Swiss
    // — feeding into this bracket phase), which still needs the ordinary
    // room-based/qual-cutoff computation. Every round.bracket-tagged round
    // (WB/LB/grand-final) is intercepted by advanceRound()'s own early
    // dispatch to advanceDoubleEliminationRound() before this is ever
    // reached — doubleEliminationComputeAdvancement is called directly from
    // there instead, never through this registry.
    buildProgression: composedBuildProgression,
    computeAdvancement: roomBasedComputeAdvancement
  }
  // future: 'kings-valley', 'group-knockout' — each would register its own
  // buildProgression/computeAdvancement pair here.
};

// PHASE COMPOSABILITY (2026-09-09 refactor — no new capability, see
// "Phase composability refactor" in HANDOFF.md): every tournament structure
// decomposes into two independent questions — how the field gets pooled/
// narrowed before the real bracket starts (a pooling phase), and what shape
// the elimination bracket itself is (a bracket phase). `composedBuild-
// Progression` (below) answers both with a thin orchestrator that calls one
// entry from each registry and concatenates the results — every schedule
// logic that composes a pooling phase with a bracket phase this way (today:
// both 'classic-elimination' and 'single-elimination' — see "True single-
// elimination bracket phase" in HANDOFF.md) reuses that same orchestrator
// and `roomBasedComputeAdvancement`, rather than each needing its own copy.
//
// Handoff interface: a pooling-phase function takes (cfg, descriptor) and
// returns { rounds, seedTotal, nextRoundNum } — rounds it built, how many
// units are actually entering the bracket phase, and which round number the
// bracket phase should continue numbering from. A bracket-phase function
// takes (seedTotal, startRoundNum, descriptor) and returns just the array of
// round objects it built, numbered starting at startRoundNum.
var POOLING_PHASES = {
  'qual-table': qualTablePoolingPhase,
  'swiss': swissPoolingPhase,
  'group-stage': groupStagePoolingPhase,
  'none': noElimWarmupPoolingPhase
};

var BRACKET_PHASES = {
  'classic-elimination': classicEliminationBracketPhase,
  'single-elimination': singleEliminationBracketPhase,
  'double-elimination': doubleEliminationBracketPhase
};

// Minimum viable seedTotal for each bracket phase, consulted by
// proceedGenerateSchedule()'s confirmed-count floor check instead of
// assuming classic-elimination's semisSize universally applies (see "True
// single-elimination bracket phase" in HANDOFF.md, Part 2). Takes the
// live-derived roomSize directly (not the full gamemodeConfig, which doesn't
// exist yet at floor-check time) since that's already how the existing
// floor check derives its own numbers pre-generation.
// - classic-elimination genuinely needs at least a full Semis' worth of
//   units (2 * roomSize.ideal) — below that there's no valid Semis to reach,
//   reproducing today's semisSize formula exactly, so no behaviour change.
// - single-elimination's floor is a flat, deliberately low constant — enough
//   for at least one real bracket round before the Final — not derived from
//   anything shape-specific. Provisional, not a settled number.
var BRACKET_PHASE_MIN_UNITS = {
  'classic-elimination': function (roomSize) { return 2 * roomSize.ideal; },
  'single-elimination': function (roomSize) { return 4; },
  // Same flat, provisional floor as single-elimination, same reasoning —
  // enough for one real winners-bracket round before the WB final. Also the
  // minimum that keeps doubleEliminationBracketPhase's own R>=2 assertion
  // satisfied (seedTotal>=4 always yields at least 2 WB rounds).
  'double-elimination': function (roomSize) { return 4; }
};

// Dispatcher — delegates to the current schedule logic's own progression
// builder (see SCHEDULE_LOGICS). Both registered schedule logics today
// ('classic-elimination', 'single-elimination') resolve to the same shared
// composedBuildProgression() below, since both compose a pooling phase with
// a bracket phase the same way — see "Phase composability refactor" in
// HANDOFF.md. A schedule logic built differently later (e.g. Kings Valley's
// promote/demote) would produce an entirely different round shape here
// without this dispatcher needing to change.
function buildProgression(cfg) {
  var descriptor = getGamemodeDescriptor();
  return descriptor.schedule.buildProgression(cfg, descriptor);
}

function computeElimRoundCount(total, floor) {
  if (total <= floor) return 0;
  var ideal = Math.log(floor / total) / Math.log(TARGET_ROUND_SURVIVAL_RATIO);
  // Math.ceil means the actual per-round cut ends up at least as gentle as
  // the target ratio, never steeper — except once MAX_ELIM_ROUNDS caps it for
  // very large fields, where a steeper-than-ideal cut is the accepted
  // tradeoff over an unbounded tournament length.
  return Math.min(Math.ceil(ideal), MAX_ELIM_ROUNDS);
}

// --- Pooling phases (see POOLING_PHASES above) ---
// Each takes (cfg, descriptor) and returns { rounds, seedTotal, nextRoundNum }.
// Pure relocation of composedBuildProgression's old steps 1/2 — the
// actual computation is byte-for-byte unchanged, just split into two
// independently-registered strategies instead of one function with a branch.

// --- Bracket phase (see BRACKET_PHASES above) ---
// Classic elimination: gradual cuts toward a fixed Semis/Final structure —
// pure relocation of composedBuildProgression's old steps 3–5
// (elimination rounds, Semis, Final); the actual computation (targets,
// bye-count adjustment, the Semis floor+remainder split, the Final's
// numGames) is byte-for-byte unchanged, just no longer tangled together with
// a pooling strategy's own rounds. Takes the pooling phase's handoff
// (seedTotal, startRoundNum) instead of assuming cfg.n/round 1.
function classicEliminationBracketPhase(seedTotal, startRoundNum, descriptor) {
  var roomSize = descriptor.config.roomSize;
  var oddCountStrategy = descriptor.config.oddCountStrategy;
  var FINAL = descriptor.config.finalSize, SEMIS = descriptor.config.semisSize;
  var total = seedTotal;
  var rounds = [], rn = startRoundNum;

  var numElim = computeElimRoundCount(total, SEMIS);
  // MAX_R (and therefore semisRound/finalRound) is computed, not the literal
  // 8: (startRoundNum - 1) warm-up rounds (whatever the pooling phase built)
  // + numElim elimination rounds + 2 for Semis and Final.
  var MAX_R = (startRoundNum - 1) + numElim + 2;
  var semisRound = MAX_R - 1, finalRound = MAX_R;

  // Elimination rounds with lucky loser calculation
  var targets = computeTargets(total, SEMIS, numElim, roomSize);
  for (var ei = 0; ei < targets.length; ei++) {
    var pIn  = ei === 0 ? total : targets[ei - 1];
    var pOut = targets[ei];
    var ed = distributeRoomsWithBye(pIn, roomSize, oddCountStrategy);
    var rooms = ed.rooms;
    var nr = rooms.length;
    // pOut is this round's TRUE total advancing out (bye recipient included —
    // see advTotal below). But the ROOM-based cutoff (advPerRoom/luckyCount)
    // only ever selects from units that actually played a room this round —
    // if this round itself reserved a bye (byeCount>0), that unit advances
    // automatically without going through room-based selection at all, so
    // the room-based target must be reduced by byeCount first, or the next
    // round would silently receive one MORE unit than its own generation-time
    // projection expects (an uncorrected +1 that — verified by hand-tracing —
    // never resolves on its own and cascades every subsequent round,
    // eventually corrupting the Final). Reducing here is what makes the
    // cascade self-terminate the moment a round's own target is already an
    // exact multiple of idealRoomSize (the normal case, restored within a
    // round or two of whatever triggered the original oddness).
    var advTarget = pOut - ed.byeCount;
    // Base: floor(advTarget/nr) advance per room; remainder = lucky losers
    var baseAdv = Math.floor(advTarget / nr);
    var lucky   = advTarget % nr;  // lucky loser spots needed
    rounds.push({ roundNum: rn++, players: pIn, rooms, byeCount: ed.byeCount,
      isQual:false, isNoElim:false, isSemis:false, isFinal:false,
      advPerRoom: baseAdv, advTotal: pOut, luckyCount: lucky });
  }

  // Semis' own incoming count is always SEMIS (= 2 * idealRoomSize) exactly —
  // an even multiple of idealRoomSize by construction, regardless of any bye
  // activity in earlier rounds (each bye-having round's own advTarget
  // reduction above already keeps the live count exactly matching this
  // projection — see the comment above advTarget). So Semis never itself
  // needs a bye reservation, and neither does the Final that follows it
  // (verified directly, not just assumed — see HANDOFF.md testing notes).
  var semisRooms = distributeRooms(SEMIS, roomSize);
  // Same floor+remainder split the regular elimination rounds above use —
  // NOT a bare FINAL/semisRooms.length division. That division silently
  // assumed FINAL always splits evenly across Semis' (always exactly 2)
  // rooms, true for every format built before 3v3v3 only because their
  // roomSize.ideal (8, 4, 2) happened to be even — team-3v3v3's ideal:3 is
  // odd, so FINAL(3)/2 rooms = 1.5, a non-integer that silently let 2 teams
  // through per room (4 total) instead of the intended 3 (caught by an
  // actual 3-team-Final playthrough, exactly the case the build spec asked
  // to verify directly rather than assume). Reusing the existing lucky-loser
  // mechanism for the remainder — 1 direct advancer per room + 1 slot
  // decided by best relative score among the 2nd-place finishers — needs no
  // new logic, and reproduces every prior format's behaviour byte-for-byte
  // (their FINAL % 2 is always 0, so this luckyCount is always 0 for them).
  var semisBaseAdv = Math.floor(FINAL / semisRooms.length);
  var semisLucky = FINAL % semisRooms.length;
  rounds.push({ roundNum: semisRound, players: SEMIS, rooms: semisRooms, byeCount: 0,
    isQual:false, isNoElim:false, isSemis:true, isFinal:false,
    advPerRoom: semisBaseAdv, advTotal: FINAL, luckyCount: semisLucky });

  // numGames comes from descriptor.config.finalsGames (populated at
  // generation time from cfg.finalsGames — see proceedGenerateSchedule())
  // rather than a cfg parameter directly, since the bracket phase's handoff
  // contract is (seedTotal, startRoundNum, descriptor) only — cfg is the
  // pooling phase's business, not the bracket phase's.
  rounds.push({ roundNum: finalRound, players: FINAL, rooms: [FINAL], byeCount: 0,
    isQual:false, isNoElim:false, isSemis:false, isFinal:true,
    advPerRoom:1, advTotal:1, luckyCount:0, numGames: descriptor.config.finalsGames });

  return rounds;
}

// True single elimination: every round is a straight head-to-head cut, no
// lucky-loser buffer, ever — genuinely different bracket-size math from
// classic-elimination's, not reused (TARGET_ROUND_SURVIVAL_RATIO/
// computeElimRoundCount/computeTargets are all classic-elimination-specific
// and don't apply here). Registered in BRACKET_PHASES['single-elimination'].
//
// Bracket-size math: the field is conceptually rounded up to the next power
// of 2; the shortfall becomes byes. Rather than concentrating every needed
// bye into round 1 (the traditional seeded-bracket convention), this reuses
// the *existing* distributeRoomsWithBye/oddCountStrategy mechanism exactly
// as team-3v3's Bye mode already does — at most one bye reserved per round,
// self-correcting round to round. This still produces exactly the same
// total round count as the traditional approach: each round's surviving
// count is ceil(pool/2) regardless of whether that round happened to need a
// bye or not (a bye simply makes an odd pool even *before* halving, same
// arithmetic result either way), so the field reaches 1 winner in exactly
// nextPowerOf2AndRounds(seedTotal).numRounds rounds either way — verified by
// hand-tracing, not just asserted (see HANDOFF.md).
function nextPowerOf2AndRounds(n) {
  // Pure integer doubling — deliberately not Math.log2/Math.pow, which can
  // land a hair off an exact power of 2 on some inputs due to floating-point
  // imprecision (the classic 1-off risk with log2-based "next power of 2"
  // formulas). This is exact by construction.
  var bracketSize = 1, numRounds = 0;
  while (bracketSize < n) { bracketSize *= 2; numRounds++; }
  return { bracketSize: bracketSize, numRounds: numRounds };
}

// Concentrates the ENTIRE shortfall to the next power of 2 into one round's
// byeCount, rather than the ordinary at-most-1-bye distributeRoomsWithBye
// formula (see "Concentrate single-elimination's byes" in HANDOFF.md for the
// original reasoning, unchanged here) — shared by singleEliminationBracket-
// Phase's own round 0 and doubleEliminationBracketPhase's own WB round 0
// (Part 1 of "Double elimination" in HANDOFF.md: reuse, don't rebuild).
function concentratedByeFirstRound(total, shape, roomSize) {
  var byeCount0 = shape.bracketSize - total;
  return { rooms: distributeRooms(total - byeCount0, roomSize), byeCount: byeCount0 };
}

function singleEliminationBracketPhase(seedTotal, startRoundNum, descriptor) {
  var roomSize = descriptor.config.roomSize;
  var oddCountStrategy = descriptor.config.oddCountStrategy;
  // Scope assertions (Part 1 of the build spec): fail loudly rather than
  // silently misbehave if some future caller violates either. "Single
  // elimination" is inherently head-to-head — there's no standard meaning
  // for an N-way version of it, so this isn't trying to generalize further;
  // roomSize is still read from the descriptor rather than hardcoding the
  // literal 2, the same way classicEliminationBracketPhase reads its own
  // bounds, so a future format that already declares idealRoomSize:2 could
  // pair with this bracket phase without changes here.
  if (roomSize.ideal !== 2) {
    throw new Error('singleEliminationBracketPhase requires a head-to-head room shape (roomSize.ideal === 2) — got ' + roomSize.ideal + '.');
  }
  // Only 'none' and 'bye' apply — a 3-unit room isn't single elimination
  // anymore, so 'flex' reaching here is a configuration error, not a case to
  // silently work around.
  if (oddCountStrategy === 'flex') {
    throw new Error('singleEliminationBracketPhase does not support the "flex" odd-count strategy — a 3-unit room is not single elimination. Use "none" or "bye" instead.');
  }

  var shape = nextPowerOf2AndRounds(seedTotal);
  var total = seedTotal;
  var rounds = [];
  for (var i = 0; i < shape.numRounds; i++) {
    var isLast = i === shape.numRounds - 1;
    var rd;
    if (i === 0) {
      // The concentration point (see "Concentrate single-elimination's byes"
      // in HANDOFF.md): the *entire* shortfall to the next power of 2 is
      // resolved here, once — distributeRoomsWithBye's "at most 1 bye"
      // formula (n % roomSize.ideal) can't express this (e.g. 13 byes for
      // N=19 reaching 32); it's a genuinely different computation, not a
      // bigger input to the same one. For 'none' mode, seedTotal is already
      // validated as a power of 2, so this is 0 here, same as before.
      rd = concentratedByeFirstRound(total, shape, roomSize);
    } else {
      // Every round after the first needs zero byes under normal play — the
      // field is an exact power of 2 by construction and stays one under
      // strict halving. Still re-derived via distributeRoomsWithBye (not
      // assumed 0) so this generation-time projection reflects a
      // mid-tournament withdrawal reintroducing oddness at a later round the
      // same way it always has — the actual live recovery for that case
      // happens in advanceRound(), independent of this projection, same as
      // the rest of the Bye mechanism.
      rd = distributeRoomsWithBye(total, roomSize, oddCountStrategy);
    }
    // Every round has the same shape: winner of each 1v1 advances, nobody
    // else — no isSemis distinction, no lucky-loser buffer, ever. advTotal is
    // rd.rooms.length (the match winners) plus rd.byeCount (the round's
    // bye(s), if any) — the same "1 fewer needs a real match" arithmetic a
    // bye always represents, now for however many byes the round has. This
    // is NOT the same as Math.ceil(total/2) once byeCount can exceed 1 (the
    // concentrated first round, e.g. 3 match winners + 13 byes = 16, not
    // ceil(19/2)=10) — the two formulas only coincide when byeCount is 0 or
    // 1, which is every round but the first.
    var advTotal = rd.rooms.length + rd.byeCount;
    rounds.push({ roundNum: startRoundNum + i, players: total, rooms: rd.rooms, byeCount: rd.byeCount,
      isQual:false, isNoElim:false, isSemis:false, isFinal:isLast,
      advPerRoom:1, advTotal:advTotal, luckyCount:0,
      // Marks the one round advanceRound() should award the full
      // concentrated shortfall on, rather than the ordinary single-bye
      // self-correcting fallback — see "Concentrate single-elimination's
      // byes" in HANDOFF.md.
      bracketPhaseFirstRound: i === 0 ? true : undefined,
      // The last round reuses the existing multi-game Finals feature rather
      // than a single winner-take-all game — a deliberate design choice
      // carrying an existing feature over, not a requirement of what "single
      // elimination" technically means. Flagged as such, not silently
      // decided (see HANDOFF.md).
      numGames: isLast ? descriptor.config.finalsGames : undefined });
    total = advTotal;
  }
  return rounds;
}

// ═══════════════════════════════════════════════════════════════
// DOUBLE ELIMINATION — see "Double elimination" in HANDOFF.md for the full
// design writeup. The genuinely new problem this bracket phase solves: every
// other bracket/pooling mechanism assumes a round's outcome feeds the VERY
// NEXT round (advanceRound()'s nextRound = T.rounds[ri+1] throughout).
// Double-elimination breaks that — a winners-bracket (WB) round's winners
// skip ahead past interleaved losers-bracket (LB) rounds, and an LB "absorb"
// round needs input from two different prior rounds at two different
// distances back.
//
// The fix: every WB/LB round object carries an explicit winnersTo/losersTo
// GLOBAL T.rounds index (null = nowhere, i.e. eliminated) computed once here
// at generation time. Live advancement (advanceDoubleEliminationRound,
// below) stages each round's winners/losers into T.pendingBracketSeeds[target]
// rather than assuming ri+1, and materializes whichever round the linear
// T.curRound pointer is about to arrive at from whatever's been staged for
// it — safe because of one load-bearing property, verified by direct
// enumeration during this build: for every round in the interleaved
// sequence, its LAST-arriving input is always the round immediately before
// it in play order. That's what lets the ordinary linear T.curRound pointer
// keep working even though a round's OTHER input may have arrived several
// rounds earlier and had to be staged.
// ═══════════════════════════════════════════════════════════════
function doubleEliminationBracketPhase(seedTotal, startRoundNum, descriptor) {
  var roomSize = descriptor.config.roomSize;
  var oddCountStrategy = descriptor.config.oddCountStrategy;
  // Same scope assertions as singleEliminationBracketPhase, same reasoning —
  // double-elimination is inherently head-to-head, no standard meaning
  // exists for an N-way version of it (see "Double elimination" Part 1/2 in
  // HANDOFF.md).
  if (roomSize.ideal !== 2) {
    throw new Error('doubleEliminationBracketPhase requires a head-to-head room shape (roomSize.ideal === 2) — got ' + roomSize.ideal + '.');
  }
  if (oddCountStrategy === 'flex') {
    throw new Error('doubleEliminationBracketPhase does not support the "flex" odd-count strategy — a 3-unit room is not double elimination. Use "none" or "bye" instead.');
  }

  var shape = nextPowerOf2AndRounds(seedTotal);
  var R = shape.numRounds;
  // R < 2 (seedTotal <= 2) has no meaningful losers bracket at all (the
  // single WB round's loser would have no one to face) — not reachable via
  // BRACKET_PHASE_MIN_UNITS' own floor of 4 (which guarantees R >= 2), so
  // this is a defensive assertion, not a normal code path.
  if (R < 2) {
    throw new Error('doubleEliminationBracketPhase requires at least 2 winners-bracket rounds — got seedTotal ' + seedTotal + '.');
  }

  // --- Winners bracket: Part 1 (reuse, don't rebuild) — round 0 reuses the
  // identical concentrated-bye math singleEliminationBracketPhase's own
  // round 0 uses; every round after it is the same plain halving shape. ---
  var wb = [];
  var total = seedTotal;
  for (var i = 0; i < R; i++) {
    var rd = i === 0 ? concentratedByeFirstRound(total, shape, roomSize) : distributeRoomsWithBye(total, roomSize, oddCountStrategy);
    var advTotal = rd.rooms.length + rd.byeCount;
    wb.push({ rooms: rd.rooms, byeCount: rd.byeCount, players: total, advTotal: advTotal });
    total = advTotal;
  }

  // --- Losers bracket: Part 2 topology. Standard shape — one pure-pairing
  // round after WB round 1 (nothing to absorb yet), an absorb round +
  // survivors-play round after each WB round 2..R-1, and one final absorb
  // round after the WB final (down to a single LB champion, no further
  // survivors-play needed). Produces 1 + 2*(R-2) + 1 = 2R-2 LB rounds total
  // — verify this by direct enumeration for whatever seedTotal is actually
  // tested, don't trust the formula blind (see HANDOFF.md).
  //
  // Each stage's incoming total is run through distributeRoomsWithBye (not
  // a bare distributeRooms) — the SAME at-most-1-bye self-correction WB
  // rounds after round 0 already use. This isn't optional polish: WB round
  // 0's own loser count (dropCount below) inherits seedTotal's own parity
  // whenever byeCount0 > 0 (an odd seedTotal, e.g. N=13, produces an ODD
  // number of round-0 match losers) — found via direct enumeration during
  // this build (a naive distributeRooms(5, {ideal:2}) silently produced a
  // room of size 1). A "survivor count" carried into the next stage is
  // always (real match winners) + (that stage's own bye, if any) — a bye
  // recipient auto-advances as a survivor without playing, same as
  // everywhere else in the app.
  var lb = []; // { rooms, byeCount, kind: 'drop'|'absorb'|'survive'|'final-absorb' }
  var lbSurvivorCount = 0;
  for (var k = 0; k < R; k++) {
    var dropCount = wb[k].rooms.length; // exactly 1 loser per WB room (advPerRoom:1)
    if (k === 0) {
      var d0 = distributeRoomsWithBye(dropCount, roomSize, oddCountStrategy);
      lb.push({ rooms: d0.rooms, byeCount: d0.byeCount, kind: 'drop' });
      lbSurvivorCount = d0.rooms.length + d0.byeCount;
    } else if (k < R - 1) {
      var absorbTotal = lbSurvivorCount + dropCount;
      var dA = distributeRoomsWithBye(absorbTotal, roomSize, oddCountStrategy);
      lb.push({ rooms: dA.rooms, byeCount: dA.byeCount, kind: 'absorb' });
      var absorbSurvivors = dA.rooms.length + dA.byeCount;
      var dS = distributeRoomsWithBye(absorbSurvivors, roomSize, oddCountStrategy);
      lb.push({ rooms: dS.rooms, byeCount: dS.byeCount, kind: 'survive' });
      lbSurvivorCount = dS.rooms.length + dS.byeCount;
    } else {
      var dF = distributeRoomsWithBye(lbSurvivorCount + dropCount, roomSize, oddCountStrategy);
      lb.push({ rooms: dF.rooms, byeCount: dF.byeCount, kind: 'final-absorb' });
    }
  }

  // --- Interleave WB/LB into one flat play-order sequence, then the grand
  // final. "Each round as soon as its last dependency is ready" — see
  // HANDOFF.md's worked WB-size-8 example for why this exact order is what
  // makes the linear T.curRound pointer stay valid. ---
  var sequence = [];
  var lbPtr = 0;
  for (var k2 = 0; k2 < R; k2++) {
    sequence.push({ type: 'wb', wbIndex: k2 });
    var lbCountHere = (k2 === 0 || k2 === R - 1) ? 1 : 2;
    for (var c = 0; c < lbCountHere; c++) { sequence.push({ type: 'lb', lbIndex: lbPtr }); lbPtr++; }
  }
  sequence.push({ type: 'gf' });

  // winnersTo/losersTo, computed as LOCAL positions in `sequence` for now —
  // converted to GLOBAL T.rounds indices below (baseIdx + position), since
  // composedBuildProgression concatenates this array after the pooling
  // phase's own rounds (see "Phase composability refactor" in HANDOFF.md;
  // roundNum === global array index + 1 always holds, confirmed against
  // qualTablePoolingPhase/noElimWarmupPoolingPhase's own rn bookkeeping).
  function nextWbPosition(afterPos) {
    for (var p = afterPos + 1; p < sequence.length; p++) if (sequence[p].type === 'wb') return p;
    return -1;
  }
  function nextNonWbPosition(afterPos) {
    for (var p = afterPos + 1; p < sequence.length; p++) if (sequence[p].type !== 'wb') return p;
    return -1;
  }
  var gfPosition = sequence.length - 1;
  var baseIdx = startRoundNum - 1;

  var rounds = sequence.map(function (entry, pos) {
    var winnersToPos = null, losersToPos = null;
    if (entry.type === 'wb') {
      // A WB round's losers ALWAYS feed the very next entry in the sequence
      // (by construction of the interleaving above — the LB round(s)
      // associated with this WB round always come immediately after it);
      // its winners feed the next WB round, or the grand final if this was
      // the WB's own final round.
      losersToPos = pos + 1;
      winnersToPos = entry.wbIndex === R - 1 ? gfPosition : nextWbPosition(pos);
    } else if (entry.type === 'lb') {
      // An LB round's winners (survivors) feed whichever comes next that
      // ISN'T a WB round — the next LB round, or the grand final for the
      // final absorb round. Losers are eliminated (2nd loss) — nowhere to go.
      winnersToPos = nextNonWbPosition(pos);
      losersToPos = null;
    }
    // entry.type === 'gf': both null — Part 4's own live-reset mechanism
    // takes over entirely from the grand final onward, not this routing table.

    var roundNum = startRoundNum + pos;
    var base = {
      roundNum: roundNum, isQual: false, isNoElim: false, isSemis: false,
      advPerRoom: 1, luckyCount: 0,
      winnersTo: winnersToPos === null || winnersToPos === -1 ? null : baseIdx + winnersToPos,
      losersTo: losersToPos === null || losersToPos === -1 ? null : baseIdx + losersToPos
    };
    if (entry.type === 'wb') {
      var w = wb[entry.wbIndex];
      return Object.assign(base, {
        bracket: 'winners', isFinal: false, rooms: w.rooms, byeCount: w.byeCount, players: w.players,
        advTotal: w.rooms.length + w.byeCount, bracketPhaseFirstRound: entry.wbIndex === 0 ? true : undefined
      });
    }
    if (entry.type === 'lb') {
      var l = lb[entry.lbIndex];
      return Object.assign(base, {
        bracket: 'losers', isFinal: false, rooms: l.rooms, byeCount: l.byeCount,
        players: l.rooms.reduce(function (s, r) { return s + r; }, 0) + l.byeCount,
        advTotal: l.rooms.length + l.byeCount
      });
    }
    // Grand final — a continuous games-until-someone-wins race (see
    // "Grand-final race format" in HANDOFF.md), not the fixed-numGames
    // cumulative-score match every other Final uses. numGames starts at 1
    // (one game open for entry) and grows live as each opened game is fully
    // scored and the race isn't yet decided — see checkGrandFinalRace() and
    // computeGrandFinalRaceState(). A plain 1-room-of-2 shape, same as
    // singleEliminationBracketPhase's own last round.
    return Object.assign(base, {
      bracket: 'grand-final', isFinal: true, rooms: [2], byeCount: 0, players: 2,
      advPerRoom: 1, advTotal: 1, numGames: 1
    });
  });

  return rounds;
}

// --- Orchestrator (registered by every SCHEDULE_LOGICS entry that composes
// a pooling phase with a bracket phase — today, both entries do) ---
// Thin composition of one pooling phase + one bracket phase, both read from
// gamemodeConfig (populated at generation time — see proceedGenerateSchedule()
// — the same way roomSize/qualRounds/semisSize/finalSize already are).
// poolingPhase is a direct organiser choice (the "Pooling phase" dropdown);
// bracketPhase is derived from T.scheduleLogic (the "Schedule logic" setup
// dropdown — see "True single-elimination bracket phase" in HANDOFF.md).
// This function used to BE classic-elimination's tangled pooling+bracket
// logic directly; now it's just wiring two phases together and concatenating
// their rounds, reused verbatim by every schedule logic built this way — see
// "Phase composability refactor" in HANDOFF.md.
function composedBuildProgression(cfg, descriptor) {
  var poolingPhase = descriptor.config.poolingPhase;
  var bracketPhase = descriptor.config.bracketPhase;
  var pooled = POOLING_PHASES[poolingPhase](cfg, descriptor);
  var bracket = BRACKET_PHASES[bracketPhase](pooled.seedTotal, pooled.nextRoundNum, descriptor);
  return pooled.rounds.concat(bracket);
}
