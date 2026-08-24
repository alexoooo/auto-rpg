# Session 03 -- arrows do not build a floating scaffold

## Outcome

A flying arrow can hit bodies, shields, weapons and the world exactly as before. After its
first contact it may land on the world, but it cannot collide with another spent arrow,
fighter, held weapon or severed limb. Repeated shots therefore overlap or clear naturally
instead of floating on an arrow pile.

## Implement

1. At `src/physics.ts:70-125`, add `SPENT_ARROW` as a dedicated collision bit. Include it in
   `COLLIDES.WORLD`; define `COLLIDES.SPENT_ARROW = LAYER.WORLD`. Do not include it in either
   fighter side or `DEBRIS`.
2. At `src/arrow.ts:383-410`, replace both post-impact `DEBRIS` assignments with
   `SPENT_ARROW/WORLD-only`. Parked arrows remain membership/collide mask zero; flying arrows
   retain their side-specific masks until the first contact has been scored.
3. Preserve the delayed `touched -> struck` promotion at `src/arrow.ts:343-382`. Changing
   collision class must not revive the observer-order bug that made every arrow score zero.
4. Extend lifecycle census output to distinguish flying, spent and parked arrows without
   allocating per frame.

```ts
SPENT_ARROW: LAYER.WORLD,
// reciprocal
WORLD: EVERY_FIGHTER | LAYER.DEBRIS | LAYER.SPENT_ARROW,
```

## Tests first

In `tests/arrow.test.mjs` add:

- `spent_arrows_land_on_world_but_never_on_one_another`
- `twenty_spent_arrows_cannot_build_a_floating_stack`
- `spent_arrows_do_not_push_fighters_weapons_or_severed_debris`
- `a_first_arrow_contact_is_still_scored_once_at_arrival_speed`
- `parked_flying_and_spent_masks_are_three_distinct_states`

The stack test fires at one fixed wall/floor point and compares maximum settled shaft height
against one arrow diameter, rather than merely reading masks. Restore the `DEBRIS` assignment
and require it to fail. Remove WORLD reciprocity and require the landing test to fail.

## Acceptance

Run archer-versus-idle for at least twenty landed arrows from both sides and both camera
modes. Shafts may overlap on the floor but may not hang from one another in space. First-hit
damage, arrival speed, shot cadence and pool resource counts must match the control.

```powershell
npm test
npm run check
npm run build
npm run measure -- --only bow --bouts 24 --seed 20260823
```
