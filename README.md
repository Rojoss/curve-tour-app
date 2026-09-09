# Curve Fever Pro Tour Hub

This repository contains the behavior-preserving TanStack Start, React, and
TypeScript replacement for the original static browser application.

## Applications

- `pnpm dev` starts the new TanStack migration shell on port 3000.
- `pnpm dev:legacy` starts the frozen reference app on port 4173.

The frozen application under `legacy/` is the behavioral oracle. Do not edit it
while migrating. The original root files were copied there before the TanStack
scaffold was added.

## Verification

- `pnpm typecheck` checks TypeScript.
- `pnpm test` runs unit and component tests.
- `pnpm test:e2e` runs legacy characterization tests without Firebase access.
- `pnpm build` creates the production build.
- `pnpm check` runs type checking, unit tests, and the production build.
- `pnpm test:app` runs the replacement browser suite against a production build.
- `pnpm check:release` runs the complete replacement and frozen-legacy gate.

Read `AGENTS.md`, `docs/migration/README.md`, and
`docs/migration/release-readiness.md` before changing behavior or deploying.
