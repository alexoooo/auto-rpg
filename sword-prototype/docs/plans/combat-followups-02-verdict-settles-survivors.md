# Session 02 -- a survivor stops fighting with both hands

## Outcome

On the exact verdict edge, a living fighter keeps its held equipment and upright body but
both driven arm anchors become stationary. A winning archer's free hand cannot flail behind
the torso and a held draw cannot loose after the bout. Arrows already in flight still age
and return to their pool while the unpaused result settles.

## Implement

1. At `src/arm.ts:1070-1280`, add `Arm.stopFighting()`. Reissue stationary hand/elbow anchor
   transforms from the achieved scene-root poses, zero anchor velocities, cancel draw state
   without generating a release edge, and preserve grip/constraints. This is neither
   `drop()` nor death.
2. At `src/fighter.ts:1298`, call `stopFighting()` on both arms before settling pelvis and
   torso. Keep the method idempotent.
3. Separate `Quiver.step()` from active arm intent if it is currently reachable only through
   `Arm.update()`. At `src/main.ts:669-688`, advance projectile lifecycle on the fixed physics
   clock after combat authority ends but only while the host is not paused.
4. At `src/policies.ts:1220`, leave the archer policy unchanged. The host owns revocation;
   adding a post-verdict branch to one policy would leave every other mind unsafe.

```ts
interface SettledArm {
  stopFighting(): void; // holds achieved pose; never drops or looses
  stepProjectiles(dt: number): void;
}
```

## Tests first

Extend `tests/death.test.mjs` and `tests/arrow.test.mjs`:

- `a_surviving_archers_both_hand_anchors_stop_on_the_verdict_step`
- `a_bow_held_at_the_verdict_cannot_loose_afterward`
- `a_surviving_fighters_hands_stay_inside_the_anatomical_envelope_after_the_verdict`
- `arrows_already_in_flight_still_age_and_return_to_the_pool_after_a_verdict`
- `stopping_a_survivor_twice_is_harmless`

Measure hand/anchor translation and angular change for three seconds after a verdict, not
only whether the mind was called. Delete free-arm settling and projectile-tail advancement
separately; their named tests must fail.

## Acceptance

Run bow-versus-idle until the archer wins. The free hand must remain in front of or beside the
body, the drawn bow cannot fire another arrow, and a projectile already away at the verdict
must finish its visible lifecycle. Ordinary corpse fall remains unchanged.

```powershell
npm test
npm run check
npm run build
npm run measure -- --only bow --seed 20260823
```
