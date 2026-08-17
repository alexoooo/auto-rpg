# Embodied 06 -- stance: hips, pelvis, and a twist budget that forces a step

**Status:** proposed. Depends on [04](embodied-04-terrain-and-elevation.md) and
[05](embodied-05-torso-relative-command.md).

Legs and torso are automatically controlled, as they are in the source material.
There is no leg command and there will not be one. What this session adds is the
*constraint* the legs impose: hips that turn slower than the torso, a bounded twist
between the two, and a forced step when the budget runs out.

## Why hips and not knees

With locomotion automatic and no jump or crouch, the depth of legs in the source
material is stance and footwork -- where your weight is, which way your hips face,
and whether you can bring a weapon round without repositioning. Knee angle is a thing
a renderer solves from foot and pelvis positions and it changes no decision. Modelling
it would add two joints, four collider segments and a hash block per body in exchange
for nothing a policy could act on.

So: pelvis height, hip yaw, and a twist budget. Feet are a presentation concern and
are derived, not simulated.

## State

Added to the embodied columns, hashed in the `EmbodiedV1` block in declaration order
after the body-yaw row:

```rust
pub struct StanceState {
    /// Hip bearing, world space. The feet direction; the legacy `facing` column
    /// means this and is superseded by it for an embodied body.
    pub hip_yaw: Angle,
    pub hip_yaw_speed_turns: Fx,
    /// Pelvis height above `ground_z`, a fraction of standing height. Lowers with
    /// planar speed and with accumulated twist.
    pub pelvis: Fx,
    /// Signed hip-to-torso twist, raw angle units, always within the budget.
    pub twist: Fx,
    /// Ticks remaining in a forced step. Zero when the body is settled.
    pub step_left: u8,
}
```

`body_yaw` keeps its current meaning exactly -- it is the *torso* -- so
`BodyYawState` is unchanged and the [yaw integration
rules](../reference/articulated-actuators.md#yaw-integration) continue to govern it.
What changes is that the torso is now measured against the hips rather than being the
only thing there is.

## The rules

**Twist accumulates and is bounded.** Each tick, `twist += body_yaw_step -
hip_yaw_step`, clamped to `[-STANCE_TWIST_LIMIT_RAW, STANCE_TWIST_LIMIT_RAW]`. The
torso's own chase is clamped so it cannot request a step past the limit -- the torso
stops turning when the hips have not followed, rather than the twist silently
saturating and the two disagreeing.

**Hips chase the torso, slowly, and chase the movement direction faster.** A body
translating turns its hips toward `move_dir` at the ordinary rate; a stationary body
turns them toward the torso at a lower one. That is the asymmetry that makes standing
and pivoting cost something a moving body does not pay.

**A saturated twist forces a step.** When `twist` reaches the limit and the torso
still wants to turn, `step_left` is set to `STANCE_STEP_COST_TURNS_RAW`'s duration.
During a forced step the hips turn at the full rate, `move_authority` is reduced, and
`pelvis` drops. The step ends when the twist is back inside the budget.

**Pelvis height is derived, never commanded.** `pelvis = base - speed_term -
twist_term`, each term a clamped `Fx`, evaluated left to right with the grouping
written down, because `Fx` truncates and a reordering is a different number.

Every one of these constants is a placeholder until a sweep produces it. The sweep is
`lab articulated --seeds 400 --mirrored` against the embodied corpus, and the
constant carries which sweep in its doc comment, with a test that bounds it **from
both sides** -- a one-sided bound is satisfied by a range wider than the decision and
has already shipped here twice.

## Shoulders move, and everything hangs off that

`limb::shoulder` computes the shoulder from `anatomy.shoulder_height` and body yaw.
For an embodied body it takes `pelvis` and `hip_yaw` into account: the shoulder rises
and falls with the pelvis, and rotates with the torso as it does today. Because
session 02 gave the arm polyline one owner, this is a change in `limb.rs` and the
region volumes, the contact colliders and the pose publication all follow it without
edits of their own.

## Publication: a fifth section, not wider pose rows

Stance is published as a new append-only `EMBODIED_STANCE_V1` section beside the
pose, region, combat-event and projectile publications, on the pattern
`DUNGEON_OBJECT_V1` already established. One record per live embodied body:

```text
entity_index generation hip_yaw_raw pelvis_raw twist_raw step_left
```

`POSE_STRIDE` stays 66, `POSE_LAYOUT_VERSION` stays 1, and `FRAME_LAYOUT_VERSION`
stays 7. Widening the pose row instead would move all three plus every mirror in the
[six-file handshake](../reference/frame-abi.md#compatibility-rules), for state that
only one of three models has.

## Tests

- `a_torso_cannot_turn_past_its_hips_by_more_than_the_twist_budget`
- `a_saturated_twist_forces_a_step_and_the_step_recovers_it`
- `a_moving_body_turns_its_hips_faster_than_a_standing_one`
- `pelvis_height_falls_with_speed_and_with_twist_and_is_never_commanded`
- `the_shoulder_follows_the_pelvis_and_the_arm_follows_the_shoulder`
- `a_forced_step_reduces_move_authority_for_exactly_its_duration`
- `the_twist_limit_is_bounded_from_both_sides` -- assert the shipped constant lies in
  a range narrower than the decision it encodes, citing the sweep row.
- `an_articulated_body_has_no_stance_row` -- the guard.

Show the first failing by raising `STANCE_TWIST_LIMIT_RAW` past a half turn.

## Verification

```powershell
cargo test
cargo run --release -p lab -- hash
cargo run --release -p lab -- verify      --seeds 200
cargo run --release -p lab -- articulated --seeds 400 --mirrored
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
```

## Hash expectation

**`ARTICULATED_STREAM_DIGEST` moves, by extension, and it is the only pin that
moves.** Its rule is every published word of every publication, so a fifth section
reaches it even though its twenty-tick fixture contains no embodied body: the new
tail is a zero length and a zero drop count, and their presence is the change. This
is the same shape of move v2-ui-06 made when the region section landed, and the
pose-and-event-and-region prefix of all twenty ticks stays byte-identical, which is
the property that distinguishes an extension from a layout change and must be
asserted rather than claimed.

Measure the native MSVC value first, then rebuild wasm and confirm both agree before
either owner constant is edited. A one-sided move is target disagreement.

Everything else holds still: `FRAME_LAYOUT_VERSION`, `POSE_LAYOUT_VERSION`,
`REGION_LAYOUT_VERSION`, `COMBAT_EVENT_LAYOUT_VERSION`, `ARTICULATED_COMMAND_HASH`,
`CONTACT_BEHAVIOR_DIGEST`, `COMBAT_GEOMETRY_HASH`, both exact digests, and every
legacy pin.
