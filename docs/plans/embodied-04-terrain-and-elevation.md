# Embodied 04 -- terrain height, and walls that fall out of it

**Status:** complete. Landed 2026-08-17. No pin moved.

`Dungeon` has a per-tile floor height, an embodied body's `z` is a sample of it,
and un-enterable terrain can replace the `WALL` tile rather than sit beside it. No
jump, no crouch, no ballistic motion: **`z` is a function of position, never an
integrated degree of freedom.** That single restriction is what keeps the third axis
out of the momentum solver and made this session small.

## Why it was cheaper than it looks

Three facts, all measurable in the tree before the session started:

- the contact solver was already fully three-dimensional. Arms are capsules at
  arbitrary `z`, weapons are `SegmentPose`s in XYZ, and the sweep is
  segment-against-segment. Nothing in
  [the contact contract](../reference/contact-solver.md#contract) assumes a floor;
- the pose row already published **body XYZ at words 2..4**
  ([pose rows](../reference/articulated-abi.md#pose-rows)). Elevation cost **zero
  ABI change**. `POSE_STRIDE` is still 66 and `POSE_LAYOUT_VERSION` is still 1;
- [`ArticulatedPose::body`](../../crates/sim/src/pose.rs#L101) was already a `Vec3`
  whose doc comment said "Z is the floor". This session corrected that sentence
  rather than deleting it, and the correction is narrower than it looks: a body
  still has no vertical degree of freedom **of its own**.

## Tiles are flat plateaus

Each tile carries one height. There is no interpolation across a tile and no slope
within one, so a floor is a step function and every arithmetic operation stays
exact. This is the Doom sector model, chosen over a smoothed heightfield for two
reasons: interpolation is where a fixed-point terrain sampler grows a rounding
argument nobody wants to have, and a step function is what makes "the wall is a tall
tile" true by construction rather than by threshold.

`TERRAIN_HEIGHT_RAW_UNIT` is an eighth of a world unit and `TERRAIN_STEP_UP_RAW`
is three of those. Both are bounded from **both** sides by their own tests --
`one_height_step_is_between_a_hand_and_a_stair_riser` and
`the_step_up_admits_a_stair_and_refuses_a_knee_high_ledge`.

`Dungeon` gained `heights: Vec<i16>` row-major beside `tiles`, and `sculpted: bool`
beside the existing `carved: bool`.

## The digest short-circuit is the whole hash argument

`carved` exists so that "every pre-existing scenario is provably unchanged" is a
short-circuit rather than an argument. `sculpted` reuses it exactly:

```rust
h.write_u16(cols);
h.write_u16(rows);
h.write_bytes(tiles);
if sculpted { for step in heights { h.write_u16(*step as u16); } }
```

`Dungeon::from_tiles` keeps its exact signature, fills `heights` with zeros and sets
`sculpted = false`; `from_tiles_and_heights` is the new constructor and the only way
to set it. It derives `sculpted` from whether any height is **non-zero**, so a
"sculpted" dungeon of all zeros digests identically to a flat one --
`a_sculpted_dungeon_of_all_zero_heights_digests_as_a_flat_one` asserts that, and it
is what makes the property about the *values* rather than about which constructor
was called.

Every shipped scenario is flat, so `ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH`,
`BOW_HASH`, `LAB_HASH` and `GOLDEN_STATE_HASH` are unreachable rather than argued
about. All six answer what they answered before.

## Passability became directional

`passable_between(from, to)` answers whether a body standing on `from` may step onto
`to`. On a flat dungeon it is exactly `!self.solid(to)`, which is why every existing
caller is inert. On a sculpted one a rise greater than `TERRAIN_STEP_UP_RAW` is
impassable **uphill and passable downhill**, which is what makes a ledge a one-way
drop and a cliff a wall from below.

`passable_for_routing`, `is_clear`, `distances_for`, `push_out`, `nearest_clear`,
`clearance` and `is_walk_clear` all route through it, and every one takes the
`!self.sculpted` fast path first, so a flat dungeon runs the code it ran before
instruction for instruction.

## Sight reads height, or a cliff is not a wall

`raycast`, `sees` and `visible_tiles` were planar. On a sculpted dungeon a tile
blocks sight when its floor height exceeds the eye height of the ray at that tile,
interpolated between the two endpoints with one `mul_div` per step and no division
outside it. A tall plateau then occludes exactly as masonry does, which is the
sentence "walls and obstacles naturally emerge from the elevation" made mechanical.
All three carry the same `!self.sculpted` fast path.

## The body's own z

`World` gained `ground_z: Vec<Fx>`. **Derived, and stored anyway**: it is a pure
function of `pos` and the dungeon, but the contact phase and the pose publication
both read it and must agree, and recomputing it in two places is how they would stop.
It is maintained in `settle` -- wherever `pos` changes -- and sampled once at spawn,
so the pair cannot be observed disagreeing. That is the same property `Dungeon`'s
cached digest rests on.

Two consumers changed, both by one term:

- `build_contact_colliders` forms the sweep's two ends as
  `(start.x, start.y, height_at(start))` and `(end.x, end.y, ground_z[i])` where it
  formed `(x, y, 0)` before. **Both ends, at their own tile**, because a body that
  stepped up during the tick swept from the lower floor to the higher one and a
  single height would flatten that back out. This is the one line that puts the whole
  existing three-dimensional solver on a hill;
- the pose publication writes `ground_z` into the body `z` word that was already
  there.

`ground_z` is hashed in the `EmbodiedV1` block **and only there**, appended behind
`matches!(model, Embodied)`, so an articulated digest answers exactly what it
answered before terrain existed.

## Tests

In `crates/sim/src/dungeon.rs`:

- `a_flat_dungeon_fingerprints_exactly_as_it_did_before_heights_existed`
- `a_sculpted_dungeon_fingerprints_differently_from_the_same_tiles_flat`
- `a_sculpted_dungeon_of_all_zero_heights_digests_as_a_flat_one`
- `a_rise_above_the_step_up_is_impassable_uphill_and_passable_down`
- `a_cliff_is_masonry_from_below_and_a_ledge_from_above`
- `a_tall_tile_blocks_sight_that_the_same_tile_flat_does_not`
- `a_floor_is_a_step_function_with_no_slope_inside_a_tile`
- `every_routing_query_on_a_flat_dungeon_answers_what_it_answered_before`
- `one_height_step_is_between_a_hand_and_a_stair_riser` and
  `the_step_up_admits_a_stair_and_refuses_a_knee_high_ledge` -- the two constants,
  each bounded from both sides

In `crates/sim/src/world/mod.rs`:

- `a_body_on_a_plateau_publishes_the_plateau_height_as_its_pose_z`, with the flat
  arrangement of the same fixture asserted alongside so the claim is about the
  terrain and not about the spawns
- `a_weapon_swung_on_a_ledge_reaches_a_body_below_it` -- the point of the session.
  It asserts contact still happens across the step **and** that the contact count
  differs from the flat control. That second half is the load-bearing one: if
  `build_contact_colliders` still put both bodies at `z = 0` the two fights would be
  bit-identical and the counts equal. **Shown failing** -- reverting the two collider
  origins makes both fights report exactly 19 contacts and the test names it.
- `a_flat_world_hashes_no_terrain_and_a_stepped_one_does`, which also writes rubbish
  into an articulated world's `ground_z` and asserts its digest does not move

## Verification, as run

```powershell
cargo test                                                      # 1212 passed, 0 failed
cargo run --release -p lab -- hash                               # 0xfe31370e141ef531
cargo run --release -p lab -- verify --seeds 200
cargo run --release -p lab -- bench  --carved
cargo run --release -p lab -- duel   --seeds 400
cargo run --release -p lab -- articulated --seeds 400 --mirrored
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
```

## Hash expectation, and what happened

**Nothing moved**, on the `sculpted` short-circuit. `ROOM_HASH` was the one to watch
and the one most likely to surprise -- its script is the only golden that issues an
`Order::Goto`, so it is the only one that reaches `ordered_feet`, and routing now goes
through `passable_between`. It answers what it answered before, because every routing
query takes the `!sculpted` fast path and `ROOM_HASH`'s dungeon is flat. `bench
--carved` still runs the shipped floor plan at its usual throughput.
