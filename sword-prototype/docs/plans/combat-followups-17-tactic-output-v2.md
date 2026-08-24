# Session 17 -- explicit effector and learned body stance

## Outcome

Replace the ambiguous action-v1 output with tactic v2. A learned controller chooses movement,
hand action, the exact effector that performs it, the body/threat region it targets, a bounded
whole-body stance and persistence. Low-level options continue to generate safe arm
trajectories; the network does not receive joint or solver authority.

This closes three fundamental gaps before compute: dual wielders can deliberately use either
hand, attacks can choose high/centre/low rather than replaying one fixed aim, and
crouch/lean/twist become learned tactical choices rather than fixed animation tied only to
the hand action.

## Frozen vocabulary

In `src/options.ts#L8-L16`, add:

~~~typescript
export const TACTIC_VERSION = 2;
export const EFFECTOR_NAMES = Object.freeze(["primary", "secondary", "natural"] as const);
export const TARGET_NAMES = Object.freeze(["vital", "high", "low", "threat"] as const);
export const STANCE_NAMES = Object.freeze([
  "action-default", "upright", "compact", "extended", "slip-left", "slip-right",
] as const);
export interface TacticDecision {
  movement: MovementName;
  action: HandActionName;
  effector: EffectorName;
  target: TargetName;
  stance: StanceName;
  persistence: number;
}
~~~

The output contract is exactly 26 values: 5 movement logits, 7 action logits, 3 effector
logits, 4 target logits, 6 stance logits and 1 persistence value. Pin the ordered names;
never infer offsets from object-key iteration.

## Joint capability selection

1. Replace `supportedOptions(view)` with a legal-decision surface that exposes movement,
   stance and **action/effector/target tuples**. Legal tuples are:

   - `cut`: an attached selected hand holding a non-empty striking weapon, aimed at
     `vital`, `high` or `low`;
   - `thrust`: an attached selected hand holding a pointed weapon, aimed at `vital`, `high`
     or `low`;
   - `punch`: an attached selected empty hand, aimed at `vital` or `high`;
   - `shoot`: the selected bow hand, aimed at `vital`, `high` or `low` with the existing
     ballistic lift applied after target selection;
   - `cover`/`recover`: either selected attached hand, aimed at `threat` or `vital`;
   - `bite`: `natural` only, with a published bite capability, aimed at `vital`.

2. Select the best legal action/effector/target tuple by the sum of its three logits, with
   frozen action-then-effector-then-target tie-breaking. Do not take independent argmaxes and
   repair an illegal tuple afterward.
3. Change `combatOption`/`handActionOption` at `src/options.ts#L115-L294` to take an exact
   effector and target. A learned request for primary/high must either execute on
   primary/high or be refused by name; it may not silently fall back to secondary or centre.
   Scripted policies may use separately named `chooseEffector` and `chooseTarget` helpers
   before constructing their exact option.
4. Rename the combat meaning of `Intent.driving` to `actingHand`. Keep the human mouse choice
   as host-owned `Controls.driving` and make `splitMind` translate it explicitly. Do not keep
   one field with two meanings. Natural actions carry `actingHand: null` or a dedicated
   discriminated action target; choose one representation and make illegal states
   unrepresentable rather than using `primary` as a bite placeholder.

## Bounded learned stance

Add `applyTacticStance` after the action skill establishes its safe base posture:

- `action-default`: exact current action posture;
- `upright`: zero crouch/lean/twist;
- `compact`: crouch 0.55, lean -0.20, neutral twist;
- `extended`: crouch 0.10, lean +0.30, twist 0.55 toward the selected hand;
- `slip-left` / `slip-right`: crouch 0.25, lean -0.10, twist -0.65 / +0.65.

All numbers are normalized `PostureIntent` values and remain bounded again by `boundIntent`.
Natural actions use body-relative left/right. Record these constants with their initial
rationale in `docs/design.md`; session 23's held-out result, not this implementation session,
decides whether they are useful.

## Update every research path

- Replace the `ResearchArtifact` contract with tactic version, effector, target and stance
  names. Do not extend the obsolete standalone checkpoint format.
- NEAT-QD and the old learned-meta network use all 26 ordered outputs.
- DAgger rows add exact `effector`, `target` and `stance` labels; its model gains categorical
  heads and reports macro-F1/recall for all three.
