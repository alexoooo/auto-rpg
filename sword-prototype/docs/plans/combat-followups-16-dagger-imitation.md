# Session 16 -- experiment B: DAgger tactical imitation

## Hypothesis

Evolution spent most of its budget discovering that retreat is easy. A deterministic tactical
teacher can supply useful movement/action labels, while dataset aggregation exposes the
teacher to states the learner actually causes instead of only clean scripted trajectories.
This is a distinct supervised/imitation direction, based on
[Ross, Gordon and Bagnell's DAgger](https://proceedings.mlr.press/v15/ross11a/ross11a.pdf).

The teacher may use exact geometry to choose a label during training, but the stored row is
only feature v3 and the deployed learner receives no privileged field.

## Implement

1. Add `src/learning/tactical-teacher.ts`. From one frozen view it labels both heads: attack
   when a capable striker has a real opportunity, cover against an incoming threat, close
   radially when outside usable reach, hold/intercept rather than orbit inside reach, and
   disengage only for crowding or measured danger. Tie order is explicit and unknown
   capabilities refuse.
2. Add `src/learning/dagger.ts`: a deterministic stratified dataset, class balancing, a small
   two-head MLP with persistence output, cross-entropy training and provenance. Store feature
   rows, labels, source cell/seed/step and teacher version; never store Babylon objects.
3. Add `scripts/collect-dagger.mjs`. Iteration 0 rolls the teacher. Each later iteration rolls
   the current learner on train cells, queries the teacher on those visited states, aggregates
   them, retrains from the same initialization and freezes the validation-best iteration.
   Use five predeclared iterations and the common solver-step budget.
4. Optionally admit session-08 human traces only as a separately reported train stratum with
   explicit consent and schema; absence of human data cannot block or weaken this experiment.
5. Add `npm run ai:research -- --idea dagger`; emit an algorithm-neutral artifact and raw
   report, but do not bundle or register it.
6. Run three seeds. Compare teacher-only, behavior-clone-only and DAgger. The teacher itself
   must pass the engagement floor or the run refuses before training rather than teaching a
   known orbiting policy.

## Tests first

Add `tests/dagger.test.mjs`:

- `the_teacher_attacks_a_real_opportunity_and_closes_when_none_exists`
- `the_teacher_does_not_label_retreat_for_an_extended_fist_outside_shoulder_range`
- `dagger_rows_contain_only_versioned_observation_features_and_labels`
- `learner_visited_states_are_relabelled_and_aggregated_in_stable_order`
- `class_balancing_cannot_drop_a_rare_legal_attack_or_unit_cell`
- `validation_selects_an_iteration_without_reading_test_rows`
- `the_same_seed_and_dataset_produce_byte_identical_weights_and_report`
- `a_teacher_below_the_engagement_floor_refuses_before_training`
- `human_trace_absence_does_not_change_the_required_experiment_matrix`

Mutation-check behavior cloning without aggregation, shuffled unstable rows, a privileged
teacher-only column, dropping rare punch/shoot rows and selection by test loss.

## Research decision

Report macro-F1 for both heads, attack recall, rollout opportunity/contact conversion and all
promotion gates. DAgger must outperform clone-only on learner-state validation; regardless of
the result, its frozen artifact is also the predeclared warm start for one PPO arm in session
17 and cannot be regenerated after PPO results are known.

```powershell
npm test
npm run check
npm run build
npm run ai:research -- --idea dagger --seed 310013 --workers 8 --solver-steps 1800000000
npm run ai:research -- --idea dagger --seed 310019 --workers 8 --solver-steps 1800000000
npm run ai:research -- --idea dagger --seed 310031 --workers 8 --solver-steps 1800000000
```
