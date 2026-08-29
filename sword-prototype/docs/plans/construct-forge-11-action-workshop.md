# Session 11 -- expose control groups, actions and Mind rules without code

## Outcome

The player can turn generic hardware into locomotion, mounts and tactics entirely through the UI.
The editor never offers a controller the selected topology cannot support, and its live probe issues
the exact `ConstructCommand` used in battle.

## Implement

Create `src/forge/control-editor.ts` with three panes:

1. **Groups.** Select joints/modules from the body tree, name a group and view overlapping claims.
2. **Actions.** Choose a compatible controller template, bind its required roles to selected
   joints/modules, set parameter bounds and name its resource claims.
3. **Test.** Issue one or several action requests to the preview, inspect motor saturation,
   convergence, completion and refusal, then reset to the exact blueprint bind state.

Controller templates publish a machine-readable compatibility descriptor from
`src/construct/controllers.ts`; the UI derives choices from it rather than switching on controller
names. A quadruped template asks for a core, at least three articulated limb chains and foot-contact
sensors. A two-axis aim template asks for two ordered rotational joints and one output socket. The
same socket remains compatible with sword and crossbow modules.

Create `src/forge/program-editor.ts`. V1 is a form/tree editor rather than a free-position node
canvas: installed sensor picker, condition expression, utility expression, action picker with its
read-only resolved group, parameters, priority and optional/required toggle. The editor never emits
a second group field beside the action ID. Show inferred units and reject invalid comparisons
such as metres against booleans through session 09's exact type/unit checker--the UI owns no second
compatibility table. Reordering rules is explicit and changes canonical bytes; reordering any
set-valued body/control collection does not.

Create `src/forge/diagnostics.ts` to render a decision timeline: rule utility, selected requests,
scheduler claims, refusal reason and active controller phase. Pausing the arena keeps this panel and
the rendered machine visible.

## Tests watched failing

Create `tests/action-workshop.test.mjs`:

- `controller_choices_are_derived_from_compatibility_descriptors_not_names`
- `four_selected_limb_chains_can_become_a_gait_group_without_changing_the_blueprint`
- `the_same_two_axis_group_can_preview_crossbow_tracking_and_sword_sweep`
- `the_live_probe_and_battle_runtime_receive_identical_ConstructCommand_bytes`
- `the_program_editor_cannot_compare_incompatible_sensor_units`
- `rule_reordering_changes_selection_and_canonical_program_bytes_together`
- `a_pause_keeps_the_machine_and_decision_timeline_visible`

Mutation proof: bypass the controller descriptor for one UI option and require the reducer/runtime
refusal parity test to fail. Make the probe call a motor directly and require the source boundary
guard to fail. Add one UI-only unit conversion and require canonical editor/runtime parser parity to
fail rather than accepting a command the battle runtime interprets differently.

## Accept

- Recreate the committed Warden control graph and Mind through the UI with identical canonical
  bytes.
- Build a deliberately different controller -- dorsal sword instead of crossbow -- without source
  edits or hidden fallback.
- No editor gesture can create a command the runtime parser would reject.
- `npm test`, `npm run check` and `npm run build` pass.

## Implemented remediation -- 2026-08-28

The Workshop probe no longer drives a bare endpoint with invented facts. Each run suspends the inert
preview, creates a fresh real `Construct` and target, publishes the body's ordinary observations,
and steps the same `LiveConstructState`, hardware-derived capabilities, admission checks, resources
and action-effect sink used in battle. It then disposes both bodies and rebuilds bind pose. Missing
modules/sensors and unavailable ammo, power or heat therefore use runtime refusals rather than a
Workshop-only compatibility answer.

Compatibility now also receives the current blueprint: quadruped roles require ordered connected
four-joint chains ending at real contact-sensor modules, mount yaw/pitch roles require their physical
axes, output requires a sword or launcher, and launcher roles require a launcher. Checkbox click
order is the saved binding order. The Live Test can compose several requests into one command for
claim/preemption/refusal inspection. Groups, actions and bindings have ordinary delete affordances.

Two-axis compatibility additionally requires one connected yaw-child -> pitch-parent chain and an
output module socket owned by the pitch child; disjoint axis-correct joints are not offered. Physical
Probe retains terminal scheduler events and sampled phase/progress history from all 180 ticks instead
of displaying only the last restart/idle tick. Its motor figure is explicitly the fraction of
commanded positions at physical travel limits, not an inferred torque measurement.
