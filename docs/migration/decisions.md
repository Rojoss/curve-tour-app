# Migration decisions

## Settled for the parity phase

1. The frozen legacy app is the behavioral oracle and remains runnable separately.
2. The replacement uses the TanStack Start/React/TypeScript/Vite/pnpm pattern from
   `cfp-translations`, but copies no translation-specific database or AI features.
3. Existing visual design is preserved initially. Redesign is a later project.
4. The main product remains one `/` route with `?t=` semantics during parity.
5. Existing local-storage keys, Firebase paths, archive shapes, and exported JSON
   remain compatible.
6. Firebase stays client-side for parity. Moving it behind server functions is a
   separate security/architecture migration.
7. Production Firebase is blocked in automated tests.
8. Feature work lands as bounded vertical slices with contract tests and reviewable
   commits, never as an all-at-once rewrite.

## Decisions required before affected slices

- Which isolated Firebase project/config should automated sync tests use?
- Must the new app remain able to roll back to the frozen app after it has written
  state, and for how long?
- Which browsers and minimum viewport sizes are release requirements?
- Is pixel-level parity required, or is functionally equivalent styling accepted?
- Where will the TanStack server build be hosted, and does that platform support
  the chosen Nitro output?
- Should current user-facing wording be frozen exactly or only semantically?
- Should the replacement intentionally fix the observed Final-completion defects,
  or preserve them for strict parity? In the frozen app, a scored single-game
  Final remains incomplete in Rankings and never auto-archives. In a multi-game
  Final, selecting Game 2, Game 3, or Total hides the entire score panel because
  the tab switch also hides its `fg-wrap` parent. Both were reproduced in the
  production-connected legacy UI on 2026-09-09 and are covered by offline
  characterization tests.

These questions do not block domain-logic and local UI slices, but they do block
sync, deployment, and final visual acceptance.
