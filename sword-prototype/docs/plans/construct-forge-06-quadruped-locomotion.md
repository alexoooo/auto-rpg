# Session 06 -- make four ordinary limbs into legs

## Outcome

The Bronze Warden walks, turns, braces and recovers because one locomotion group assigns its four
generic limbs and foot-contact sensors to a quadruped controller. No part or joint gains a `leg`
type.

## Implement

Extend `src/construct/warden.ts` with a control graph, not new physical fields:

~~~ts
{
  id: "locomotion",
  joints: [/* twelve stable joint IDs */],
  modules: ["foot-fl", "foot-fr", "foot-rl", "foot-rr"]
}
~~~

Add these controllers to `src/construct/controllers.ts`:

- `quadruped-move` -- parameterized local direction and speed, phase advanced on physics time,
  foot targets corrected from actual contact and core attitude.
- `quadruped-turn` -- differential step targets around world vertical.
- `brace` -- widens the support polygon and lowers the core while retaining contact.
- `recover` -- selects a supported roll/plant sequence from measured core-up and contact facts,
  ending only when the normal hold controller can take over.

Create `src/construct/locomotion.ts` for the gait mathematics, pure where possible. Gait phase is
controller state, not blueprint state. A missing or severed foot reduces the active phase schedule;
the full capability-loss rules land in session 08, but this controller must already refuse fewer
than three usable contacts rather than indexing a missing fourth leg.

Add construct action buttons and target direction to the existing debug panel in `src/hud.ts`.
They issue `ConstructCommand`; do not add keyboard code that calls a motor directly. Human control
may now be enabled for the Warden as an explicitly diagnostic action pad, not advertised as the
final input scheme.

Tune motor forces only through measured sweeps. Record in `docs/measurements.md` the fixed-step
headless harness, body mass, requested speed, achieved speed, slip, core tilt, recovery rate and
motor saturation. Every changed constant carries the before/after table.

## Tests watched failing

Create `tests/construct-locomotion.test.mjs`:

- `four_generic_limbs_become_locomotion_only_through_their_group_and_controller`
- `move_advances_the_core_and_keeps_three_feet_or_a_declared_diagonal_pair_supported`
- `turn_changes_heading_without_translating_the_bind_frame_sideways`
- `brace_reduces_impulse_displacement_against_an_unbraced_control`
- `recover_returns_each_supported_fallen_orientation_to_a_stable_hold`
- `a_two_contact_body_refuses_quadruped_move_instead_of_falling_back_to_hold`
- `locomotion_is_invariant_under_blueprint_array_reordering_and_world_bearing`

Watch `move_advances...` fail with the contact correction removed; a distance-only assertion would
accept a Warden sliding on its armour and is not sufficient.

## Accept

- A person can command the same move/turn/brace/recover actions an AI will command.
- The Warden traverses the arena and recovers under real Havok without direct transforms.
- Measurements state both progress and stability; visual inspection rejects foot skating that the
  numeric envelope misses.
- `npm test`, `npm run check` and `npm run build` pass.
