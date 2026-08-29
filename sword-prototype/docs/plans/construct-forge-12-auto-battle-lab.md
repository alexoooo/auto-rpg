# Session 12 -- make build, program, battle and diagnose one playable loop

## Status -- implemented infrastructure; current seeded gameplay corpus rejected 2026-08-28

Canonical matchup identity, the shared page/headless solver adapter, indexed parallel workers,
atomic out-of-order resume, canonical reports, separate telemetry and the Lab panel are implemented.
The panel selects left and right bodies and Minds independently, rejects either body/Mind control
contract mismatch, runs a real saved-definition Visible Bout, and runs Batch/Compare in isolated
browser Havok worlds that cannot alter the visible arena's body census. The final frozen four-seed,
mirrored, full-cap corpus and bracket are in `docs/measurements.md`: canonical bytes agreed at
1/2/4/8/default workers and eight workers were selected. That topology measurement remains useful,
but its gameplay corpus is not qualification evidence: seed was then only an identity label.
`ConstructLabBout` now consumes a bounded deterministic, mirror-correct initial-condition
perturbation, with exact same-seed replay and different-seed physical divergence tests. Capability
loss/stuck accounting now follows exact live action/group capability rows and runtime reasons, not
attached module groups. Brace progress is the largest live joint target error; recover progress is
the full roll/pitch tilt magnitude, so a pitch-dominant construct that makes no recovery progress
cannot pass the stuck classifier's within-epsilon exemption. A mutation regression drives that
pitch-dominant case through the real scheduler/controller and requires a stuck interval. Resume
identity folds Lab protocol, sensor catalog, Babylon/Havok/package
runtime and Node environment. Attached construct recording also queues every command envelope and
flushes terminal cancellations at handover, verdict and disposal; the real `FightEnd` transition
proves both sides publish exactly once without a post-verdict sample. The replacement seeded
eight-worker corpus has now been run and rejected: 8/8 time caps, 234,442 stuck steps and 2/8 rows
without bilateral damage. The report retains 212 named resource/hardware transitions as telemetry
and records zero unexplained capability disappearances. The entry gate remains false.

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

“Stuck” is derived from an admitted action's own progress metric and controller phase remaining
outside its declared epsilon for a fixed number of physics steps while capability stays available.
Repeated requests, elapsed wall time or a non-empty active list are not substitutes: each has a
second cause. The raw rows retain the progress samples used by the aggregate.

Create `scripts/construct-bout-worker.mjs`. Workers receive canonical saved bytes, never library
paths or mutable page state. On each completion the coordinator validates the identity and writes
that one row atomically to a zero-padded job-index path; an already-present different row is a
duplicate refusal. Resume scans those committed rows, so an out-of-order completed job is durable
without making completion order authoritative. Canonical `rows.jsonl`, resume state and final
aggregation are regenerated in ascending job index and therefore have identical bytes at every
worker count. Missing rows refuse and no partial report is final. Choose a shard/job size whose
measured one-worker upper bound is below five minutes--never an elapsed-time checkpoint--so an
interruption replays at most the one running job per worker and never a completed job.

Write deterministic `rows.jsonl`, `state.json` and `report.json` separately from
`telemetry.json`. Wall time, CPU utilization, worker completion order and memory belong only to
telemetry and are excluded from matchup identity, resume decisions and byte-parity assertions.

Add an Auto-battle Lab panel in `src/forge/lab-screen.ts`: run one visible bout, queue a small local
batch, compare two program revisions and open any raw row's explanation. Browser batches must not
pretend hidden-tab rendering is a performance measurement; headless wall/CPU utilisation is the
authority.

## Tests watched failing

Create `tests/construct-lab.test.mjs`:

- `page_and_headless_lab_run_the_same_construct_matchup_and_action_trace`
- `one_two_and_four_workers_produce_identical_indexed_rows_and_report_bytes`
- `wall_and_CPU_telemetry_cannot_change_canonical_report_or_resume_bytes`
- `an_interrupted_batch_resumes_at_the_first_missing_job_without_replaying_complete_rows`
- `an_out_of_order_completed_job_is_durable_before_the_contiguous_prefix_reaches_it`
- `a_changed_blueprint_program_arena_or_config_digest_refuses_resume_before_solver_work`
- `the_report_recomputes_every_aggregate_from_raw_rows`
- `an_action_that_never_completes_is_reported_as_stuck_not_as_activity`
- `the_Lab_explains_each_capability_loss_and_action_refusal_by_stable_ID`

Mutation proof: aggregate in worker completion order and introduce staggered worker delays; report
bytes must change before the fix and remain identical after it. Add wall time to `report.json` and
require worker-count parity to fail. Delay the lowest job, kill after a higher row is committed and
require resume not to execute that completed higher job again.

## Measure and accept

Measure worker scaling on this desktop at 1, 2, 4, 8 and `available_parallelism()` workers, bracketed
control -> subject -> control. Record total throughput, per-worker efficiency, CPU utilisation and
memory in `docs/measurements.md`; choose the default from evidence rather than core count.

The authored Warden Mind must produce a non-trivial action distribution and complete meaningful
bouts. If fights are mostly stuck, self-collision or time caps, sessions 13--15 are blocked and the
next session repairs the game rather than adding learning. If measured repair is rejected or still
fails, write a durable `construct-learning-entry: rejected` row with raw evidence and reason. That
explicit early-negative record permits session 16 to close or retain the authored game without
building learning software; absence of a row is not a negative result. That early-negative commit
also freezes `src/construct/playtest.ts` with the session-16 authored-only assignments and protocol
digest, before the first human sitting.

~~~powershell
npm test
npm run check
npm run build
~~~
