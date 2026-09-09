# Legacy behavior contract

Status: code-derived baseline. Items marked **Observe** still need a human-backed
or recorded browser example before their migration slice begins.

This contract describes observable behavior. The frozen implementation under
`legacy/` remains authoritative when prose is incomplete.

## Application shell and modes

- The page title is `Curve Fever Pro Tour Hub`.
- The header shows the tournament title and current round.
- A new browser opens on Bracket with an empty-state message.
- Navigation contains Admin, Scoreboard, Bracket, Rankings, and Archive.
- Clicking Admin while locked opens a focused password dialog. Cancelling keeps
  the previously selected viewer tab active.
- Archive is local-device data and is hidden in unauthenticated shared-link
  viewer mode.
- A URL query parameter named `t` selects a live tournament.
- A bare URL must not silently retain or restore a stale `?t=` value.

## Admin access

- Unlock status is cached per browser.
- The entered secret is SHA-256 hashed in the browser and verified through the
  Firebase `adminAuth/verify` path.
- A successful unlock stores both the unlocked marker and proof hash.
- Locking clears both values.
- An unlocked shared-link viewer is promoted to a writer for that tournament.
- Failed verification leaves the prompt open and displays an error.
- Successful verification shows `Unlocked in this browser.` and a `Lock Admin`
  action. An unavailable verification service shows `Can't verify the password
  right now — check your connection and try again.`, clears/refocuses the input,
  and remains locked. Locking returns to Bracket and clears both credential keys.
- **Observe:** wrong-password server rejection and shared-viewer promotion.

## Setup configuration

### Game formats

- `ffa-individual`: individual players; desired room range 6–8, ideal 8.
- `team-2v2v2v2`: teams of 2; room range 3–4 teams, ideal 4.
- `team-3v3v3`: teams of 3; room range 2–3 teams, ideal 3.
- `team-3v3`: teams of 3; head-to-head rooms; supports none, bye, and flex
  odd-count strategies.
- `individual-1v1`: individual head-to-head; supports none and bye.
- Last Man Standing is displayed as unavailable.

### Schedule logic

- Single elimination is available for every implemented format.
- Head-to-head 1v1 and 3v3 expose race-style double elimination unless 3v3
  uses flex.
- Other formats expose shared-final double elimination.
- The two double-elimination variants are mutually hidden based on compatibility;
  they are not shown together.
- Kings Valley is displayed as unavailable.

### Pooling phase

- None starts standard elimination immediately.
- Qualification Table plays exactly three cumulative-table rounds before the
  bracket cut.
- Swiss uses a calculated round count clamped to 3–7 and fold-pairs later rounds.
- Group Stage creates fixed groups and single or double round-robin matches.
- Group size defaults to 4 and must be at least 3.
- Qualifiers per group default to 2 and must be lower than group size.
- Qualification Table and Swiss use a global `Advance to bracket` value.
- Group Stage uses per-group qualifiers and shows a live group/round preview.

### Scoring and finals

- Fair Points is `rank - score / 100000`; lower values rank better.
- Team scores are either the sum of all non-vacant members or the designated
  defender's score.
- Defender changes apply from the selected round forward and do not rewrite
  scores for prior rounds.
- Single elimination supports independently configured 1–4 game Semis and
  1–4 game Finals, summed within the phase.
- Race-style double elimination plays Grand Final games until the winners-side
  or losers-side finalist reaches its configured win target.
- Shared-final double elimination sends configured LB qualifiers into a normal
  fixed-game Final with WB qualifiers filling the remaining places.
- **Observed legacy defects:** entering every score in a one-game Final does not
  complete Rankings or trigger auto-archive, and selecting any non-first tab in
  a multi-game Final hides the complete game-entry wrapper. Treat these as
  frozen behavior until the explicit compatibility decision in `decisions.md`.

## Roster parsing and identity

- Individual formats accept one player per non-empty line.
- Team lines are comma-delimited: team name followed by the format's exact
  number of members.
- Member syntax may contain a display name plus an optional user ID in
  parentheses.
- Team identity uses `teamId`; individual identity uses the player name.
- Empty teams are rejected.
- The loaded roster establishes `confirmedCount`; raw textarea changes alone
  do not change the registered count.
- Reserves use the same unit shape as the active format.
- Team formats additionally support individual reserves for vacant member slots.
- Duplicate, rename, swap, walk-up, removal, and vacancy handling must be
  characterized before their UI is migrated.

## Schedule generation

- Generation validates the minimum viable bracket field for the chosen format.
- Generated rooms may never exceed 10 physical players.
- `none` odd-count mode rejects incompatible counts rather than creating a
  one-unit room.
- Under pooling, room-based phases validate the full registered count as well as
  the number entering the bracket.
