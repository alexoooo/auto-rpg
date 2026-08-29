# Session 06 -- make four ordinary limbs into legs

## Status -- implemented with one measured blocker (2026-08-28)

Move, turn, brace and longitudinal recovery run through real Havok motors. The fixed move probe now
asserts forward progress at facing 0 and pi, physical support, raised swing-foot clearance, bounded
slip and upright core; both longitudinal off-centre impulse falls recover. An older corpus exposed
lateral recovery failure, but the current seeded eight-bout classification is more specific:
220,871 stuck steps are `brace/brace` and 13,571 are `fire/tracking`. All eight bouts time-cap and
two lack bilateral damage. The 212 named resource/hardware transitions are expected lifecycle
telemetry, with zero unexplained capability disappearance. Session 15 therefore remains
fail-closed. This session is not accepted as fully complete until the current brace/tracking and
decisive-completion blockers pass without weakening the gate.

## Outcome

The Bronze Warden walks, turns, braces and recovers because one locomotion group assigns its four
generic limbs and foot-contact sensors to a quadruped controller. No part or joint gains a `leg`
type.

## Implement

Extend `src/construct/warden.ts` with a control graph, not new physical fields:

~~~ts
{
  id: "locomotion",
  joints: [/* sixteen stable joint IDs: four per Warden limb */],
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

Foot contact is a per-solver-step fact, not a latched boolean. Each contact sensor clears before
the step, collision callbacks mark world contact during it, and the next control publication reads
that completed step exactly once. Disposal removes every callback. Tests force activation so a
sleeping Warden cannot report perfect stability. A supported foot also reports tangential velocity
against the contacted world body; contact without a slip reading is not gait evidence.

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
accept a Warden sliding on its armour and is not sufficient. It asserts core progress, the declared
support pattern, foot-to-ground separation and bounded tangential slip together. Replace the
per-step contact clear with a latched contact and require the support test to fail after the foot
leaves the ground.

## Accept

- A person can command the same move/turn/brace/recover actions an AI will command.
- The Warden traverses the arena and recovers under real Havok without direct transforms.
- Measurements state both progress and stability; visual inspection rejects foot skating that the
  numeric envelope misses.
- `npm test`, `npm run check` and `npm run build` pass.