- PPO gains effector, target and stance policy heads, sampling/log-probability/entropy terms
  and full recurrent gradients for all three.
- Look-ahead enumerates only legal `(movement, action, effector, target, stance)` tuples and records
  the expanded exact cell count instead of retaining the old 220-cell assertion.
- Mirrors swap primary/secondary effectors only when the mirrored body definition actually
  swaps anatomical sides; they always swap `slip-left/right`. Pin this with asymmetric
  weapons rather than assuming names.
- Behaviour records count effectors, targets and stances so a controller that emits varied
  action names while using one arm, one aim and one pose is visible to the tournament.

## Tests and adversarial proof

Add exact tests across `tests/options.test.mjs`, `tests/minds.test.mjs`,
`tests/artifact.test.mjs`, `tests/dagger.test.mjs`, `tests/ppo.test.mjs`,
`tests/lookahead.test.mjs` and `tests/tournament-executor.test.mjs`:

- `a_dual_wielder_executes_the_effector_the_decision_named`;
- `an_illegal_action_effector_target_tuple_is_masked_not_repaired`;
- `a_requested_high_or_low_target_reaches_that_body_region_without_fallback`;
- `a_lost_selected_hand_forces_a_new_decision_before_execution`;
- `natural_bite_never_aliases_a_human_hand`;
- `each_stance_reaches_its_exact_bounded_posture`;
- `tactic_v2_mirror_swaps_asymmetric_effectors_and_slip_direction`;
- `every_algorithm_round_trips_the_same_26_output_contract`;
- `a_synthetic_stale_action_header_is_refused_before_solver_work`.

Force independent action/effector/target argmax in the test fixture and watch the
illegal-tuple test fail. Force every target through the old shoulder aim and watch the
high/low test fail. Make `extended` exceed one and watch the exact-posture test fail rather
than merely checking finiteness.

## Accept

- Diagnostics and artifacts name the complete six-part decision.
- A two-sword learned controller can choose either sword; a shield/sword controller cannot
  have its requested sword action silently executed by the shield hand.
- Learned stance changes are visible in behaviour records and remain inside the same physical
  posture envelope available to a person.
- No v3, action-v1 or standalone learned-checkpoint implementation remains. Synthetic stale
  headers fail before solver step one.
- `npm test`, `npm run check` and `npm run build` pass.

## Delete superseded learning paths

Do this in the same session; tactic v2 must not sit beside a second action vocabulary or
trainer:

1. Delete `OPTION_NAMES`, its “compatibility vocabulary” comment and every consumer. Use
   `MOVEMENT_NAMES`, `HAND_ACTION_NAMES` or the complete tactic-v2 tables according to the
   question being asked.
2. Move the actual arm-skill implementation into one canonical `handActionOption`. Delete the
   old `combatOption` plus the wrapper variables named `legacy`; do not implement tactic v2
   by wrapping action v1.
3. Delete `src/learning/checkpoint.ts`, `scripts/train-meta.mjs`,
   `scripts/train-meta-worker.mjs`, `scripts/training-evaluator.mjs` and
   `scripts/promotion-evaluator.mjs`. Remove `ai:train` from `package.json`, the checkpoint
   branch from `evaluate-options.mjs`, learned-checkpoint reporting from `measure.mjs`, and
   `learnedMetaMind`/old `networkMetaMind` when their only remaining callers are deleted.
   NEAT-QD continues through the current `ResearchArtifact` deployment path only.
4. Delete `scripts/evaluate-options.mjs` and the `ai:options` package command after moving any
   unique current specialist/tactic assertions into focused tests or session 18's preflight.
   Do not keep parity with a superseded executor as a product gate.
5. Fold the durable conclusions from `baseline-v1.json`, `engagement-baseline-v1.json` and
   `unpromoted-v1.json` into `docs/measurements.md`, then delete those files and their exact
   fixture tests. Preserve current specialist policies (`swinger`, `duelist`, `archer`) as
   opponents; rename evaluator/report labels from `legacy` to `specialist`.

The acceptance audit is semantic, not a blind ban on words: browser “compatibility mouse
events” and NEAT `compatibilityDistance` are current concepts. Every other surviving
`legacy`, `OPTION_NAMES`, `learned-v1`, `baseline-v1` or old-checkpoint match needs an explicit
current owner or deletion.
