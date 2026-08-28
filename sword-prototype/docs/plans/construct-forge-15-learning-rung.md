# Session 15 -- run a measured, interruptible construct-learning ladder

## Entry gate

Session 14 is green, session 12's authored controls remain competent and session 16's human review
schedule is written before any candidate is seen. Throughput is measured on the current desktop;
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
- checkpoint cadence producing at least one ledger row per hour;
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
- `the_tournament_recomputes_its_verdict_from_raw_rows_and_frozen_thresholds`
- `no_passing_candidate_writes_no_promoted_artifact`

Adversarial review must attempt sensor leakage, missing-action fallback, test-set selection, partial
checkpoint publication, worker-order dependence and a construct that wins by doing nothing.

## Decide

- **Pass:** freeze candidate bytes/digests and hand them to session 16. Do not add a picker entry yet.
- **No progress at rung 1:** stop. Diagnose observation, action/controller quality or reward; do not
  buy a larger run.
- **Learning improves training but not held-out morphology:** record the generalization failure and
  keep the authored Mind as the game.
- **Safety/lifecycle failure:** block promotion regardless of score.

The run is intentionally interrupt-friendly: indexed shards and update checkpoints mean five- to
ten-minute compute windows make valid forward progress, while a killed in-flight shard is replayed
once on resume.
