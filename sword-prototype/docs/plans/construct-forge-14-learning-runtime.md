# Session 14 -- build graph-policy inference and interruptible training software

## Status -- real physical smoke implemented, no research verdict 2026-08-28

BC labels and stochastic PPO trajectories now come from real `ConstructLabBout` worlds. A graph
policy enters through `ConstructControlEndpoint.installCommandSource`, so every request is
revalidated by the public scheduler. Indexed Worker threads commit physical shards atomically and
one/four-worker runs reproduce checkpoint/result bytes; a worker or coordinator-commit failure
terminates all still-live peers, covered by a deliberately mutation-proven test. `--smoke` proves finite loss, scheduler
admission and changed weights; it always reports `promotedArtifact: null` and is not gameplay
evidence. The production command still refuses before starting a worker while session 12 is red.
Worker construction rejection and unexpected nonzero exit now terminate already-started peers too.
Every assigned shard index must produce exactly one row: duplicate, unassigned or omitted rows
abort the peer set and cannot write a terminal report; smoke also requires the full declared count.
PPO includes a separately tested value-head loss, committed physical rows have an exact finite
stage/spec-bound schema, Adam consumes resumed moments, and the broad qualifier fingerprint is
fail-closed under a dependency mutation.
Continuous parameters use one representable open-interval clamp in sampling and rescoring, so an
extreme finite mean cannot emit an endpoint with a contradictory infinite likelihood. Frozen BC/PPO
candidate bytes have an independent boundary record naming exact weight, checkpoint, update,
config and protocol digests. The retained boundary checkpoint is independently reconstructed from
the initial state and committed canonical-index Adam updates both on resume and terminal recovery;
even a coupled self-consistent rewrite of candidate, boundary, artifact and terminal refuses.

## Outcome

A small graph policy can score a variable set of action candidates, choose compatible concurrent
requests and predict bounded parameters. Training, evaluation, checkpoint and resume software is
complete and byte-reproducible at one, two and four workers, but this session takes no promotion
verdict and spends no long-run budget.

## Model contract

Create `src/construct/learning/network.ts` with `CONSTRUCT_POLICY_VERSION = 2`:

1. Type-specific linear node encoders into one shared embedding width.
2. Two message-passing rounds over typed edges, with sum aggregation in canonical edge order.
3. Mean-pooled self and observed-opponent embeddings.
4. One shared candidate scorer over body embedding + action/group embedding, plus one STOP score.
5. Per-parameter numeric, boolean and enum heads selected by the installed descriptor.

Two rounds and the embedding width are contract constants, not tuning defaults. Any later change is
a policy-version change. The scheduler performs the final compatible-set admission exactly as for
an authored Mind; the network does not receive a private joint-control path.

Concurrent selection is one frozen autoregressive distribution, not an underspecified “softmax
over the live set.” Start with candidates in canonical action/group order. At each slot, softmax the
remaining claim-compatible candidates plus STOP, sample one, append it, mask its resolved claims
and repeat until STOP or exhaustion. PPO log probability is the sum of those categorical choices in
that order. Deterministic browser inference takes the highest logit with canonical-row tie-break.
Selected rows enter the scheduler at fixed priority 0 with autoregressive slot as source index; the
network cannot invent a higher priority or claim set. Because each selection masks resolved claims,
the public scheduler should admit all still-capable rows, but remains the authority if capability
changes on the edge.
For each selected continuous parameter the head emits finite mean and bounded log standard
deviation in unconstrained space; training samples there, applies sigmoid into declared bounds and
includes the transform Jacobian in log probability, while deterministic inference uses
`sigmoid(mean)`. Boolean parameters use Bernoulli logits and enum parameters use a categorical over
the descriptor's canonical value order; deterministic inference uses threshold 0.5 or highest logit
with canonical tie-break. Their log probabilities join the numeric terms and the autoregressive
candidate/STOP terms in one request-set probability. The public scheduler still revalidates and
admit/refuses the resulting set.

Create:

- `src/construct/learning/policy.ts` -- stateless v2 inference, candidate masking and diagnostic
  logits/parameters. Adding recurrence later is a policy-version change, not a smoke-run option.
- `src/construct/learning/checkpoint.ts` -- shape/version/contract/config identities and finite
  weights; browser-safe decoder.
- `src/construct/learning/teacher.ts` -- optional authored-program labels for behavior cloning,
  recorded at action boundaries rather than every physics step.
- `src/construct/learning/ppo.ts` -- candidate-set log probability, bounded parameter likelihood,
  value head and fixed-step temporal returns.
- `scripts/train-construct.mjs` and `scripts/construct-rollout-worker.mjs` -- indexed rollout shards,
  atomic job-indexed results, checkpoint cadence by update index and terminal finalization.

Reuse the worker-count-independent job discipline from current research, not its fixed humanoid
feature/action heads. A checkpoint records optimizer state, completed indexed-shard ledger,
training morphology split and authored-teacher digest. Resume refuses any mismatch before starting
a worker. Shard rows are committed immediately under their canonical job index, and update inputs
are read in index order. Rollout randomness comes only from frozen indexed job seeds; the unused
ornamental RNG field was removed rather than represented as exact resume state. Checkpoints write
weights, optimizer state and manifest to temporary
paths, decode and checksum them, then rename the complete bundle and publish its pointer last; a
crash exposes either the prior checkpoint or the whole next one. Deterministic rollout/update/report
bytes exclude wall time, CPU utilization, worker PID and completion order; those go to a separate
telemetry file and never affect resume or promotion.

## Tests watched failing

Create `tests/construct-learning.test.mjs`:

- `one_checkpoint_runs_two_four_and_six_limb_graphs_with_finite_supported_actions`
- `candidate_softmax_is_over_the_live_set_and_never_over_a_missing_action`
- `autoregressive_STOP_and_claim_masks_define_one_finite_concurrent_set_probability`
- `numeric_boolean_and_enum_parameter_heads_have_one_recomputable_joint_probability`
- `concurrent_requests_from_the_policy_still_pass_through_the_public_scheduler`
- `teacher_rows_are_action_boundaries_and_use_no_private_program_state`
- `one_two_and_four_workers_produce_identical_rollouts_updates_checkpoints_and_reports`
- `resume_restores_weights_optimizer_and_the_first_missing_indexed_shard_exactly`
- `a_partial_checkpoint_bundle_never_replaces_the_last_decodable_checkpoint`
- `training_telemetry_cannot_change_rollout_update_checkpoint_or_report_bytes`
- `stale_graph_action_program_teacher_or_config_identity_refuses_before_a_worker_starts`
- `the_browser_decoder_and_headless_trainer_agree_on_one_frozen_inference_digest`

Mutation proof: aggregate one message round in worker completion/object iteration order and require
the worker-count parity test to fail. Remove one candidate from the mask and require the live-set
normalization test to fail in both directions. Score candidates independently with a threshold and
require the frozen subset/log-probability fixture to fail.

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
