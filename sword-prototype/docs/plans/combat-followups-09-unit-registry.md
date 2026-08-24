# Session 09 -- a setup unit becomes a buildable Combatant

## Outcome

The unit picker is derived from a typed registry and `buildBout()` actually constructs the
selected body. Warrior remains behaviour-identical. The host, bout, combat and camera depend
on a common `Combatant` seam so Broot and Centipede do not become branches scattered through
`Fighter`.

## Implement

1. Add `src/units.ts` with `UnitKind`, `UnitDefinition` and a total registry. Move `UNITS`
   from `src/bout.ts:138` to a projection of buildable definitions. An unknown unit or an
   unsupported loadout must refuse by name.
2. Define the smallest `Combatant` interface used by `src/main.ts:347`, `FightEnd`, `Combat`,
   HUD, camera, targeting and occlusion. Keep humanoid-only helpers on `Fighter`; do not make
   the interface expose arms to satisfy code that should ask about strikers or aim points.
3. A `UnitDefinition` owns anatomy/vitality part keys, locomotion envelope, reach, crown/vital
   target height, collision radius, supported equipment/hands and costume descriptor. Update
   `BodyView` at `src/mind.ts:200` with unlike-body facts policies genuinely read.
4. Make `src/main.ts:347-390` call the registry factory for each side. Make `src/setup.ts:37`
   disable or refuse incompatible hand selectors rather than accepting values the body ignores.
5. Version any new learning feature columns. Old unpromoted checkpoints must be rejected by
   schema; no `learned-v1` registration is introduced.

```ts
interface UnitDefinition {
  kind: UnitKind;
  label: string;
  equipment: readonly WeaponKind[];
  anatomy: AnatomyDefinition;
  build(ctx: CombatantBuild): Combatant;
}
```

## Tests first

Add `tests/units.test.mjs` and extend integration:

- `the_unit_picker_is_derived_from_the_buildable_unit_registry`
- `every_unit_builds_on_both_sides_with_every_supported_loadout_and_disposes`
- `an_unknown_unit_is_refused_by_name_instead_of_becoming_a_warrior`
- `an_incompatible_loadout_is_refused_with_the_unit_and_equipment_named`
- `unlike_units_publish_their_own_reach_crown_vital_height_and_radius`
- `each_units_vitality_weights_cover_exactly_its_parts`
- `warrior_through_the_registry_matches_the_previous_fight_record_exactly`

Remove one registry row from picker projection, silently fall back to Warrior and omit one
part weight; their named tests must fail.

## Acceptance

This session lands with Warrior as the only registered unit if necessary; its purpose is to
make that fact honest and executable. Setup, restart, takeover, cameras, HUD, lifecycle and
all Warrior corpus rows remain identical before the next unit is added.

```powershell
npm test
npm run check
npm run build
npm run measure -- --seed 20260824
```
