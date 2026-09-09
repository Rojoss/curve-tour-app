# Migration control center

The migration is split into preparation, parity slices, and final cutover. The
local implementation slices are complete; production cutover awaits the owner
sign-offs in `release-readiness.md`.

## Documents

- `behavior-contract.md`: observable product behavior that must survive.
- `state-and-storage.md`: state schema and external compatibility surface.
- `test-scenarios.md`: characterization and acceptance-test inventory.
- `decisions.md`: settled boundaries and unresolved product choices.
- `progress.md`: slice order, gates, and current status.
- `user-checklist.md`: owner inputs and decisions still needed.
- `release-readiness.md`: final evidence, rollback, and cutover runbook.

## Commands

Run the applications separately:

```text
pnpm dev:legacy   # reference app, http://127.0.0.1:4173
pnpm dev          # replacement app, http://127.0.0.1:3000
```

Automated legacy tests deliberately abort Firebase script/database traffic.
Live-sync verification belongs in an isolated Firebase test environment, never
the production project.
