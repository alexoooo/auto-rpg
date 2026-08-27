# Session 23 -- freeze and execute the blind tournament

> **Corrections, 2026-08-26.** This is the most current file in the set; two additions.
>
> - **The manifest's `controls` field is a frozen three-tuple** and `freezeTournamentManifest`
>   hard-codes it. Binding the per-candidate ablation controller this plan calls for touches
>   `TOURNAMENT_CONTROLS` or the candidate shape, `validateTournamentManifest`,
>   `controllersFor`, `mindFactoryForTournament` and `nextTournamentBatch`. Name those five so
>   the freezer's tests are written against them.
> - **The stroke-envelope question inherited from session 17 is closed.** `4d461ea` took a
>   cut's `high` reach to 0.166 against `low`'s 0.019 via `NAMED_STROKE_SPAN`.
> - **`npm run ai:evaluate -- --verify-promoted` does not exist** -- zero occurrences in the
>   tree -- and sessions 24 and 25 both invoke it. Either this session or 24 must own building
>   it.
> - **Tournament safety is no longer a placeholder.** The executor observes finite/anatomical
>   commands, exact capability legality, post-verdict action, stuck tactics and a successful
>   return after teardown for each real bout, and refuses missing or invented evidence. This is
>   not the integration audit's resource census. Session 23 consumes those booleans; it does not
>   implement or default them.

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
5. **Bind one ablation arm per candidate.** For each frozen artifact, register a fourth
   controller that runs *the same artifact* with its effector head clamped to the scripted
   `chooseEffector(view, action, "primary")` search. The manifest grows an ablation binding
   beside each candidate; the job list grows by one controller's worth of rows.

   **Why this is a controller and not a report field.** Head utilisation describes what a head
   did; it cannot say whether doing it mattered. Measured, both meta controls call
   `chooseEffector`, which returns `primary` whenever `primary` is legal -- and `primary` is
   legal for every free-effector action on every cell in the matrix. So on free decisions the
   scripted baseline is 100 % `primary` with probability 1, by construction. A candidate
   reporting "100 % `primary` on 120 free decisions" is therefore indistinguishable from one
   that rediscovered the scripted hand search, and neither is distinguishable from a dead head.
   The ablation arm is the only thing in this plan set that can tell the three apart, and
   "did the widened 26-output contract earn its width" is exactly the question it answers.

   The arm is not a gate. It does not decide promotion; it decides what may be *written* about
   why a candidate won.
6. Create `asset-src/learning/tournament-v1.rows.json` containing an empty JSON array. From
   this point, thresholds, candidates, ablation bindings, job order and the base seed are
   immutable.

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
- **Read `report.utilisation`, per cell and not only pooled, and apply the sample-size floor
  before writing any sentence about a head.** To call a head collapsed when all *n* of its free
  choices picked the same option -- rejecting "it picks another option at least 10 % of the
  time" at 95 % -- needs `0.9^n <= 0.05`, so **n >= 29**. Below that the honest verdict line is
  "insufficient evidence", not "the head did not vary". This gates a sentence, not a candidate:
  head utilisation is reported and never gated, and `headUtilisation`'s own docstring carries
  the reason.

  **Stance and persistence now carry their own missing-head evidence.** A look-ahead candidate
  has no stance head and declares one option, while the three learned controllers declare their
  head width; the producer also narrows a centipede to one because that body consumes no posture.
  Therefore `freeChoiceDecisions: 0` means the stance was constant by construction, while a
  non-zero free denominator beside `chosen: 1` is a learned head that settled on one option.

  The persistence row was the model for this repair. PPO once wrote the constant `0.4`
  and there was no dwell row at all, because the joint tuple key has five names and the dwell is
  not one of them. There is a row now, over `persistenceCounts`, and it separates the two
  readings on its own: `freeChoiceDecisions: 0` means the controller declared no dwell head
  (today only `lookahead`, whose re-decision condition has no clock term either), and
  `freeChoiceDecisions` equal to `decisions` with `chosen: 1` means a head that had all eight
  bins and used one of them. Apply the same `n >= 29` floor to it: at the 0.40 bin a look-ahead
  or PPO candidate takes about 20 decisions in a 10-second bout, so the floor is a real gate on
  the sentence rather than a formality.
- **State what the matrix could not ask.** `sword+axe` **is** in the strata as of 2026-08-25, so
  `cut` names two hands on two of the fifteen cells and an attacking action has an effector
  choice on four. Of the other eleven, eight offer a choice on `cover` and `recover` alone -- so
  the denominator there is "how often did it defend" -- and three offer none at any time, the two
  `bow+empty` cells and the centipede. Name the cells where the question was unanswerable rather
  than folding them into a pooled share; the pooled share moved from 23.4 % to 20.1 % on this
  change alone, which is what a pooled share does.
- If one or more candidates pass, the pure verdict chooses the smallest statistically tied
  artifact, then direction and name order. Continue to session 24.
- If none passes, write the negative result into `docs/measurements.md` with each candidate's
  full gate table and signed margins, and **do not** add a picker entry or lower a threshold.
  The next session is chosen the way session 21's kill branch chooses one -- fitness shape,
  observation, expression, or the opportunity definition -- argued from the tournament rows and
  the ledgers. A fifth method run blind is not the answer to four that failed.
