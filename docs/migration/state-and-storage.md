# State, storage, and protocol compatibility

Do not rename or reinterpret any item in this document during parity work.

## Browser storage keys

| Key | Purpose | Compatibility requirement |
| --- | --- | --- |
| `curveFFA_state_v1` | Live tournament, setup form, active tab | Read existing values and preserve viewer no-write behavior |
| `curveFFA_admin_unlocked` | Browser-local unlock marker | Preserve boolean-string semantics |
| `curveFFA_admin_proof_hash` | Cached SHA-256 proof | Preserve until authentication is deliberately redesigned |
| `curveFFA_archive_index` | Archive summary array | Read/write without destructive migration |
| `curveFFA_archive_<id>` | Full archive entry | Preserve arbitrary existing IDs and annotations |
| `curveFFA_bracket_follow` | Browser-local followed unit | Preserve clear/set behavior |

## URL contract

- Query parameter: `t=<tournamentId>`.
- No parameter means organiser/local writer mode when unlocked.
- A parameter in a locked browser means read-only viewer mode.
- Promotion after unlock keeps the same tournament ID and URL.

## Firebase paths

- `adminAuth/verify`: write candidate proof hash for rules-based verification.
- `tournaments/<tournamentId>`: synchronized tournament payload.

Tests must not use these production paths. The eventual sync test environment
must accept injected Firebase configuration.

## Null serialization

Firebase drops null array elements. The legacy protocol recursively replaces
those values with an object keyed by `__ffaNull`, then reverses the operation on
receipt. This is part of the wire format.

## Root live state (`T`)

| Field | Meaning |
| --- | --- |
| `title` | Editable tournament name |
| `players` | Player-name strings or team objects |
| `reserves` | Reserve units matching player/team shape |
| `reserveIndividuals` | Individual team-member replacements |
| `confirmedCount` | Count captured by Load roster |
| `tournamentId` | Stable generation identity |
| `rounds` | Generated progression descriptors |
| `curRound` | Zero-based current round index |
| `scores` | Current/round scores keyed by legacy composite key |
| `finalScores` | Multi-game phase scores keyed by game and unit/member |
| `assignments` | Per-round unit/room assignments |
| `luckyLosers` | Per-round incoming lucky-loser identities |
| `byes` | Per-round bye identities |
| `poolingByeCounts` | Pooling-phase fairness counters |
| `pendingBracketSeeds` | Future non-adjacent double-elimination routes |
| `qualTable` | Cumulative Qualification/Swiss rows |
| `groups` | Fixed Group Stage membership |
| `groupStandings` | Per-group cumulative tables |
| `tieResolutions` | Explicit resolved winner by round/room key |
| `defenderChanges` | Append-only defender history by team |
| `reserveOpen` | Whether reserves/walk-ups may enter |
| `started` | Setup/preview versus running state |
| `needsSave` | Dirty archive-protection marker |
| `autoSaved` | Final auto-save guard |
| `cfg` | User-selected setup values used for generation |
| `scheduleLogic` | Active schedule registry key |
| `gameFormat` | Active format registry key |
| `gamemodeConfig` | Materialized format and phase parameters |

## Team shape

```text
{
  teamId: string,
  teamName: string,
  members: Array<{ name: string, userId?: string } | null>
}
```

Member positions matter for designated defenders. A `null` member is a genuine
vacant slot and must survive local, Firebase, and archive serialization.

## Persisted live envelope

```text
{
  T: <root live state>,
  setup: {
    scheduleLogic, gameFormat, scoring, poolingPhase, qualAdv,
    groupSize, roundRobinMode, qualifiersPerGroup,
    finalsGames, semisGames, grandFinalWbTarget, grandFinalLbTarget,
    semisOverride, finalOverride, lbQualifiers,
    oddCountStrategy, teamScoringRule, roster, reserves,
    reserveIndividuals
  },
  activeTab: "admin" | "scoreboard" | "bracket" | "rankings" | "archive"
}
```

Before implementing the persistence adapter, capture real fixtures for a fresh
setup, generated preview, running individual tournament, running team tournament,
completed tournament, and records predating each compatibility fallback.

## Archive shapes

Summary rows contain `id`, `title`, `dateSaved`, `tournamentId`, `playerCount`,
and `roundsPlayed`.

Full entries contain `id`, `title`, `dateSaved`, `tournamentId`, a deep `snapshot`
of `T`, and `annotations`. Import/export wrapper discriminator fields must be
captured from actual exported files before implementing the new importer.

## Compatibility policy

- Parse and normalize at the boundary; keep the new internal model typed.
- Never rewrite all existing browser data merely because it was read.
- Preserve unknown fields during round trips where the legacy app did.
- Add versioned migrations only after fixtures demonstrate why they are needed.
- Maintain a rollback path that lets the frozen app read data written by the new
  app until cutover is accepted.
