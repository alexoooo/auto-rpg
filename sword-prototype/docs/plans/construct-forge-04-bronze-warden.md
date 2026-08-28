# Session 04 -- ship the fixed Bronze Warden vertical body

## Outcome

`Bronze Warden (Experimental)` is a separate setup unit built entirely through the generic
blueprint compiler: armoured core, four identical three-joint limbs, shield bearing, sensor mast
and an empty dorsal two-axis socket. It can stand under a minimal hold controller and be damaged,
disposed and rebuilt. Existing units are unchanged.

## Implement

Create `src/construct/warden.ts` as data only. Its four limbs must be generated from one frozen
limb template plus four attachment frames; do not paste four almost-equal joint lists. Name parts
by stable IDs (`leg-front-left.upper`, not array indices), even though no locomotion meaning exists
until session 06 groups them.

Create `src/construct/construct.ts` implementing `Combatant` from `src/units.ts#L44`. In this
session it publishes ordinary combat facts -- centre, aim point, vitality, target ownership,
strikers and occlusion points -- and a `construct-v1` control endpoint whose only policy is
`construct-hold`. The controller keeps the core upright and every joint at bind; it is a bootstrap
controller, not a gait action and not evidence of controllability.

Register the new `UnitKind` and definition in `src/units.ts#L243`. Generalize `UnitSelectionRules`
and `SideSetup` in `src/bout.ts` so a unit may own a blueprint/loadout ID instead of two hands;
preserve `handA`/`handB` as the humanoid equipment editor rather than reusing them for construct
modules. Update `SetupScreen` at `src/setup.ts#L36` to render a disabled summary link to the future
Forge and to disable human control with `Construct action controls are not implemented yet`.

Add the Warden palette and silhouette description to `docs/design.md`, explicitly labelling the
unit experimental and code-native. Do not add it to the guided human protocol or current learning
matrix.

## Visual acceptance

Run a visible-browser fight with two holding Wardens at bearings 0, 90, 180 and 270 degrees. Capture
front, rear and three-quarter frames. Reject the build if any joint reads as an accidental floating
gap, a plate hides its range of motion, a foot misses the floor, or the four repeated limbs cease
to look like one designed family. Intentional bearing gaps must contain an axle, collar, piston or
emissive coupling that explains the connection.

## Tests watched failing

Create `tests/warden.test.mjs`:

- `the_Warden_is_the_exact_generic_compilation_of_its_committed_blueprint`
- `all_four_repeated_limbs_share_one_template_and_have_unique_attachment_frames`
- `the_holding_Warden_has_no_first_step_constraint_launch`
- `the_Warden_exposes_no_humanoid_hand_or_natural_attack_surface`
- `the_setup_names_why_human_control_and_the_Forge_are_not_available_yet`
- `twenty_Warden_rebuilds_return_every_runtime_resource_to_baseline`

Mutate one limb attachment to the unrotated frame and watch the arbitrary-bearing/first-step test
fail before accepting the visual.

## Accept

- The Warden is selectable beside, never instead of, the existing bodies.
- It is one coherent mechanical object at all tested bearings.
- It cannot walk, attack or claim to be playable yet.
- `npm test`, `npm run check` and `npm run build` pass.
