# Session 15 -- run a measured, interruptible construct-learning ladder

## Status -- software ladder hardened; production entry remains closed 2026-08-28

The production rung remains stopped at its entry gate. The former source `ee9a247a` / run `62944ccf`
corpus is explicitly superseded: its seed field did not alter physical initial conditions, so four
nominal seeds were duplicates apart from mirror. No production behavior-cloning run, PPO run or
held-out tournament was started, and no artifact was promoted. The measured worker-scaling bracket
remains valid for selecting eight workers for the same eight-job shape. The replacement source
`3780627d` / run `d0e8011a` corpus is a real seeded qualification and was rejected: all eight bouts
time-capped, with 234,442 stuck steps and two rows without bilateral damage. Its 212 named
resource/hardware transitions are informational and its unexplained capability-loss count is zero.

The reusable execution boundary is nevertheless implemented: the playtest protocol and schedule
are frozen in code, completed indexed physical shards are atomically durable even when an earlier
index is missing, fixed update bundles reduce in canonical index order, checkpoint bundles publish
their pointer last, and terminal recovery starts zero new rollouts. The production job grammar is
BC -> PPO -> frozen validation -> held-out tournament over a sealed limb/mount/mass/program split.
`npm run construct:train` writes the durable negative result; `--smoke` runs physical BC/PPO without
representing research evidence, and `npm run construct:watch -- --run <directory>` remains read-only.
The production gate must be re-measured after brace convergence, fire tracking convergence and
decisive bout completion are repaired rather than changed to admit this workload. The earlier durable fail-closed result had
zero shards, zero updates and `promotedArtifact: null` under a now-stale schedule. The current
immutable protocol digest is `0cf3bb85` and corpus metadata digest is `95ef233c`; the replacement
qualification ran under those exact identities and did not authorize production work.
The post-qualification production invocation returned config digest `a8d8cf04`, zero completed
shards, zero updates and no promoted artifact.

The production path now freezes BC/PPO candidates, selects only from validation rows, opens held-out
saves only at the held-out worker stage, and recomputes a raw-row tournament manifest containing the
selected, authored and prior-frozen competitors before promotion. Sparse, non-finite or stale
stage/morphology/candidate rows refuse before worker work or promotion. Motor-limit saturation,
self-collision starts and victory are measured from the physical shard alongside the prior safety
fields. Validation and held-out safety gates aggregate only the selected candidate's rows: unsafe
losing candidates or baselines cannot veto it, while any unsafe selected row remains fatal. Corpus
digest `95ef233c` folds frozen split/recipe metadata and base-definition bytes without materializing
a `SavedConstruct`; the materialization audit stays empty until an explicit stage opens a split
entry. Validation expands four declared scenario cells across both BC/PPO candidates and verifies
exact pair coverage before selection. Held-out expands eight shared seed/mirror/test cells across
selected, prior-frozen and authored competitors (24 shards) and compares paired raw rows. Wired
production-path tests prevent these boundaries and the selection/tournament helpers
from remaining unused side utilities.

Mutable entry evidence is excluded from the immutable protocol digest, while the qualification
source/run digest is folded into production config identity carried by shards, checkpoints,
candidates and terminals. Startup and terminal recovery recheck the live entry flag, source/runtime
fingerprint and protocol before reading old work. Terminal v2 additionally verifies exact schema,
checkpoint/candidate provenance and named artifact/manifest digests before reporting `recovered`.

## Entry gate

Session 14 is green, session 12's authored controls remain competent and the immutable session-16
human assignment/protocol manifest is committed before any candidate is seen. Create
`src/construct/playtest.ts` with `CONSTRUCT_PLAYTEST_PROTOCOL_VERSION`, the exact assignments,
questions and canonical digest; changing it after candidate inspection is a protocol-version bump.
Throughput is measured on the current desktop;
no solver-step or wall-time ceiling is copied from the humanoid research topic.

## Outcome

Determine whether graph-policy learning improves construct auto-battle across held-out morphologies.
Publish either one fully qualified candidate or a durable negative result naming where the approach
failed. A least-bad network is not promoted.

## Freeze before running

Create `docs/measurements.md` entries and `src/construct/learning/schedule.ts` from measurements:

- bracketed rollout/update throughput at supported worker counts;
- selected within-run worker topology and concurrent-seed topology;
- update ceiling from at most one interruptible day per seed;
- shard size whose one-worker measured upper bound is below five minutes, with one atomic
  job-indexed result written after every completed shard, canonical state regenerated in job-index
  order and an optimizer checkpoint after every fixed update bundle;
- plateau window/delta and explicit ceiling-hit status;
- train/validation/test morphology and opponent split fixed by saved digests.

The training split must vary limb count, mount module, mass distribution and program opponent. Test
blueprints/programs are sealed before selection and opened exactly once after a frozen validation
candidate exists.

## Ladder

1. **Authored control.** The committed Warden Mind is the factual baseline.
2. **Behavior cloning.** Match its legal action/capability behavior on training and validation
   morphologies; report divergence and exact unsupported/refused rates.
3. **PPO fine-tuning.** Optimize damage/victory only after capability, finite-command, lifecycle and
   stuck-action gates pass. Reward cannot pay for surviving a time cap without engagement.
4. **Held-out tournament.** Frozen candidate versus authored Minds and prior frozen candidates on
   test morphologies, both mirrors and declared seeds.

Every stage has an advance/kill rule written into `src/construct/learning/schedule.ts`. The ledger
reports morphology cell, action diversity, capability refusals, motor saturation, self-collision,
damage, victory, time cap and all safety flags. `npm run ai:watch` remains for humanoid research;
add `npm run construct:watch -- --run <directory>` as a read-only construct-specific watcher.

## Tests and adversarial proof

Extend `tests/construct-learning.test.mjs` and add `tests/construct-tournament.test.mjs`:

- `validation_selects_without_reading_any_test_row`
- `a_candidate_with_a_dead_morphology_or_action_group_cannot_win_on_mean_score`
- `time_cap_survival_cannot_outscore_a_damaging_loss`
- `terminal_checkpoint_recovery_finalizes_without_spending_another_rollout`
- `a_worker_count_change_or_five_minute_interruption_reproduces_final_bytes`
- `each_completed_sub_five_minute_shard_is_durable_before_the_next_starts`
- `the_tournament_recomputes_its_verdict_from_raw_rows_and_frozen_thresholds`
- `no_passing_candidate_writes_no_promoted_artifact`
- `schedule_identity_does_not_materialize_a_sealed_corpus_save`
- `bad_nonselected_validation_and_baseline_rows_do_not_veto_the_selected_candidate`
- `a_bad_selected_held_out_row_vetoes_promotion`

Adversarial review must attempt sensor leakage, missing-action fallback, test-set selection, partial
checkpoint publication, worker-order dependence and a construct that wins by doing nothing.

## Decide

- **Pass:** freeze candidate bytes/digests and hand them to session 16. Do not add a picker entry yet.
- **No progress at rung 1:** stop. Diagnose observation, action/controller quality or reward; do not
  buy a larger run.
- **Learning improves training but not held-out morphology:** record the generalization failure and
  keep the authored Mind as the game.
- **Safety/lifecycle failure:** block promotion regardless of score.

The run is intentionally interrupt-friendly: indexed shards are measured below five minutes at one
worker and every completed shard is durable even when an earlier index or its update bundle is
still running. Five- to ten-minute windows therefore make valid forward progress; resume replays at
most the one killed in-flight shard per worker and never a completed shard. An hourly-only
checkpoint does not satisfy this contract.
