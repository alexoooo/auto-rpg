# Session 18 -- experiment D: bounded tactical look-ahead

## Hypothesis

A controller may not need learned long-term policy at all. A calibrated short-horizon model
can enumerate legal movement/action pairs, predict whether each sequence produces engagement,
contact or exposure, and replan every option boundary. This is the planning control: it tests
whether the problem is search/credit assignment rather than representation.

Havok has no cheap snapshot seam in this prototype, so the runtime planner must not pretend an
approximation is exact physics. It searches a small factual model trained and validated
against real-solver traces; model error is a first-class refusal boundary.

## Implement

1. Add `src/learning/tactical-model.ts`. Fit deterministic per-tactic predictions for
   0.10-second deltas in reach margin, facing, threat alignment, contact probability and
   vitality potential from train-only real-Havok traces. Preserve raw calibration cells and
   version/digest the fitted coefficients.
2. Add `src/learning/lookahead.ts`. At each action boundary enumerate every supported pair in
   fixed order, beam-search depth 8 (0.8 s) and width 6, and score terminal outcome potential,
   attack/contact likelihood, exposure and stall. Fixed ordering breaks ties; the exact node
   budget is reported. No private `Fighter`, body, scene or future event may be read.
3. Replan only when the current tactic terminates, capability changes or the prediction error
   guard fires. Do not home a committed stroke toward future target positions.
4. Add a calibration gate per body/loadout: signed reach error, contact Brier score and
   vitality-delta error must remain below constants frozen on validation. A failed cell makes
   the planner unavailable for that capability and names it; it does not silently use Warrior
   sword coefficients.
5. Add `npm run ai:research -- --idea lookahead`. Fit three train seeds, select one validation
   model without test rows, then freeze its artifact for session 19.

## Tests first

Add `tests/lookahead.test.mjs`:

- `the_tactical_model_uses_only_published_versioned_features`
- `lookahead_expands_every_supported_pair_in_fixed_order`
- `lookahead_respects_the_exact_depth_width_and_node_budget`
- `lookahead_prefers_close_over_disengage_when_no_attack_can_land`
- `lookahead_prefers_a_legal_attack_over_orbiting_in_range`
- `a_committed_attack_is_not_reaimed_by_the_next_prediction`
- `calibration_failure_refuses_the_exact_body_and_loadout`
- `reordering_object_properties_does_not_change_the_selected_sequence`
- `the_same_trace_replays_the_same_tactics_and_diagnostic_scores`

Mutation-check private world access with an import/source guard plus behavioral extraction,
remove the node budget, score raw range occupancy, reverse tie order, permit a failed
calibration cell and re-aim during commit.

## Research decision

Report calibration, solver steps used to fit, runtime decisions/second and all engagement and
outcome gates. Planning gets no smaller tournament matrix because it trains fewer weights;
compute cost is a separate product decision after combat competence.

```powershell
npm test
npm run check
npm run build
npm run ai:research -- --idea lookahead --seed 310013 --workers 8 --solver-steps 1800000000
npm run ai:research -- --idea lookahead --seed 310019 --workers 8 --solver-steps 1800000000
npm run ai:research -- --idea lookahead --seed 310031 --workers 8 --solver-steps 1800000000
```
