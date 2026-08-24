# Session 11 -- Broot is larger and stronger, with a cost

## Outcome

Broot is a broad two-handed humanoid available in setup: visibly larger, heavier, harder to
injure and stronger at joints/weapon control than Warrior. Its reach and force are offset by
slower acceleration/turning so "stronger" does not mean a silent universally superior skin.

## Declared body contract

Broot has the same named part graph, two hands, equipment compatibility, severing rules and
human controls as Warrior. Select a shipped profile from this predeclared sweep:

| candidate | linear scale | mass scale | part health | arm/body force | walk/strafe | turn |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 1.12 | 1.40 | 1.15 | 1.20 | 0.94 | 0.94 |
| B | 1.18 | 1.64 | 1.30 | 1.35 | 0.88 | 0.88 |
| C | 1.24 | 1.91 | 1.45 | 1.50 | 0.82 | 0.82 |

Mass candidates approximate volume but remain explicit, because armour and body proportions
are not uniform solids. Default to B only after the tests and paired corpus establish that it
is controllable and not dominant.

## Implement

1. Under the session-09 unit registry, extract a reusable humanoid anatomy/profile builder
   from `src/fighter.ts:400-1020`. Warrior's profile must reproduce current numbers exactly.
2. Add Broot-specific dimensions, mass, health, joint/arm ceilings, locomotion and camera
   framing. Do not multiply global `CONFIG.body` at runtime; two unlike bodies coexist.
3. Publish Broot reach, crown, vital target and radius through `BodyView` so opponents aim
   at its actual body instead of Warrior's hard-coded `DUELIST.headLift`.
4. Add a Broot costume descriptor with a primitive fallback. Imported Warrior armour may be
   adapted later, but scaling one mesh uniformly over unlike physics proportions is refused.
5. Extend setup compatibility, HUD names, measurement cells and arena spawn clearance.

## Tests first

Add to `tests/units.test.mjs`, view and integration suites:

- `broot_has_its_declared_part_graph_and_no_undeclared_parts`
- `broot_uses_its_own_mass_reach_mobility_health_and_force_profile`
- `warrior_and_broot_target_each_others_published_vital_height`
- `broot_supports_every_declared_humanoid_loadout_on_both_sides`
- `twenty_five_broot_rebuilds_return_every_resource_to_baseline`
- `warrior_through_the_shared_humanoid_builder_keeps_its_exact_record`

Replace Broot's profile with Warrior, leave one hard-coded Warrior target height and scale only
the render mesh. The profile, unlike-body aim and visual/physics parity tests must fail.

## Measurement and acceptance

For A/B/C, run mirrored Broot-vs-Warrior cells with sword, shield, bow and fists. Record reach,
hand error, motor-stop occupancy, damage dealt/taken, vitality, wins and duration. Choose the
smallest profile that reads clearly bigger/stronger in both cameras while still losing some
matched bouts and remaining controllable by a human.

```powershell
npm test
npm run check
npm run build
npm run asset:verify
npm run measure -- --only broot --bouts 40 --seed 20260824
```
