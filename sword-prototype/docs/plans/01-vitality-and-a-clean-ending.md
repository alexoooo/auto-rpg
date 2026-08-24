# Session 01 -- one body, one ending

## Outcome

Replace the twelve always-visible limb bars with one derived vitality bar per fighter, make
zero torso or head health naturally fatal through the same formula, and stop all combat
authority on the exact transition to `phase === "over"` while corpse physics and blood keep
running.

## Implement

1. In `src/bout.ts:281-430`, extend `PartState` with `maxHealth` and add total
   `VITAL_WEIGHT`, `vitality(parts)` and `beaten(parts)`. Use the formula and exact initial
   weights from `00-overview.md`; reject missing/unknown keys with a named error rather than
   silently assigning a default. Keep an empty disposed body non-fatal.
2. In `src/config.ts:1023-1148`, place the weights under `body.vitalWeight`, with the formula,
   anatomical argument and before/after corpus table beside them. `bout.ts` may import
   `CONFIG`, as it already does; there must be one table, not a copy in each caller.
3. In `src/fighter.ts:696-849`, continue owning local `health`/`maxHealth`; do not add a
   mutable global HP field. Add a `vitality` accessor that calls the pure rule for the HUD and
   view. Publish the fraction in `BodyView` at `src/mind.ts:196` so future policies can reason
   about survival without reimplementing the formula.
4. In `src/hud.ts:74-237`, render one large vitality bar per side. Keep severed/critical part
   names in a collapsed diagnostic section shown with the existing readout toggle; do not
   present twelve bars as twelve competing health pools.
5. Add `Combat.stop()` in `src/combat.ts:246-380`. It must make later contacts unscorable
   without removing observers mid-callback. In `src/fighter.ts:1145-1177`, add
   `stopFighting()` that stops asking the mind, zeros locomotion, and leaves physics bodies
   alive. Do not call `die()` on the winner.
6. In `src/main.ts:881-912`, detect the single `fight -> over` edge after `advance`, call
   `stopFighting()` on both fighters and `stop()` on both combats once, and leave blood,
   rendering, camera and corpse integration active. Restart/rebuild creates fresh active
   instances; takeover from `over` remains a camera/control choice but cannot restart damage.
7. Update the ending language in `src/bout.ts:368-450`, the HUD description in `README.md`,
   and the bow decision in `docs/measurements.md`. The verdict should name “exhausted” for a
   mixed injury finish and retain the final blow.

Core shape:

```ts
export function vitality(parts: readonly PartState[]): number {
  if (parts.length === 0) return 1;
  let injury = 0;
  for (const part of parts) {
    const weight = vitalWeight(part.key); // throws with the key if unknown
    const fraction = clamp(part.health / part.maxHealth, 0, 1);
    injury += (1 - fraction) * weight;
  }
  return clamp(1 - injury, 0, 1);
}
```

## Tests that must exist first

In `tests/bout.test.mjs`, add these exact tests:

- `a_whole_body_has_full_vitality`
- `zero_torso_or_head_health_exhausts_the_one_vitality_bar`
- `several_non_vital_wounds_can_finish_what_none_finishes_alone`
- `one_ruined_arm_does_not_kill_its_owner`
- `an_unknown_part_cannot_silently_escape_the_vitality_rule`
- `a_disposed_body_is_not_reported_dead`

In `tests/death.test.mjs`, add:

- `the_winning_mind_is_not_asked_again_after_the_verdict`
- `contacts_after_the_verdict_cannot_change_health_or_sever_a_limb`
- `a_loser_still_falls_and_blood_still_ages_after_combat_stops`

Mutate the torso weight to `0.99`, remove `Combat.stop()`, and let `Fighter.update()` call the
mind after `stopFighting()`; each mutation must turn its named test red.

## Measurement and acceptance

Capture `npm run measure -- --seed 20260823` before and after. Attribute changes in outcome,
bout length, death region and damage; vitality should let bow and blunt/mixed wounds finish
bouts, but it must not turn one lost arm into death. In the page, finish a fight and verify
the winner stops attacking immediately while the corpse and blood continue naturally.

```powershell
npm test
npm run check
npm run build
npm run measure -- --seed 20260823
```
