# Session 14 -- build graph-policy inference and interruptible training software

## Outcome

A small graph policy can score a variable set of action candidates, choose compatible concurrent
requests and predict bounded parameters. Training, evaluation, checkpoint and resume software is
complete and byte-reproducible at one, two and four workers, but this session takes no promotion
verdict and spends no long-run budget.

## Model contract

Create `src/construct/learning/network.ts` with `CONSTRUCT_POLICY_VERSION = 1`:

1. Type-specific linear node encoders into one shared embedding width.
2. Two message-passing rounds over typed edges, with sum aggregation in canonical edge order.
3. Mean-pooled self and observed-opponent embeddings.
4. One shared candidate scorer over body embedding + action/group embedding.
5. Per-parameter bounded heads selected by parameter type.

Two rounds and the embedding width are contract constants, not tuning defaults. Any later change is
a policy-version change. The scheduler performs the final compatible-set admission exactly as for
an authored Mind; the network does not receive a private joint-control path.

Create:

- `src/construct/learning/policy.ts` -- inference, recurrent state if measured necessary, candidate
  masking and diagnostic logits/parameters.
- `src/construct/learning/checkpoint.ts` -- shape/version/contract/config identities and finite
  weights; browser-safe decoder.
- `src/construct/learning/teacher.ts` -- optional authored-program labels for behavior cloning,
  recorded at action boundaries rather than every physics step.
- `src/construct/learning/ppo.ts` -- candidate-set log probability, bounded parameter likelihood,
  value head and fixed-step temporal returns.
- `scripts/train-construct.mjs` and `scripts/construct-rollout-worker.mjs` -- indexed rollout shards,
  append-only ledger, checkpoint cadence by update index and terminal finalization.

Reuse the worker-count-independent job discipline from current research, not its fixed humanoid
feature/action heads. A checkpoint records optimizer state, RNG/index state, completed shard ledger,
training morphology split and authored-teacher digest. Resume refuses any mismatch before starting
a worker.

## Tests watched failing

Create `tests/construct-learning.test.mjs`:

- `one_checkpoint_runs_two_four_and_six_limb_graphs_with_finite_supported_actions`
- `candidate_softmax_is_over_the_live_set_and_never_over_a_missing_action`
- `concurrent_requests_from_the_policy_still_pass_through_the_public_scheduler`
- `teacher_rows_are_action_boundaries_and_use_no_private_program_state`
- `one_two_and_four_workers_produce_identical_rollouts_updates_checkpoints_and_reports`
- `resume_restores_weights_optimizer_rng_and_the_first_missing_shard_exactly`
- `stale_graph_action_program_teacher_or_config_identity_refuses_before_a_worker_starts`
- `the_browser_decoder_and_headless_trainer_agree_on_one_frozen_inference_digest`

Mutation proof: aggregate one message round in worker completion/object iteration order and require
the worker-count parity test to fail. Remove one candidate from the mask and require the live-set
normalization test to fail in both directions.

## Smoke, not research

Run only enough indexed updates to prove loss moves, checkpoint/resume is exact and the policy can
complete a finite bout. Do not call a falling loss, one win or imitation of the authored Mind a
learned gameplay result.

~~~powershell
npm test
npm run check
npm run build
node scripts/train-construct.mjs --smoke
~~~
