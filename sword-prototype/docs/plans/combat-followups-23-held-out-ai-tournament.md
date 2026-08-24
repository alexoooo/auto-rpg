# Session 23 -- freeze and execute the blind tournament

## Outcome

Freeze exactly one validation-selected artifact per **surviving** direction, materialize the
tournament manifest, execute every indexed test row once, and recompute the verdict from raw
rows. Fewer than four candidates is normal. It is valid for no controller to pass.

## Freeze

1. Confirm every surviving direction from session 22 has a complete report and ledger, that
   each report names its stop condition as `stopped: plateau` or `stopped: ceiling`, and that
   all of them ran under **one** session-20 compute-contract digest.
2. Confirm every candidate ran under **one balance-config digest**. Candidates from two
   different games cannot be ranked against each other; if a balance change split the set,
   either re-run the minority under the current game or state plainly in the manifest which
   game the tournament is about, and do not average across the split.
3. Select one artifact per surviving direction using validation only. Record the selection
   argument in `docs/measurements.md` before creating the manifest.
4. Add `scripts/freeze-tournament.mjs`. It reads the surviving artifact files -- however many
   there are -- validates each `ResearchArtifact`, records SHA-256 and byte size, uses
   `researchMatrix("test", 20260919)`, records feature v4, tactic v2, the compute-contract
   digest and the balance-config digest, calls `freezeTournamentManifest`, and writes
   `asset-src/learning/tournament-v1.json`. It must refuse an existing manifest rather than
   overwrite it, and it must refuse a champion-so-far artifact by header.
5. Create `asset-src/learning/tournament-v1.rows.json` containing an empty JSON array. From
   this point, thresholds, candidates, job order and the base seed are immutable.

Add tests for the freezer's no-overwrite rule, its champion-so-far refusal, and its
mixed-digest refusal. Make each fail once by removing its guard.

## Execute and resume

Bind only the directions that survived:

~~~powershell
npm run ai:evaluate -- --split test --manifest asset-src/learning/tournament-v1.json --rows asset-src/learning/tournament-v1.rows.json --run-next --batch-size 64 --artifact <direction>=<path> [--artifact <direction>=<path> ...]
~~~

Repeat the identical command until `remainingRows` is zero. Atomic row persistence and indexed
holes make interruption resumable. Then omit `--run-next` and write the final report with
`--output asset-src/learning/tournament-v1.report.json`.

The tournament is the one place in this plan set that runs to completion rather than to a
plateau: it is a fixed matrix, not a search. It still prints progress. If the matrix is long
enough that a person would wait more than an hour for a number, it emits the same one-line
summary the ledger does -- rows completed, rows remaining, elapsed -- on the same cadence.

## Decide

- Verify artifact digest, size and direction; common cells, mirrors, controls, safety evidence,
  confidence intervals and every frozen gate.
- If one or more candidates pass, the pure verdict chooses the smallest statistically tied
  artifact, then direction and name order. Continue to session 24.
- If none passes, write the negative result into `docs/measurements.md` with each candidate's
  full gate table and signed margins, and **do not** add a picker entry or lower a threshold.
  The next session is chosen the way session 21's kill branch chooses one -- fitness shape,
  observation, expression, or the opportunity definition -- argued from the tournament rows and
  the ledgers. A fifth method run blind is not the answer to four that failed.
