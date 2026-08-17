# Embodied 04 -- terrain height, and walls that fall out of it

**Status:** proposed. Depends on [03](embodied-03-embodied-model-scaffold.md).
Independent of [05](embodied-05-torso-relative-command.md).

Give `Dungeon` a per-tile floor height, make an embodied body's `z` a sample of it,
and let un-enterable terrain replace the `WALL` tile rather than sit beside it. No
jump, no crouch, no ballistic motion: **`z` is a function of position, never an
integrated degree of freedom.** That single restriction is what keeps the third axis
out of the momentum solver and makes this session small.

## Why this is cheaper than it looks

Three facts, all measurable in the tree today:

- the contact solver is already fully three-dimensional. Arms are capsules at
  arbitrary `z`, weapons are `SegmentPose`s in XYZ, and the sweep is
  segment-against-segment. Nothing in
  [the contact contract](../reference/contact-solver.md#contract) assumes a floor;
- the pose row already publishes **body XYZ at words 2..4**
  ([pose rows](../reference/articulated-abi.md#pose-rows)). Elevation costs **zero
  ABI change**. `POSE_STRIDE` stays 66 and `POSE_LAYOUT_VERSION` stays 1;
- `ArticulatedPose::body` at
  [`pose.rs#L99`](../../crates/sim/src/pose.rs#L99) is already a `Vec3` whose doc
  comment says "Z is the floor". This session deletes that sentence and replaces it,
  which is the whole of the type change.

## Tiles are flat plateaus

Each tile carries one height. There is no interpolation across a tile and no slope
within one, so a floor is a step function and every arithmetic operation stays exact.
This is the Doom sector model, and it is chosen over a smoothed heightfield for two
reasons: interpolation is where a fixed-point terrain sampler grows a rounding
argument nobody wants to have, and a step function is what makes "the wall is a tall
tile" true by construction rather than by threshold.

```rust
pub const TERRAIN_HEIGHT_RAW_UNIT: i32 = ...;   // one height step, raw 16.16
pub const TERRAIN_STEP_UP_RAW: i32 = ...;       // the rise a walking body may enter
```

`Dungeon` at [`dungeon.rs#L102`](../../crates/sim/src/dungeon.rs#L102) gains
`heights: Vec<i16>`, row-major beside `tiles`, each value a signed count of
`TERRAIN_HEIGHT_RAW_UNIT`, and `sculpted: bool` beside the existing `carved: bool`.

## The digest short-circuit is the whole hash argument

`carved` exists so that "every pre-existing scenario is provably unchanged" is a
short-circuit rather than an argument. Reuse it exactly:

```rust
// in Dungeon::from_tiles, and in the new from_tiles_and_heights
h.write_u16(cols);
h.write_u16(rows);
h.write_bytes(&tiles);
if sculpted { for step in &heights { h.write_i16(*step); } }
```

Every shipped scenario is flat, so `sculpted` is false, so
`Dungeon::fingerprint` answers what it answers today, byte for byte, and
`ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH`, `BOW_HASH`, `LAB_HASH` and
`GOLDEN_STATE_HASH` are unreachable. `Dungeon::from_tiles`
([`dungeon.rs#L130`](../../crates/sim/src/dungeon.rs#L130)) keeps its exact signature
and fills `heights` with zeros; `from_tiles_and_heights` is the new constructor and
the only way to set `sculpted`.

If any of those six pins moves, the short-circuit is wrong and the session stops
rather than re-records.

## Passability becomes directional, and that is the interesting part

`Dungeon::solid(tx, ty)` at
[`dungeon.rs#L180`](../../crates/sim/src/dungeon.rs#L180) answers a question about one
tile. Whether a body may *enter* a tile depends on where it comes from, so add:

```rust
/// Whether a body standing on `from` may step onto `to`. On a flat dungeon this
/// is exactly `!self.solid(to)`, which is why every existing caller is inert.
pub fn passable_between(&self, from: (i32, i32), to: (i32, i32)) -> bool
```

A `WALL` tile stays impassable. On a sculpted dungeon a rise greater than
`TERRAIN_STEP_UP_RAW` is impassable in the uphill direction and passable downhill,
which is what makes a ledge a one-way drop and a cliff a wall from below.

The callers that need it, all in `dungeon.rs`: `passable_for_routing`
[L213](../../crates/sim/src/dungeon.rs#L213), `is_clear`
[L405](../../crates/sim/src/dungeon.rs#L405), `distances_for`
[L450](../../crates/sim/src/dungeon.rs#L450), `push_out`
[L516](../../crates/sim/src/dungeon.rs#L516), `nearest_clear`
[L605](../../crates/sim/src/dungeon.rs#L605), `clearance`
[L665](../../crates/sim/src/dungeon.rs#L665), `is_walk_clear`
[L755](../../crates/sim/src/dungeon.rs#L755). Every one of them takes the
`!self.sculpted` fast path first and runs the code it runs today.

## Sight has to read height or a cliff is not a wall

`raycast` [L707](../../crates/sim/src/dungeon.rs#L707), `sees`
[L785](../../crates/sim/src/dungeon.rs#L785) and `visible_tiles`
[L809](../../crates/sim/src/dungeon.rs#L809) are planar. On a sculpted dungeon a tile
blocks sight when its floor height exceeds the eye height of the ray at that tile,
where eye height is interpolated between the two endpoints' eye `z` with one
`mul_div` per step and no division outside it. A tall plateau then occludes exactly
as masonry does, which is the sentence "walls and obstacles naturally emerge from the
elevation" made mechanical.

Fog and the browser waypoint queue read these, so
[navigation and visibility](../design/navigation-visibility.md#sight-and-fog) is
amended by this session rather than after it.

## The body's own z

`World` gains `ground_z: Vec<Fx>`, written in the embodied movement phase from
`dungeon.height_at(pos[i])` after the planar position settles, and hashed in the
`EmbodiedV1` block. It is derived state and is stored rather than recomputed because
the contact phase and the publication both read it and must agree.

Two consumers change, both by one term:

- `build_contact_colliders` (`world/contact_phase.rs` after session 01) forms the
  absolute collider origin as `(pos.x, pos.y, ground_z)` where it forms
  `(pos.x, pos.y, 0)` today. This is the one line that puts the whole existing
  three-dimensional solver on a hill;
- the pose publication writes `ground_z` into the body `z` word that is already
  there.

`ArticulatedPose::body`'s doc comment is corrected in place, and the correction is
recorded rather than the old sentence deleted: the model gave a body no vertical
degree of freedom, it now takes one from the floor, and it still has none of its own.

## Tests

- `a_flat_dungeon_fingerprints_exactly_as_it_did_before_heights_existed`
- `a_sculpted_dungeon_fingerprints_differently_from_the_same_tiles_flat`
- `a_rise_above_the_step_up_is_impassable_uphill_and_passable_down`
- `a_tall_tile_blocks_sight_that_the_same_tile_flat_does_not`
- `a_body_on_a_plateau_publishes_the_plateau_height_as_its_pose_z`
- `a_weapon_swung_on_a_ledge_reaches_a_body_below_it` -- the point of the session:
  the existing solver resolves a cross-elevation contact with no solver change.
- `an_embodied_duel_on_flat_terrain_still_equals_the_articulated_duel` -- session
  03's equality, unbroken, because flat terrain must change nothing.

Break `passable_between`'s uphill branch to `true` and watch the third test fail
before believing it.

## Verification

```powershell
cargo test
cargo run --release -p lab -- hash
cargo run --release -p lab -- verify --seeds 200
cargo run --release -p lab -- bench  --carved
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
```

## Hash expectation

**Nothing moves**, on the `sculpted` short-circuit above. `ROOM_HASH` is the one to
watch and the one most likely to surprise: its script is the only golden that issues
an `Order::Goto`, so it is the only one that reaches `ordered_feet`, and any change
to routing reaches it. Routing changes here are gated behind `sculpted` and
`ROOM_HASH`'s dungeon is flat -- but "no golden reaches this code" has been wrong
about `ROOM_HASH` at least twice, so run it first and read the number rather than the
argument.
