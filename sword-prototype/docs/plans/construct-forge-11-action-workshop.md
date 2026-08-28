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
canvas: installed sensor picker, condition expression, utility expression, action/group picker,
parameters, priority and optional/required toggle. Show inferred units and reject invalid comparisons
such as metres against booleans. Reordering rules is explicit and changes canonical bytes.

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
guard to fail.

## Accept

- Recreate the committed Warden control graph and Mind through the UI with identical canonical
  bytes.
- Build a deliberately different controller -- dorsal sword instead of crossbow -- without source
  edits or hidden fallback.
- No editor gesture can create a command the runtime parser would reject.
- `npm test`, `npm run check` and `npm run build` pass.
