# Session 04 -- shoulders move over planted hips

## Outcome

Add policy-controlled trunk lean and twist about the waist while locomotion keeps the pelvis
and hips planted. Shoulder sockets move with the trunk, but pointer-to-hand direction remains
relative to world vertical and pelvis heading rather than tilting with the chest.

## Implement

1. Add `PostureIntent { trunkLean, trunkTwist, crouch }` to `InputState` in
   `src/input.ts:50-74`; session 04 carries `crouch: 0` without driving it. Add it to
   `blankIntent`, `Mind` fixtures and the one composition helper from session 03. Clamp each
   normalized field at the `Fighter` boundary.
2. In `src/config.ts:1023-1148`, add initial anatomical ranges and response:

   ```ts
   trunkLeanMax: 0.35,   // 20 degrees forward/back
   trunkTwistMax: 0.70,  // 40 degrees left/right
   trunkResponse: 10,
   trunkMotorForce: 900,
   ```

   These are starting limits, not balance claims; a before/after table beside them must show
   waist error and solver cost.
3. Refactor `src/fighter.ts:484-875`: the locomotion reference is the pelvis/hips, and the
   torso is controlled about the existing waist joint at `src/fighter.ts:763-773`. Preserve
   the current build-order promise that both arms are built before the remaining bones. If
   swapping which body is keyframed moves the arm transient, record it rather than comparing
   it to the old harness as if nothing changed.
4. Split the frames currently conflated by `torso.mesh.getWorldMatrix()`:
   `locomotionFrame` is upright and follows pelvis heading; `trunkFrame` includes lean/twist.
   `Arm.aim` at `src/arm.ts:901-953` builds the commanded direction in `locomotionFrame`,
   while shoulder position and the physical joint frame come from `trunkFrame`. This is the
   exact acceptance rule behind “hands stay relative to vertical.”
5. `Fighter.steer` at `src/fighter.ts:1370-1392`, camera placement at
   `src/main.ts:780-825`, targeting and `BodyView.facing` continue to use pelvis heading.
   `BodyView` gains factual trunk lean/twist readings only when the posture controller in
   session 05 reads them.
6. Update `Figure` attachment and `scripts/check-warrior.mjs`: costume torso/shoulder pieces
   follow the moving torso, leg pieces follow pelvis and legs, and the waist seam remains
   closed throughout the allowed envelope. Cosmetics do not become authority.

## Tests that must exist first

Add to `tests/view.test.mjs`:

- `trunk_motion_moves_both_shoulders_but_not_the_planted_hips`
- `leaning_the_trunk_does_not_remap_a_centre_cursor_off_world_vertical`
- `body_view_reports_pelvis_heading_separately_from_trunk_twist`

Add to `tests/handover.test.mjs`:

- `a_takeover_during_full_trunk_lean_does_not_jump_either_hand`

Add a real-solver test in `tests/death.test.mjs`:

- `a_twisted_living_waist_remains_constrained_and_a_dead_one_still_falls`

Break the frame split by feeding `trunkFrame` to the cursor direction; the vertical-control
test must fail on both positive and negative lean.

## Measurement and acceptance

Sweep the four corners `(lean, twist)` for five seconds each: waist anchor error, hand anchor
error, joint-limit occupancy and physics milliseconds. Then play under Fixed and Overhead
cameras. Hips must not orbit as the shoulders twist, a centred mouse must stay centred in
the upright arena frame, and neither camera may inherit an unintended roll.

```powershell
npm test
npm run check
npm run build
npm run measure -- --seed 20260823
npm run asset:verify
```
