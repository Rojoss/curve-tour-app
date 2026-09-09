# Migration progress

## Preparation

- [x] Preserve the current implementation under `legacy/`.
- [x] Add project-level agent instructions.
- [x] Add code-derived behavior and storage contracts.
- [x] Add migration decision log and scenario inventory.
- [x] Scaffold TanStack Start, React, TypeScript, Vite, Tailwind, Vitest, and
  Playwright configuration.
- [x] Add initial no-Firebase legacy browser smoke tests.
- [x] Install dependencies and generate the lockfile.
- [x] Install the Playwright Chromium runtime.
- [x] Run typecheck, unit tests, build, and the initial browser smoke tests.
- [x] Record initial desktop and 390 px legacy visual snapshots.
- [x] Verify a real production-connected admin unlock without storing the secret
  in repository files.
- [x] Exercise disposable production tournaments through setup, live sync,
  scoring, viewer screens, reload, and Final entry.
- [x] Add offline admin/configuration/team parsing/persistence/progression
  characterization coverage.
- [x] Record two observed Final-completion defects as explicit parity decisions.
- [x] Pass `pnpm check` and all 16 browser characterization/visual tests after
  the expanded admin investigation.
- [x] Tag the original legacy commit as `pre-tanstack-migration-2026-09-09`.
- [x] Commit the preparation artifacts after review (`1c7926f`).
- [x] Owner confirmed no representative export exists; use synthetic fixtures
  alongside the recorded legacy screenshots and browser characterizations.
- [ ] Provision an isolated Firebase test project.

## Migration slices

1. [x] Typed state model, clocks/random/ID injection, and fixture utilities.
2. [x] Pure format, room-distribution, scoring, and roster primitives.
3. [x] Pooling and bracket schedule generation.
   - [x] Qualification, Swiss, Group Stage, and no-pooling warmup schedules.
   - [x] Single-elimination targets, rooms, byes, lucky-loser slots, Semis,
     and Final schedule generation.
   - [x] Race-style head-to-head double-elimination topology.
   - [x] Shared-Final FFA/team double-elimination topology.
4. [ ] Advancement, ties, byes, double-elimination routing, and rankings.
   - [x] Room tie detection/order, legacy resolution normalization,
     qualification/group cutoff ties, and lucky-loser selection primitives.
   - [x] Cumulative Qualification, Swiss, and Group Stage standings.
   - [x] Deterministic random/snake seeding, Group Stage collision avoidance,
     pooling-bye rotation, and Swiss fold/rematch handling.
   - [ ] Round advancement, bye rotation, seeding, and WB/LB pending routes.
   - [ ] Grand Final race state, completion, and rankings.
5. [ ] Browser persistence and backwards-compatible normalization.
6. [ ] Shell, navigation, authentication modal, and setup UI.
7. [ ] Roster management, preview, and running Admin UI.
8. [ ] Scoreboard and Rankings UI.
9. [ ] Bracket UI, follow/collapse behavior, and direct score entry.
10. [ ] Archive UI, JSON transfer, annotations, and PNG downloads.
11. [ ] Firebase viewer/writer transport and concurrent merge behavior.
12. [ ] Full parity matrix, deployment preview, rollback rehearsal, and cutover.

## Gate for starting slice 1

- Preparation checks pass locally.
- The user approves the frozen baseline and unresolved-decision timing.
- At least one representative existing live-state/archive export is available
  for sanitization, or the owner has confirmed that none exists so synthetic
  fixtures can be used.
