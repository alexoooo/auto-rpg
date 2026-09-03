# Session 32 -- athletic stone-automaton chassis

**Status (2026-09-02): planned.** The Swordbearer has deliberately broad support feet, but its
torso, pelvis, arms and mount are also broad enough to obstruct readable fighting. This session
changes that physical envelope without sacrificing supported walking.

## Outcome

Select an athletic, One Must Fall-inspired stone automaton silhouette: narrow carved stone plates,
visible bronze bearings and enough negative space to read each limb in motion. The Effigy remains a
golem, not a human mesh, and its feet remain purpose-built support hardware.

## Frozen candidates and selection

Both candidates leave all longitudinal lengths, sword geometry/reach, neck/head continuity, hip
centres (0.19 m to each side, unscaled), foot colliders, contact pads, masses, actuators, joint limits and
health/armour unchanged. Only lateral/depth box dimensions and capsule/cylinder radii shrink.

| unscaled source geometry in `src/construct/humanoid.ts` | current | `athletic-15` | `athletic-20` |
| --- | --- | --- | --- |
| torso `x,z` | `0.72, 0.34` | `0.612, 0.289` | `0.576, 0.272` |
| pelvis `x,z` | `0.60, 0.30` | `0.510, 0.255` | `0.480, 0.240` |
| upper-arm / thigh radius | `0.105 / 0.12` | `0.08925 / 0.102` | `0.084 / 0.096` |
| forearm / shin radius | `0.09 / 0.10` | `0.0765 / 0.085` | `0.072 / 0.080` |
| wrist / ankle / sword bearing radii | `0.08 / 0.085 / 0.13` | `0.068 / 0.07225 / 0.1105` | `0.064 / 0.068 / 0.104` |
| left hand and sword-pitch cross-section | current `x,z` | 85% | 80% |

Candidate selection is deterministic: install `athletic-20` if it passes every gate below;
otherwise install `athletic-15` if it passes every gate; otherwise retain the present chassis,
record both failures, and stop rather than faking a visual-only reduction. Existing support-foot
shell scaling remains unchanged; the solution may not hide an unchanged bulky collider under a
smaller render mesh.

## Implement

1. Extract the candidate table to a `humanoid-chassis` module in `src/construct/` and make
   `humanoidBlueprint()` at `src/construct/humanoid.ts#L20` use the one selected immutable profile.
   The profile is normal blueprint input: no runtime scale switch, no direct mesh transform and no
   body-name renderer exception.

2. Use the existing `core`, `piston`, `bearing` and `support` shell styles. Update their local
   extents from the selected primitives, so the current stone PBR reads as distinct narrow plates
   over bronze joints with no separate material or draw-call family.

3. Extend `tests/construct-humanoid.test.mjs` with
   `the_athletic_Swordbearer_has_readable_stone_bronze_negative_space_without_changing_its_support_footprint`.
   It must inspect actual oriented physical/shell extents in bind and moving pose. Assert arm-to-
   torso, sword-to-core and sibling-foot clearance; a static axis-aligned bounding box is not
   enough.

4. Run every current biped requirement -- standard and scaled supported locomotion, physical
   obstacle pressure, fall/rise recovery, damaged-limb fallback, held weapon wall pressure, and
   the Swordbearer sustained-action reference -- for each candidate before selecting one. No
   existing threshold may be relaxed. The body must also pass the Session-31 corpus safety fields;
   only its dynamism result may remain red before Session 33.

5. Update `docs/design.md#the-fixed-humanoid-construct` and `docs/measurements.md` with the exact
   selected dimensions, the rejected candidate if any, and the retained foot-support rationale.
   Change the source fingerprint in all current Construct qualification provenance owners, but do
   not rerun or relabel the old competitive matrix as current evidence.

## Verification

```powershell
node --test tests/construct-humanoid.test.mjs tests/supported-locomotion-physical.test.mjs
node --test tests/scaled-supported-locomotion.test.mjs tests/supported-locomotion-physical-obstacles.test.mjs
node --test tests/construct-swordbearer-duelist.test.mjs
npm test
npm run check
npm run build
git diff --check -- .
```