- Race-style double elimination with `none` requires a power-of-two bracket.
- Optional Semis/Final overrides are headcounts, not room-shape overrides.
- Final size cannot exceed Semis size; neither may exceed the field entering the
  bracket.
- Generation resets scores, group membership, defender history, pending seeds,
  and browser-local bracket collapse overrides as applicable.
- Schedule generation creates a new stable tournament ID.
- A generated schedule is previewed before the tournament starts.
- **Observe:** representative generated schedules for every format × schedule ×
  pooling combination and all boundary counts.

## Scoring, ties, and advancement

- A score cell is unscored while empty/null; zero is a real score.
- Room ordering and advancement use derived unit scores and Fair Points.
- Ties affecting advancement block the Next Round action until explicitly
  resolved.
- Tie resolutions are invalidated when relevant scores change.
- Qualification and group cutoff ties have their own cutoff ordering behavior.
- Lucky losers are selected when room cuts cannot produce the target directly.
- Pooling byes rotate toward units with the fewest previous pooling byes, with
  seed order breaking ties.
- Swiss later-round pairing uses standings folds and avoids rematches where the
  available pairing permits.
- Group Stage's first bracket round tries to avoid matching members of the same
  group.
- Double-elimination winners and losers can route to non-adjacent future rounds
  through pending seeds.
- The reserve window closes once eliminations begin.
- **Observe:** exact cutoff, tie, lucky-loser, bye, and double-elimination
  scenarios listed in `test-scenarios.md`.

## Viewer-facing screens

### Scoreboard

- Shows the current round, room composition, scores, rank, and advancement
  status.
- Shows the applicable qualification/group standings while pooling.
- Updates automatically while open.

### Bracket

- Shows past, current, and future rounds in horizontal columns.
- Past/current/future state, advancement, elimination, lucky-loser, unresolved
  tie, WB/LB/GF identity, and placeholder assignments remain visually distinct.
- Every live bracket round can be collapsed; archive bracket columns are read-only.
- Follow-a-player state is browser-local and highlights occurrences without
  changing collapse state.
- An unlocked admin can enter current-round and Finals scores from Bracket.

### Rankings

- Combines player lookup/status with full tournament rankings.
- Finalists rank by cumulative Final result; eliminated units rank by elimination
  round and relative performance within that round.
- Rankings can be downloaded as a PNG generated in the browser.
- Team displays preserve member and defender information.

## Tournament management

- Reserves and walk-ups can enter only while the reserve window is open and only
  when room constraints remain valid.
- Group membership is fixed during Group Stage; reserves cannot be inserted into
  an active group phase.
- Renaming preserves historical identity and dependent records as implemented by
  the legacy application.
- Removing or swapping a current participant updates current and future
  assignments while preserving completed-round history.
- Reset warns before discarding scores and also offers archive protection for a
  dirty started tournament.
- Unsaved-change flows support save-and-continue, discard-and-continue, and cancel.

## Persistence and archives

- Live local state and setup-field state restore after reload.
- Viewer tabs never write the organiser's local live state.
- Older persisted records are normalized, including the pre-pooling `qual` field,
  missing tournament IDs, and historical team roster shapes.
- Archives use a lightweight index plus one full snapshot per entry.
- Saving matches by tournament ID, never title alone.
- When multiple archive entries share a tournament ID, overwrite targets the most
  recently saved entry.
- An archive entry preserves annotations when overwritten.
- Completed tournaments auto-save once.
- The auto-save statement describes the intended multi-game completion path;
  the currently reachable UI is blocked by the Final-tab defect recorded above.
- Archive detail is read-only except annotations and deletion.
- Single-entry and full-archive JSON exports can be imported.
- Import is limited to 25 MiB, validates shape, handles collisions explicitly,
  and never touches live tournament state.
- Archive rankings can also be downloaded as PNG.

## Live synchronization

- The application remains locally usable when Firebase scripts fail to load.
- Writers debounce complete-state pushes to `tournaments/<tournamentId>`.
- Firebase-incompatible null array entries are marshalled through a sentinel and
  restored on receipt.
- The admin proof hash travels with writer payloads for database-rule validation
  and is deleted before applying viewer state.
- Multiple writers receive each other's updates.
- Locally dirty score and final-score keys win over an older remote update until
  the local push is confirmed; unrelated remote fields still merge.
- Same-field simultaneous edits remain last-write-wins.
- Viewers never write local state or Firebase tournament state.
- A missing live payload shows a waiting state; connection failure preserves the
  last screen and adds a stale warning.
- **Observe:** all live-sync cases in an isolated Firebase project before cutover.

## Non-functional parity

- Preserve desktop and narrow-screen usability, keyboard access, visible focus,
  and disabled states.
- Preserve the existing dark visual language during the parity phase.
- No unexpected browser-console errors are accepted.
- Production build and direct-load behavior must work for `/` and `/?t=<id>`.
