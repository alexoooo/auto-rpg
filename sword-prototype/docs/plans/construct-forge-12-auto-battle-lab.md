# Session 12 -- make build, program, battle and diagnose one playable loop

## Outcome

Two saved constructs and Minds can be selected for repeatable auto-battle batches. The page explains
what happened at action, hardware and combat levels; the headless lab runs the same blueprints and
programs in parallel and returns indexed, mergeable results.

## Implement

Create `src/construct/matchup.ts` with canonical construct matchup identity: both saved digests,
faction/mirror, seed, arena/config digest and fixed bout cap. Setup offers saved constructs and Mind
programs independently only when their validation contracts agree.

Extend the live HUD with:

- active and recently refused actions per group;
- installed/lost capability changes;
- power, heat, reload and ammunition;
- selected Mind rule and decisive sensor values;
- damage/sever timeline associated with stable effector IDs.

Create `scripts/run-construct-bouts.mjs` over the same NullEngine/Havok recipe as `runBout` at
`scripts/measure.mjs#L219`. Flags: `--left`, `--right`, `--seeds`, `--mirrored`, `--workers`,
`--out` and `--resume`. Jobs are indexed before partitioning through `src/learning/jobs.ts`; worker
count changes scheduling only. Output contains raw per-bout rows plus aggregates for win/draw,
damage, severance, range, action request/admission/completion/refusal, idle/stuck time, energy,
heat and capability loss.

Create `scripts/construct-bout-worker.mjs`. Workers receive canonical saved bytes, never library
paths or mutable page state. Aggregation sorts by job index, refuses missing/duplicate rows and
keeps no partial report as final. Checkpoint every fixed job count so a five-minute run can be
interrupted and resumed byte-identically.

Add an Auto-battle Lab panel in `src/forge/lab-screen.ts`: run one visible bout, queue a small local
batch, compare two program revisions and open any raw row's explanation. Browser batches must not
pretend hidden-tab rendering is a performance measurement; headless wall/CPU utilisation is the
authority.

## Tests watched failing

Create `tests/construct-lab.test.mjs`:

- `page_and_headless_lab_run_the_same_construct_matchup_and_action_trace`
- `one_two_and_four_workers_produce_identical_indexed_rows_and_report_bytes`
- `an_interrupted_batch_resumes_at_the_first_missing_job_without_replaying_complete_rows`
- `a_changed_blueprint_program_arena_or_config_digest_refuses_resume_before_solver_work`
- `the_report_recomputes_every_aggregate_from_raw_rows`
- `an_action_that_never_completes_is_reported_as_stuck_not_as_activity`
- `the_Lab_explains_each_capability_loss_and_action_refusal_by_stable_ID`

Mutation proof: aggregate in worker completion order and introduce staggered worker delays; report
bytes must change before the fix and remain identical after it.

## Measure and accept

Measure worker scaling on this desktop at 1, 2, 4, 8 and `available_parallelism()` workers, bracketed
control -> subject -> control. Record total throughput, per-worker efficiency, CPU utilisation and
memory in `docs/measurements.md`; choose the default from evidence rather than core count.

The authored Warden Mind must produce a non-trivial action distribution and complete meaningful
bouts. If fights are mostly stuck, self-collision or time caps, sessions 13--15 are blocked and the
next session repairs the game rather than adding learning.

~~~powershell
npm test
npm run check
npm run build
~~~
