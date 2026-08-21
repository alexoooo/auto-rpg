# Session 01 -- The score cannot hide

**Status:** complete.
**Depends on:** the existing tactical-V2 model and `StrikePlanner`.
**Blocks:** session 02.

## Outcome

`lab learn-probe train|evaluate --action-layout tactical-v2 --opponent roster` means all shipped policies, not an average that can hide one losing matchup. Evaluation prints outcome, literal outside time, safe action, force, refusal and replay columns for every roster entry.

## Files

- `crates/learn/src/probe.rs` -- roster scoring, observed weapon-envelope evidence, full-effort evidence, and minimum aggregation.
- `crates/learn-core/src/checkpoint.rs` -- tactical-only opponent mask in `CheckpointV2`; the shipped V1 bytes stay exact.
- `crates/lab/src/learn_probe.rs` -- `roster` parsing, per-opponent held-out table and promotion verdict.
- `crates/learn/tests/training_smoke.rs`, tests beside `probe.rs`, and tests beside `checkpoint.rs` -- exact roster and evidence behavior.
- `docs/architecture/learning.md` and `docs/performance/v2-learning-probe.md` -- durable boundary and current measurement command.

## Required tests

- `the_roster_is_policy_kind_all_in_append_only_order`
- `roster_training_scores_the_worst_opponent_not_the_mean`
- `full_effort_or_decisive_withdrawal_is_safe_inside_the_weapon_envelope`
- `the_tactical_wrapper_never_offers_a_submaximal_attack`
- `a_tactical_checkpoint_records_the_exact_roster_mask`
- `the_v1_checkpoint_bytes_do_not_gain_a_roster_field`
- `held_out_tactical_evaluation_names_every_roster_entry`

Mutations must make the corresponding test red: replace minimum by mean, ignore the weapon tip, count commits as passive exposure, lower effort, omit one `PolicyKind`, or write the mask into V1.

## Verification

Run focused `learn-core`, `learn`, and `lab` tests first. Then run the full repository gate because this session changes crates and durable docs. No existing pin may move.
