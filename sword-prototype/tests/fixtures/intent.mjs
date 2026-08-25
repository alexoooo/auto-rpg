/**
 * What a combat command is, as one list.
 *
 * `AGENTS.md`, `docs/design.md` and `docs/measurements.md` all point at
 * "`COMBAT_FIELDS` in `tests/minds.test.mjs`" as the copy that cannot drift, and
 * that was not true when it was written: there were **six** hand-written copies
 * of the same literal -- `minds`, `integration`, `arena`, `handover` and two in
 * `options` -- four of them anonymous inline arrays. A set stated six times is
 * six chances to update five, which is the same defect as a caller holding its
 * own copy of a rule, one level up. This is the copy, on the model
 * `tests/fixtures/view.mjs` already set for view records.
 *
 * The list is a hand-maintained mirror of `Intent` in `src/mind.ts`, which is
 * the failure this directory has its own rule about -- so it is not trusted
 * either. `a_combat_intent_contains_no_camera_state` in `tests/minds.test.mjs`
 * drives every shipped policy and `NEUTRAL` through it, and
 * `every_policy_returns_a_finite_zoom_free_combat_command` does the same through
 * a whole Havok bout: a field added to `Intent` and forgotten here fails there,
 * and a field added here and nowhere else fails there too.
 *
 * Sorted, because every reader compares it against `Object.keys(...).sort()`.
 *
 * Deliberately dependency-free, for the reason `view.mjs` gives: `minds.test.mjs`
 * asserts that no Babylon, scene, bout or solver appears anywhere in its import
 * graph, and a fixture that imported the type it describes would end that.
 *
 * The count used to be written into prose beside it and went stale three times
 * -- nine, eight, seven, and eight since session 17 gave a natural striker its
 * own channel. It is not written down anywhere now; `COMBAT_FIELDS.length` is
 * the answer.
 */
export const COMBAT_FIELDS = Object.freeze(
  ["forward", "strafe", "turn", "actingHand", "natural", "posture", "primary", "secondary"].sort(),
);

/** `HandIntent`: the six fields that belong to one hand. */
export const HAND_INTENT_FIELDS = Object.freeze(
  ["pointerX", "pointerY", "roll", "wristBend", "thrust", "guard"].sort(),
);

/** `NaturalIntent`: two buttons and no pose, because jaws are aimed by turning. */
export const NATURAL_INTENT_FIELDS = Object.freeze(["thrust", "guard"].sort());

/** `PostureIntent`. */
export const POSTURE_INTENT_FIELDS = Object.freeze(["crouch", "trunkLean", "trunkTwist"].sort());
