# Session 23 -- freeze and execute the blind tournament

## Outcome

Freeze exactly one validation-selected artifact for each algorithm, materialize the
tournament manifest, execute every indexed test row once, and recompute the verdict from raw
rows. It is valid for no controller to pass.

## Freeze

1. Confirm sessions 19--22 have complete reports with the exact common budget and the one
   session-18 compute-contract digest.
2. Select one artifact per algorithm using validation only. Record the selection argument in
   docs/measurements.md before creating the manifest.
3. Add scripts/freeze-tournament.mjs. It reads the four artifact files, validates each
   ResearchArtifact, records SHA-256 and byte size, uses
   researchMatrix("test", 20260919), records feature v4 and tactic v2, calls
   freezeTournamentManifest, and writes
   asset-src/learning/tournament-v1.json. It must refuse an existing manifest rather than
   overwrite it.
4. Create asset-src/learning/tournament-v1.rows.json containing an empty JSON array. From
   this point, thresholds, candidates, job order and the base seed are immutable.

Add a test for the freezer's no-overwrite rule and make it fail once by removing that guard.

## Execute and resume

~~~powershell
npm run ai:evaluate -- --split test --manifest asset-src/learning/tournament-v1.json --rows asset-src/learning/tournament-v1.rows.json --run-next --batch-size 64 --artifact neat-qd=PATH_TO_NEAT_ARTIFACT --artifact dagger=PATH_TO_DAGGER_ARTIFACT --artifact ppo=PATH_TO_PPO_ARTIFACT --artifact lookahead=PATH_TO_LOOKAHEAD_ARTIFACT
~~~

Repeat the identical command until remainingRows is zero. Atomic row persistence and indexed
holes make interruption resumable. Then omit --run-next and write the final report with
--output asset-src/learning/tournament-v1.report.json.

## Decide

- Verify artifact digest/size/algorithm, common cells, mirrors, controls, safety evidence,
  confidence intervals and all frozen gates.
- If one or more candidates pass, the pure verdict chooses the smallest statistically tied
  artifact, then algorithm/name order. Continue to session 24.
- If none passes, write the negative result into measurements, add a new numbered research
  session before session 24, and do not add a picker entry or lower a threshold.
