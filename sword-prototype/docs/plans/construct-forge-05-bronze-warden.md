# Session 05 -- ship the fixed Bronze Warden vertical body

## Outcome

`Bronze Warden (Experimental)` is a separate setup unit built entirely through the generic
blueprint compiler: armoured dynamic core, four identical four-segment/four-joint limbs, shield
bearing, sensor mast and an empty dorsal two-axis socket. It stands under the public `hold-joints`
action, can be damaged, disposed and rebuilt, and leaves existing units unchanged.

## Implement

Create `src/construct/warden.ts` as data only. Its four limbs are generated from one frozen limb
template plus four attachment frames; do not paste four almost-equal joint lists. Use grammar-legal
stable IDs such as `leg-front-left-upper`, never illegal dotted IDs or array indices. “Four-joint”
means core-to-upper, upper-to-lower, lower-to-ankle and ankle-to-foot--four child segments and four
joints per limb; the exact segment/joint count is pinned in the committed blueprint. The dynamic
core, foot shapes and bind frames form a measured support polygon at bearings 0, 90, 180 and 270
degrees. No ANIMATED root may conceal an unstable
body that later locomotion is expected to drive.

Create `src/construct/construct.ts` implementing `Combatant` from `src/units.ts#L48`. In this
session it publishes ordinary combat facts--centre, aim point, vitality, target ownership,
strikers and occlusion points--and a `construct-v1` control endpoint whose only policy submits the
committed `hold-joints` `ConstructCommand` through session 04's scheduler. It is a bootstrap policy,
not a gait action or evidence of controllability, and it has no direct motor handle.

Register the new `UnitKind` in `UNIT_REGISTRY` at `src/units.ts#L286`. Generalize
`UnitSelectionRules` and `SideSetup` at `src/bout.ts#L103` into a discriminated equipment selection:
humanoids own `{ kind: "loadout"; primary; secondary }`, while constructs own
`{ kind: "blueprint"; id; digest }`. The committed Warden ID is available before the saved library
exists; session 10 adds library IDs. Preserve `handA`/`handB` only inside the humanoid equipment
editor rather than putting fake empty hands on construct matchups. Invalid old selections disable
Fight with a reason and are never normalized to Warden or Idle.

Update `SetupScreen` at `src/setup.ts#L35` to render a disabled summary link to the future Forge and
to disable human control with `Construct action controls are not implemented yet`. The endpoint
itself publishes no human factory, so a stale `you` selection receives the same refusal outside the
DOM. Add the Warden palette and silhouette description to `docs/design.md`, explicitly labelling the
unit experimental and code-native. Do not add it to the guided human protocol or current learning
matrix.

The Warden's construct recording port replaces session 02's null construct port. Main attaches it
without fabricating a `FighterView`; a mixed Warden/humanoid bout records each side through its own
surface port.

## Visual acceptance

Run a visible-browser fight with two holding Wardens at bearings 0, 90, 180 and 270 degrees. Capture
front, rear and three-quarter frames. Reject the build if any joint reads as an accidental floating
gap, a plate hides its range of motion, a foot misses the floor, or the four repeated limbs cease
to look like one designed family. Intentional bearing gaps contain an axle, collar, piston or
emissive coupling that explains the connection.

## Tests watched failing

Create `tests/warden.test.mjs`:

- `the_Warden_is_the_exact_generic_compilation_of_its_committed_blueprint`
- `all_four_repeated_limbs_share_one_template_and_have_unique_attachment_frames`
- `the_holding_dynamic_Warden_has_no_first_step_constraint_launch_at_four_bearings`
- `the_Warden_hold_policy_reaches_motors_only_through_the_public_scheduler`
- `the_Warden_exposes_no_humanoid_hand_or_natural_attack_surface`
- `the_setup_names_why_human_control_and_the_Forge_are_not_available_yet`
- `twenty_Warden_rebuilds_return_every_runtime_resource_to_baseline`

Mutate one limb attachment to the unrotated frame and watch both a non-zero-bearing endpoint check
and the activated one-step velocity comparison fail. A facing-zero-only fixture is false green.

## Accept

- The Warden is selectable beside, never instead of, the existing bodies.
- It is one coherent mechanical object at all tested bearings.
- It cannot walk, attack or claim to be playable yet.
- `npm test`, `npm run check` and `npm run build` pass.
