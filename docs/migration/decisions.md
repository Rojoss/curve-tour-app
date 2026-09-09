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
9. The owner approved fixing the two observed Final defects when their scoring/UI
   slice is reached if the correction stays small. Keep their characterization
   tests until then, and document the intentional behavior change when updating
   those tests.
10. Preserve the legacy omission of `cfg-lb-qualifiers` from the live setup
    envelope during parity. The generated tournament state remains authoritative,
    and old/new saves stay mutually readable without adding a protocol field.

## Decisions required before affected slices

- Which isolated Firebase project/config should automated sync tests use?
- Must the new app remain able to roll back to the frozen app after it has written
  state, and for how long?
- Which browsers and minimum viewport sizes are release requirements?
- Is pixel-level parity required, or is functionally equivalent styling accepted?
- Where will the TanStack server build be hosted, and does that platform support
  the chosen Nitro output?
- Should current user-facing wording be frozen exactly or only semantically?

These questions do not block domain-logic and local UI slices, but they do block
sync, deployment, and final visual acceptance.
