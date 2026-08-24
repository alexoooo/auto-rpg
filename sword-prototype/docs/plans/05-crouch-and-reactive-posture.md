# Session 05 -- the rest of the body answers the fight

**Status (2026-08-24): implemented, measured and verified.** The real-solver sweep and
mutation evidence are recorded in `docs/measurements.md`; after the coordinated warrior
asset rebuild, all 245 tests, the typecheck, production build and asset pin verification
are green.

## Outcome

Drive `crouch` from 0 (tall) to 1 (fully bent) through the real hip and knee joints, and add
a procedural posture layer that controls crouch, trunk lean/twist and both wrists for AI and
for the policy-owned half of human play.

## Implement

1. In `src/config.ts:1023-1148`, add `crouchDepth = 0.34`, hip/knee target ranges, response
   and maximum posture rate. Derive the initial hip/knee geometry from current segment
   lengths; do not lower the pelvis by an unrelated animation offset.
2. Refactor `gait()` at `src/fighter.ts:139-153` into a pure `legPose(stride, speed, crouch)`.
   Crouch adds symmetrically to both hip/knee targets while gait remains the alternating
   term. The pelvis reference lowers by the solved leg geometry so feet remain near the
   floor instead of driving through it.
3. Add factual `crouch`, `trunkLean` and `trunkTwist` readings to `BodyView` at
   `src/mind.ts:196-260` and fill them cache-free in `Fighter.describe` at
   `src/fighter.ts:1253-1320`. Update both hand-written fixtures in the same change.
4. In `src/policies.ts`, add a pure `postureFor(view, action)` layer used by `swinger`,
   `duelist`, `archer` and `idle`: lower under a high threat, rise into reach, twist into a
   committed stroke, and keep the bow upright while drawing. It writes only the new intent
   fields and wrist orientation; action policies still own when to close, guard or strike.
5. In `splitMind` at `src/mind.ts:409-450`, the selected policy owns the whole posture and
   both hands' `roll`/`wristBend`; the person retains feet, pointer, buttons, hand choice and
   camera. Assert this field-by-field rather than with object spread.
6. Extend `RigReadout` in `src/rigview.ts:30-185` with crouch, waist error and joint-limit
   flags. Do not create new bodies or constraints for the overlay.

## Tests that must exist first

Add to `tests/minds.test.mjs`:

- `a_high_threat_makes_the_posture_layer_crouch_and_cover`
- `a_commit_twists_into_the_strike_and_recovers_to_neutral`
- `human_play_keeps_locomotion_and_buttons_but_uses_policy_posture`

Add to `tests/view.test.mjs`:

- `crouch_lowers_the_pelvis_without_moving_either_foot_through_the_floor`
- `gait_and_crouch_add_without_reversing_a_knee`
- `posture_readings_do_not_stamp_world_matrices`

Mutate `splitMind` to take `crouch` from the person and remove the crouch term from one knee;
the ownership and symmetry tests must fail.

## Measurement and acceptance

Sweep crouch 0, .25, .5, .75 and 1 while standing and walking. Record pelvis height, foot
penetration, knee limit occupancy, hand anchor error and physics cost. Bracket the standard
corpus before/after; expect changed hit distribution and guard rates, not unexplained shot
speed or damage arithmetic. In human play, the body should duck, lean and turn with the
exchange without moving the cursor target out from under the mouse.

```powershell
npm test
npm run check
npm run build
npm run measure -- --seed 20260823
npm run asset:verify
```
