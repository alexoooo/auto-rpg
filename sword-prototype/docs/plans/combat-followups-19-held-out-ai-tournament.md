# Session 19 -- blind held-out AI tournament

## Outcome

Compare NEAT-QD, DAgger, PPO and look-ahead with the same untouched test cells and decide from
raw evidence whether any controller is reasonable enough to ship. The highest mean is not
automatically the winner, a browser favorite cannot overturn a failed gate, and "best of
four" is allowed to mean "none".

## Freeze before opening test

1. Validate that all algorithms have complete train reports, validation-selected artifact
   digests, identical feature/action tables, the common solver-step budget and no prior test
   rows. Freeze the tournament manifest and its digest in `asset-src/learning/`.
2. The matrix in `src/learning/research-matrix.ts` contains both sides and mirrors for Warrior,
   Broot and Centipede across every compatible sword, shield, axe, bow, bare-hand and natural-
   attack cell, against shipped specialists, scripted meta and fixed candidate snapshots.
3. Predeclare the selection rule:
   - zero finite/anatomical, capability, post-verdict, stuck-action or lifecycle failures;
   - macro held-out win score strictly above scripted and random meta controls;
   - no compatible unit/loadout cell with zero meaningful engagement;
   - opportunity attack rate >= 0.65 and attack contact rate >= 0.20 in every compatible cell;
   - near-range stall share <= 0.15, first-attack p90 <= 6 s and symmetric cap rate <= 0.10;
   - worst-cell score no more than the existing 15-point tolerance below its specialist;
   - at least three non-recover actions occupy >= 8% where capabilities permit them.
4. Thresholds, controller order and artifacts are immutable after the first test job starts.
   Run the complete test once; interruption resumes missing indexed rows rather than starting
   a fresh seed range.

## Implement and report

Extend `scripts/evaluate-ai.mjs` to write raw rows, aggregates, confidence intervals, artifact
digests, exact manifest and a recomputable verdict. Add `src/learning/tournament.ts` as the
pure verdict function. Report wall time and decisions/second separately; do not give a slower
planner easier opponents or a smaller matrix.

If multiple candidates pass, choose the smallest/cheapest artifact whose confidence interval
is not worse than the top result, with algorithm-name order as the final frozen tie-break. If
none passes, write the failure report into `docs/measurements.md`, add at least one new
numbered research session before session 20, and leave the plan open. Never register the
least-bad controller or tune on these rows.

## Tests first

Add `tests/ai-tournament.test.mjs`:

- `all_controllers_run_the_same_cells_seeds_mirrors_and_opponents`
- `a_candidate_with_the_best_mean_but_a_dead_cell_is_rejected`
- `a_candidate_that_wins_by_time_limit_avoidance_is_rejected`
- `a_candidate_that_reads_an_unsupported_capability_is_rejected_by_name`
- `selection_uses_validation_and_test_is_opened_exactly_once`
- `reordering_controllers_does_not_change_any_fight_record_or_verdict`
- `the_tournament_report_recomputes_its_verdict_from_raw_rows`
- `no_passing_candidate_produces_no_promoted_artifact`
- `a_statistical_tie_selects_the_frozen_smaller_then_named_candidate`

Mutation-check dropping the weakest cell, draws as half-wins, a reused train seed, averages
without raw mirrors, changed post-test threshold and unconditional highest-mean registration.

```powershell
npm test
npm run check
npm run build
npm run ai:evaluate -- --split test --manifest asset-src/learning/tournament-v1.json
```

