# Session 06 -- an empty hand is still a hand

**Status: implemented and measured 2026-08-24.** The 40-bout side-swapped corpus is
recorded durably in `docs/measurements.md`; the plan remains until the multi-session topic
closes.

## Outcome

Let an empty hand punch, shove and physically block. It uses the existing simulated hand
body, the same contact stream as weapons and the same policy interface; “empty” stops meaning
“inert” without constructing an invisible weapon.

## Implement

1. In `src/hands.ts`, distinguish “has a held weapon” from “can strike.” `empty` remains a
   `WeaponKind` and gets `hands = 1`, `isStriking = true`, `hasPoint = false`,
   `cutsBothWays = false`. Audit every total table and reject any default branch.
2. Add a small `FistStrike` adapter in `src/arm.ts` over the real hand `Part`. It implements
   `Striking` as kind `empty`: velocity at contact comes from the hand body, the tip is the
   hand centre, it is spent when the arm is lost, and it owns no body/mesh/constraint.
3. In `Fighter.strikers` at `src/fighter.ts:995-1040`, include `FistStrike` only for an empty,
   attached hand. In `parriedBy` at `src/fighter.ts:1074-1092`, let an empty attached hand
   report a forearm/fist block. Observer count remains fixed at construction.
4. Replace `empty: inert` in `src/scoring.ts:229-247` with a `fist` row. Initial rule:
   `minSpeed = 3.5`, `referenceSpeed = 9`, `damageScale = 18`, never sever, and only the
   `crush`/`slap` paths. Put the measurement that confirms both floors beside the constants.
5. Add punch/cover poses to `src/policies.ts`: a bare hand may be chosen as an attack only
   when no held striking weapon is available, and may be chosen as the covering hand when it
   is closer to the threat line. Do not teach an archer to abandon a two-handed bow grip.
6. Update the setup labels, README controls and HUD hit nouns (`PUNCH`, `BLOCKED BY HAND`).
   A fist block is zero damage; a punch is not a sword under another name.

## Tests that must exist first

Add to `tests/scoring.test.mjs`:

- `a_fast_fist_crushes_but_never_cuts_or_severs`
- `a_slow_fist_is_a_shove_worth_nothing`

Add to `tests/weapons.test.mjs`:

- `an_empty_hand_builds_no_weapon_body_but_exposes_one_fist_striker`
- `a_slow_fist_slaps_and_shoves_without_hurting`
- `a_lost_empty_hand_cannot_score_or_block`
- `a_dropped_fist_contact_cannot_change_health_or_the_log`
- `a_fist_watcher_and_every_fighter_resource_leave_cleanly_across_rebuilds`

Add to `tests/minds.test.mjs`:

- `an_unarmed_policy_punches_instead_of_swinging_an_imaginary_sword`
- `two_duelist_fists_leave_the_hand_nearest_the_actual_dangerous_hand_on_cover`
- `two_swinger_fists_choose_against_the_chest_and_still_ignore_blades`
- `a_free_empty_hand_covers_a_threat_without_stealing_a_two_handed_grip`

Break the fist's angular material-point velocity reader, its spent-contact guard and its
observer removal; the opposite-offset velocity, post-drop contact and rebuild lifecycle
tests must fail. Set `severs` true for `empty`; the non-sever test must fail.

## Measurement and acceptance

Add mirrored unarmed-vs-idle, unarmed-vs-sword and sword-plus-empty-vs-sword cells to the
headless report. Record punches, blocks, damage and survival; an unarmed fighter should be
dangerous at close range but clearly worse than steel. In the page, verify the visible hand
is the collider that stops the weapon and no invisible weapon mesh appears under `G`.

```powershell
npm test
npm run check
npm run build
npm run measure -- --seed 20260823
```
