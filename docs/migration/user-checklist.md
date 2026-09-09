# Owner checklist for production cutover

All local migration slices are complete. These items are the remaining owner or
environment decisions before production traffic is switched.

## Required to start

- [x] Review and approve the preparation diff, especially `AGENTS.md`, the behavior
  contract, and the migration order. Approval allows the preparation artifacts to
  be committed on `rework`.
- [x] Place at least one representative tournament/archive JSON export in the
  ignored `migration-input/` directory, or provide its local path. Prefer a
  completed tournament using the most complex format you have actually run. The
  migration agent will sanitize it before committing any derived fixture. The
  owner confirmed none exists, so committed synthetic fixtures are used.

Never place an admin password in the repository. Rotate the credential after
cutover because the current one was supplied through chat.

## Recommended decisions

- [x] Final behavior: fix both observed legacy Final defects when their migration
  slice is reached if the correction stays small; otherwise defer them.
- [ ] Visual parity: approve near-pixel parity during migration, with redesign
  deferred until after cutover.
- [ ] Wording parity: approve exact existing labels, messages, and confirmation
  text during migration unless a mismatch is recorded for review.
- [ ] Rollback window: choose how long data written by the React app must remain
  readable by the frozen app. Recommendation: through two successful real
  tournaments after launch.
- [ ] Browser targets: name supported browsers and smallest viewport.
  Recommendation: current Chrome and Edge desktop plus a 390 px viewport.
- [ ] Rotate the shared admin credential because it was supplied through chat;
  do not send the replacement to the migration agent unless another one-time
  real authentication check is explicitly needed.

## Required before sync and deployment slices

- [ ] Provide the current hosting/deployment details: production URL, provider,
  build/publish steps, domain/DNS owner, and whether a Node server is supported.
- [ ] Provide the deployed Firebase Realtime Database rules as a local file, with
  secrets removed or supplied through ignored environment files.
- [ ] Choose an isolated Firebase test target. Recommendation: Firebase Emulator
  Suite first, plus one manually approved smoke test in a separate non-production
  Firebase project before cutover.
- [x] Identify a low-risk real tournament or rehearsal that can serve as final
  acceptance testing before production switches over. The owner approved
  disposable pre-launch production data for this purpose.
