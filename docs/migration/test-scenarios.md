# Characterization and acceptance scenarios

Legend: `[x]` automated baseline exists, `[ ]` still required, `[manual]` needs
an isolated service or human review.

## Shell, navigation, and authentication

- [x] Fresh load opens Bracket and shows its empty state.
- [x] Locked Admin opens a focused password dialog; cancel preserves Bracket.
- [x] An already-unlocked browser exposes baseline configuration defaults.
- [x] Unavailable-sync response fails closed and preserves the locked state.
- [ ] Wrong-password server rejection.
- [x] Lock clears the browser marker/proof and returns to Bracket.
- [ ] Successful automated lock and unlock round trip against an isolated service.
- [ ] Shared viewer promotion to writer.
- [x] Narrow viewport navigation and focus behavior.

## Deterministic algorithm matrix

For each applicable row, cover minimum, normal, odd, near-cap, and override
boundaries. Fix random seed, clock, and ID generator.

- [x] FFA × single elimination × none/qualification/Swiss/group.
- [x] FFA × shared-final double elimination × every pooling phase.
- [x] 2v2v2v2 × both compatible schedule logics × every pooling phase.
- [x] 3v3v3 × both compatible schedule logics × every pooling phase.
- [x] 3v3 × single/race-double × none/bye/flex × every pooling phase.
- [x] 1v1 × single/race-double × none/bye × every pooling phase.
- [x] Physical room-cap validation at 10 and rejection above 10.
- [x] Semis/Final sizes and 1–4 game combinations.
- [x] WB/LB target races and shared-Final LB qualifier boundaries.
- [x] Circle-method schedules for even and odd group sizes, mixed group lengths,
  snake seeding, whole-group byes, and single/double round robin.
- [x] Representative Qualification, Swiss-with-bye, no-pooling flex, and Group
  Stage schedule structures against the frozen legacy functions.
- [x] Representative FFA gradual-cut and head-to-head-bye single-elimination
  schedules, including lucky-loser counts and multi-game Semis/Final metadata.
- [x] Race-style double-elimination play order and route indices for power-of-two
  and concentrated-bye fields.
- [x] Shared-Final double-elimination WB/LB room cuts, deferred LB creation,
  lucky-loser slots, route indices, and Final metadata for FFA and 3-way teams.

Each fixture should contain selected setup, normalized roster, generated rounds,
assignments, byes, pending seeds, and relevant validation text.

## Roster and tournament management

- [x] Sixteen-player individual roster loads and generates a preview.
- [x] Blank lines, whitespace, duplicate individual names.
- [x] Baseline 3-member team parsing, optional user IDs, and missing-slot padding.
- [x] Team parsing for 2-member formats, duplicate team names, and empty teams.
- [x] Reserve team and individual-member reserve parsing.
- [x] Add/remove reserve and walk-up under valid and invalid room shapes.
- [x] Rename individual, team, and member with completed history.
- [x] Swap current individual and whole team.
- [x] Vacate/fill team member and change designated defender.
- [x] Group Stage reserve prohibition.
- [x] Reserve-window closure after first elimination.

## Scoring and progression

- [x] Empty versus zero scores and negative/large values.
- [x] Member sum and defender-only derived team scores.
- [x] Fair Points ordering and stable tie clusters.
- [x] Ordinary tie resolution and invalidation after score edit.
- [x] Qualification cutoff tie and Group Stage cutoff tie.
- [x] Lucky-loser calculation and display.
- [x] Pure lucky-loser candidate ratios/selection and zero-total exclusion.
- [x] Ordinary and WB/LB direct-advancer, loser, and lucky-loser splits.
- [x] Per-room tie detection and ordering, including old string and current
  array resolution values.
- [x] Qualification and Group Stage cutoff detection and independent ordering.
- [x] Cumulative Qualification/Swiss and per-group Fair Points standings,
  including qualifier seeding by finish tier across groups.
- [x] Multiple byes and pooling bye rotation.
- [x] Swiss rematch avoidance and unavoidable-rematch fallback.
- [x] Deterministic snake/Fisher-Yates seeding and best-effort same-group swap.
- [x] Swiss fold pairing with odd-field bye rotation and a resolvable local
  rematch swap.
- [x] Same-group avoidance entering the bracket.
- [x] Every WB/LB routing transition including non-adjacent pending seeds.
- [x] Known legacy single-game Final completion and multi-game tab failures,
  plus the approved replacement fixes.
- [x] Multi-game Semis/Final totals and incomplete-game behavior after the known
  tab defect is explicitly resolved or preserved.
- [x] Grand Final race completion for both target sides.
- [x] Pure Grand Final race counting with a tied game, winner-side completion,
  and the undecided open-next-game condition.
- [x] Fixed multi-game Final totals, completeness, next-game selection, and
  cumulative ordering independent of the known legacy tab defect.
- [x] Bracket follow persistence/resolution, round collapse, read-only locking,
  current-round score entry, and one-game Final score entry.
- [x] Representative live active rankings and completed Final champion,
  finalist, and eliminated order in the replacement UI.
- [x] Additional Final rankings for bye, tie-break, and team display cases.
- [x] Representative complete/incomplete Final rankings, room-share ordering,
  active pooling metadata, and double-elimination second-loss ranking.

## Persistence and archives

- [x] Exact fresh-state envelope keys and setup value types/defaults.
- [x] Reload each setup field and active tab.
- [x] Reload running tournament, scores, title, active tab, and advance afterward.
- [x] Viewer proves it never writes `curveFFA_state_v1`.
- [x] Pre-pooling `setup.qual` fallback.
- [x] Missing tournament-ID fallback.
- [x] Historical team-roster normalization and null slots.
- [x] Archive create, overwrite, save-as-new, title collision, and annotation
  preservation.
- [x] Auto-save exactly once at completion.
- [x] Single and bundle export/import round trips.
- [x] Valid, invalid, oversized, duplicate-ID, and duplicate-tournament imports.
- [x] Archive deletion and annotation deletion confirmations.
- [x] Live and archived rankings PNG downloads have valid dimensions/content.

## Synchronization

- [x] Local-only setup, generation, scoring, viewer navigation, reload, and
  advancement with Firebase fully blocked.
- [x] Null sentinel round trip.
- [x] Writer debounce and successful push status.
- [x] Viewer waiting, initial state, update, and stale-connection behavior.
- [x] Different-field concurrent writer edits merge.
- [x] Dirty local score survives an older remote payload.
- [x] Same-field edits are last-write-wins.
- [x] Listener teardown on reset and tournament change.
- [manual] Repeat all networked cases using an isolated Firebase test project.

## Visual baselines

Capture desktop and 390 px-wide screenshots for:

- [ ] Every empty view.
- [ ] Admin setup for each format and conditional field combination.
- [ ] Preview, running Admin, tie banner, reserves, and multi-game entry.
- [ ] Qualification, Swiss, and grouped standings.
- [ ] Scoreboard, collapsed/expanded bracket, followed player, and rankings.
- [ ] Archive list/detail and every modal/error state.

Visual snapshots are regression signals, not permission to reproduce invalid or
inaccessible markup. Accessibility corrections must be documented as intentional.
