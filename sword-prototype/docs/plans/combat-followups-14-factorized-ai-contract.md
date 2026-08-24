# Session 14 -- an honest action and artifact seam

## Outcome

Give scripted and learned controllers the same compositional authority. A controller chooses
movement and a hand action independently, then one total composer produces the ordinary
`Intent`. Add a versioned, algorithm-neutral research artifact so four experiments can share
features, action masks, budgets and evaluation without pretending their payloads are NEAT.

The old learner chose one of `close`, `disengage`, `cover`, `cut`, `thrust`, `punch`, `shoot`
or `recover`, while `scriptedMetaMind()` added circling/closing after choosing cover or cut.
Training another network across that mismatch is prohibited.

## Implement

1. In `src/options.ts:8-280`, split the vocabulary into movement
   `{ close, hold, circle-left, circle-right, disengage }` and hand action
   `{ cover, cut, thrust, punch, shoot, recover }`. Add a total `composeTactic()` whose field
   ownership is explicit: movement owns `forward/strafe/turn`, hand action owns hand/buttons,
   and one posture composer owns lean/twist/crouch/wrists. Illegal capability pairs refuse by
   name; no spread may silently let the later option win.
2. Rewrite `scriptedMetaMind()` at `src/options.ts:180-280` through that composer. The frozen
   legacy-versus-composed scripted corpus must remain command-identical across every `Intent`
   field while the hidden footwork overlay disappears.
3. Bump `FEATURE_VERSION` at `src/learning/features.ts:5`; add continuous usable-reach margin,
   facing error, radial closing rate, current movement/action, persistence age and time since
   contact/damage. Every column has a real reader, reset rule and mirror sign. Do not encode a
   teacher verdict or future state.
4. Update `networkMetaMind()` at `src/learning/meta.ts:60-123` for two masked output heads and
   bounded persistence. V2 checkpoints refuse rather than translate ambiguously.
5. Add `src/learning/artifact.ts` with a checksum-covered envelope containing algorithm,
   schema, feature/action names, model payload and complete training provenance. Supported
   algorithms are `neat-qd`, `dagger`, `ppo` and `lookahead`; an unknown name refuses.
6. Add `src/learning/research.ts` and `scripts/research-runner.mjs` for indexed jobs, fixed
   solver-step budgets, resume, atomic reports and train/validation isolation. The common
   runner must not know how an algorithm updates its model.

## Tests first

In `tests/options.test.mjs` and `tests/learning.test.mjs` add:

- `movement_and_hand_action_compose_every_intent_field_exactly_once`
- `every_legal_tactic_pair_is_finite_bounded_and_capability_checked`
- `every_illegal_tactic_pair_refuses_both_requested_names`
- `the_composed_scripted_controller_matches_the_frozen_legacy_trace`
- `feature_v3_has_total_readers_resets_variance_and_exact_mirror_signs`
- `feature_v3_rejects_the_unpromoted_v2_checkpoint`
- `a_research_artifact_round_trips_each_named_algorithm_and_checks_its_digest`
- `an_unknown_algorithm_or_mismatched_feature_action_table_refuses_by_name`
- `worker_count_and_resume_boundaries_do_not_change_indexed_jobs_or_reports`
- `validation_and_test_cannot_be_read_by_a_training_algorithm`

Mutation-check duplicate movement ownership, the old post-option footwork overlay, one wrong
mirror sign, stale persistence after reset, accepting v2 and selecting jobs by completion
order.

## Acceptance

The learner can cover while closing or circling, bow while holding range, and recover while
retreating without any special post-composition write. Ordered parity is exact, and all four
research algorithms can use one evaluator without being registered in `POLICIES`.

```powershell
npm test
npm run check
npm run build
npm run ai:options -- --seed 20260824
npm run ai:research -- --idea contract-smoke --seed 310013
```

