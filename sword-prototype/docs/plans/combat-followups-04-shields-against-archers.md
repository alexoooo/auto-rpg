# Session 04 -- a shield answers an arrow physically

## Outcome

Both shield kinds stop arrows when their real plates occupy the shot line, report one block
and prevent a wound. Duelist presents an equipped shield or buckler to an observable bow
threat instead of guarding an inert bow tip. No random block chance or projectile immunity is
added.

## Implement

1. Prove the existing path first: flying-arrow masks in `src/physics.ts:97`, shield bodies in
   `src/fighter.ts:633-665`, `Fighter.parriedBy()` at `src/fighter.ts:1187`, and contact
   reporting at `src/combat.ts:273-345`. Repair reciprocity or striker lookup only if the
   direct Havok test shows a real hole.
2. At `src/policies.ts:522`, extend threat selection with bow-aware geometry. A bow is not a
   melee striker, so use only observable shooter hand, facing, chest/vital target and closing
   line. Do not expose an arrow's future position or read a `Fighter`/`PhysicsBody`.
3. Present a strapped shield across the chest-to-bow line and a buckler along it, reusing
   `planOffHand()` and the existing `GUARD`/wrist constants. Tune pose from an interception
   sweep across hand, side, shield kind and shot height.
4. Add arrow blocks to the measurement accumulator directly from combat events; do not infer
   them from missing damage or the 24-entry log.

```ts
interface RangedThreat {
  from: Point;
  toward: Point;
  active: boolean;
}
```

## Tests first

Add to `tests/shield.test.mjs`, `tests/arrow.test.mjs` and `tests/minds.test.mjs`:

- `an_arrow_stopped_by_a_shield_records_one_block_and_no_wound`
- `an_arrow_stopped_by_a_buckler_records_one_block_and_no_wound`
- `a_duelist_presents_its_shield_to_a_bow_instead_of_guarding_an_inert_tip`
- `shield_pose_mirrors_across_side_hand_and_kind_against_the_same_shot_line`
- `an_arrow_that_misses_the_plate_can_still_wound_the_body`

Remove arrow/shield collision reciprocity and make bow threats inactive; the physical-contact
and policy-presentation tests must fail separately. A test that only calls `parriedBy()` is
not evidence that Havok ever produces the contact.

## Measurement and acceptance

Add paired shield, buckler and empty-hand defenders against the same archer seeds. Record
shots, plate contacts, wounds, damage, vitality and wins for both spawn sides. Both shields
must improve plate interception and damage versus empty without changing arrow damage when
one reaches flesh. Confirm the pose visually in Fixed and Overhead cameras.

```powershell
npm test
npm run check
npm run build
npm run measure -- --only shield-archer --bouts 40 --seed 20260824
```
