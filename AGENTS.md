# Curve Tour migration instructions

## Mission

Replace the legacy browser application with a TanStack Start, React, and
TypeScript application while preserving observable behavior and stored data.
Behavioral parity has priority over cleanup, redesign, or architectural novelty.

## Sources of truth

Use these in descending order:

1. Passing characterization tests and committed fixtures.
2. The observable behavior of the frozen application under `legacy/`.
3. `docs/migration/behavior-contract.md` and
   `docs/migration/state-and-storage.md`.
4. Comments in the frozen legacy source.

If these disagree, stop the affected slice, record the conflict in
`docs/migration/decisions.md`, and leave unrelated work moving.

## Hard boundaries

- Never edit files under `legacy/` during migration work.
- Do not change Firebase paths, local-storage keys, URL parameters, or JSON
  export formats without an explicit compatibility decision.
- Do not connect automated tests to production Firebase. Tests must block or
  replace Firebase network traffic.
- Do not combine behavioral migration with a visual redesign.
- Do not replace an algorithm merely because another implementation looks
  simpler. First reproduce its outputs with deterministic fixtures.
- Keep `src/routeTree.gen.ts` generated; do not hand-edit it.
- Preserve unrelated user changes.

## Architecture rules

- Put deterministic tournament rules under `src/domain/tournament/` as pure,
  typed functions with no React, DOM, storage, clock, random, or network access.
- Put browser persistence and compatibility adapters under `src/lib/persistence/`.
- Put Firebase transport and merge behavior under `src/features/sync/`.
- Put route components under `src/routes/` and feature UI under
  `src/features/<feature>/`.
- Inject randomness, time, ID creation, storage, and transport at boundaries.
- Keep state transitions explicit and testable. Prefer a typed reducer or small
  explicit store; do not add a state framework without documenting the need.

## Required workflow for each slice

1. Read the applicable contract and legacy source.
2. Add or extend a characterization test that passes against `legacy/`.
3. Add deterministic fixtures for calculations or serialization involved.
4. Implement only the selected slice.
5. Run the narrow checks, then `pnpm check` and the relevant E2E tests.
6. Compare legacy and replacement behavior at desktop and narrow viewport sizes
   when the slice changes UI.
7. Update `docs/migration/progress.md` and record every intentional difference.

## Completion definition

A slice is not complete because it renders or compiles. It is complete when its
contract scenarios pass, old persisted data still loads where applicable, the
browser console has no unexpected errors, and all observed differences are
documented.
