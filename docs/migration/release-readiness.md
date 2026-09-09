# Release readiness and cutover

## Automated evidence

The migration branch now has one reproducible release gate:

```text
pnpm check:release
```

It runs TypeScript validation, all deterministic domain/persistence/sync tests,
the production build, the replacement browser suite, and the frozen-legacy
characterization suite. Firebase traffic is blocked or replaced by an injected
in-memory transport in every automated browser test.

The parity matrix covers all 40 supported combinations of:

- FFA, 2v2v2v2, 3v3v3, 3v3, and 1v1;
- their compatible single- or double-elimination schedule;
- no pooling, Qualification, Swiss, and Group Stage;
- 1–4 game Semis and Finals.

It also covers stored-state normalization, every schedule topology and routing
primitive, scoring/ties/byes/lucky losers, roster mutations, rankings, archive
round trips, multi-writer merge rules, desktop flows, and the 390 px viewport.

## Production build contract

- Build: `pnpm build`
- Start: `pnpm start`
- Artifact: `.output/`
- Runtime: a Node-compatible host capable of running
  `.output/server/index.mjs`
- Health smoke: `GET /` must return HTTP 200 before traffic is switched.

The final local production smoke returned HTTP 200 from the generated Node
server. No provider-specific deployment file is committed because the hosting
provider has not yet been identified.

## Rollback rehearsal

The frozen browser application remains under `legacy/`, passes its own full
browser suite, and matches `docs/migration/legacy-sha256.txt`. The original
pre-migration tree is also tagged as `pre-tanstack-migration-2026-09-09`.

For a rollback, deploy that tag from a separate checkout or redeploy the last
known-good legacy artifact. Do not reset the migration branch. The React app
continues to use the legacy local-storage keys, Firebase paths, null sentinel,
and archive/export shapes, so its saved data remains readable by the frozen app.

## Cutover sequence

1. Record the current production deployment/version and retain its artifact.
2. Run `pnpm check:release` on the exact commit to deploy.
3. Deploy `.output/` to a Node-compatible preview environment.
4. Manually verify Admin unlock, one representative complex tournament, a
   second writer, a viewer link, reload, Final completion, archive export/import,
   and desktop/390 px presentation.
5. Confirm the deployed Firebase rules still authorize `adminAuth/verify` and
   `tournaments/<id>` with the existing proof protocol.
6. Switch production traffic and monitor the first two real tournaments.
7. Keep the rollback artifact/tag available for the agreed rollback window.
8. Rotate the shared admin credential after cutover validation.

## Owner sign-off still required

- Hosting provider, production URL, and deployment command/permissions.
- Deployed Firebase Realtime Database rules, or confirmation they are unchanged
  from the rules already exercised by the legacy production app.
- Browser/visual acceptance (recommended: current Chrome and Edge plus 390 px).
- Rollback-window duration and approval to switch production traffic.

