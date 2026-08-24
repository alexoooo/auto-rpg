# Session 17 -- experiment C: recurrent PPO self-play

## Hypothesis

A policy-gradient learner at tactical option boundaries can learn credit across a complete
chamber/commit/recovery while reusing trajectories more efficiently than perturbing a whole
network. Recurrent state supplies short combat memory; a frozen opponent league prevents one
specialist exploit from masquerading as general play. The algorithm follows
[Schulman et al.'s PPO](https://arxiv.org/abs/1707.06347); the existing temporally extended
actions provide the option boundary rather than adding tick-level joint authority.

## Implement

1. Add `src/learning/recurrent-network.ts`: feature v3 plus previous movement/action enters a
   32-unit GRU, two categorical policy heads and one scalar value head. Inference uses masked
   deterministic argmax; training may sample from the seeded categorical distributions.
2. Add `src/learning/ppo.ts` with generalized advantages, clipped policy/value losses,
   entropy reporting, gradient-norm clipping and deterministic minibatch permutation. Keep all
   floating-point training outside combat authority; only a frozen artifact reaches runtime.
3. In `scripts/train-ppo.mjs`, make one decision when the composed tactic terminates or its
   bounded persistence expires. Reward is terminal outcome plus telescoping vitality/damage
   potential; a bounded near-range progress term may shape training, but attempts, raw
   contacts, elapsed survival and range occupancy pay nothing. Print every component.
4. Build an indexed league from shipped specialists, scripted meta, random meta, fixed DAgger
   champions and the last four PPO validation champions. Self-play snapshots never replace
   controls, and opponent selection is part of the config digest.
5. Train two predeclared arms per seed under equal solver steps: seeded random initialization
   and the frozen session-16 DAgger initialization. Validation selects between arms; test does
   not. Add `npm run ai:research -- --idea ppo`.
6. Serialize optimizer/resume state separately from the inference artifact. Worker count,
   interruption and resume must reproduce selected checkpoint and raw report bytes.

## Tests first

Add `tests/ppo.test.mjs`:

- `masked_policy_heads_never_sample_or_argmax_an_unsupported_tactic`
- `a_tactic_produces_one_return_across_its_complete_temporal_boundary`
- `telescoping_progress_cannot_be_farmed_by_crossing_one_range_boundary_repeatedly`
- `a_healthy_time_limit_retreat_earns_less_than_a_damaging_exchange`
- `ppo_clipping_and_advantages_match_the_pinned_hand_calculation`
- `seeded_minibatches_and_league_jobs_are_worker_count_independent`
- `the_frozen_league_cannot_be_rewritten_by_the_current_training_worker`
- `random_and_dagger_initializations_receive_the_same_solver_step_budget`
- `ppo_resume_reproduces_weights_optimizer_state_and_report_bytes`
- `deterministic_inference_replays_the_same_tactic_sequence`

Mutation-check action masking, per-frame returns, positive duration reward, unstable minibatch
order, a live league reference and test-based arm selection.

## Research decision

Run three seeds and report both initialization arms. Freeze one validation champion per seed
using macro and worst-cell gates; do not pick a more entertaining browser run. Every frozen
champion advances to the blind tournament even when PPO fails its own expectations.

```powershell
npm test
npm run check
npm run build
npm run ai:research -- --idea ppo --seed 310013 --workers 8 --solver-steps 1800000000
npm run ai:research -- --idea ppo --seed 310019 --workers 8 --solver-steps 1800000000
npm run ai:research -- --idea ppo --seed 310031 --workers 8 --solver-steps 1800000000
```
