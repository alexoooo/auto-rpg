# v2-12 — add inert deterministic combat geometry and immutable specs

**Goal:** provide the continuous fixed-point XYZ vocabulary, edge-case rules, and
immutable body/equipment/grip definitions needed by mechanics, without connecting
them to `World::step`.

**Depends on:** `v2-10` and `v2-11`.

**Golden expectation:** every legacy hash remains byte-identical; no articulated pin.

Read `docs/reference/determinism.md` before editing.

## Fixed-point geometry

Add `crates/fx/src/vec3.rs` and focused functions in `crates/fx/src/geom3.rs`:

```rust
pub struct Vec3 { pub x: Fx, pub y: Fx, pub z: Fx }
pub struct TimeOfImpact(Fx);          // clamped tick fraction [0, 1]
pub struct ClosestPoints { pub a: Vec3, pub b: Vec3, pub distance_sq: Fx }
```

Implement saturated vector arithmetic, dot/length-squared/normalized-or-zero,
segment/segment closest points, swept segment/sphere, swept segment/vertical capsule,
and segment/plane. The reference document fixes parallel, zero-length, tangent,
coincident, saturated, and equal-distance tie behavior. No square root is required
when squared comparisons suffice.

## Immutable construction

Use `CombatHeight`, `LimbSlot`, and `ArmTarget` from the frozen command vocabulary in
`crates/sim/src/command.rs`. Add `crates/sim/src/combat/spec.rs`:

```rust
pub struct BodyAnatomySpec { /* dimensions and region volumes */ }
pub struct EquipmentSpec { /* mass, balance, material, geometry, grips */ }
pub enum GripBinding { Left, Right, Both }
```

`CombatHeight::LOW/MID/HIGH` are 1/4, 1/2, and 3/4, but intermediate values remain
distinct. Scenario construction stores/fingerprints immutable spec IDs and complete
versioned definitions; unknown IDs never consult a mutable global registry. Sword
right, shield left, and club right form the only fixture definitions.

Create inert modules `crates/sim/src/combat/{mod.rs,actuator.rs,geometry.rs,
contact.rs,resolution.rs}`. Extract no unrelated `world.rs` code.

## Tests and verification

```text
vec3_arithmetic_saturates_in_every_direction
parallel_and_coincident_segments_choose_the_documented_pair
a_swept_segment_cannot_tunnel_through_a_sphere_or_capsule
tangent_and_zero_length_sweeps_have_stable_answers
combat_height_clamps_but_does_not_quantize
immutable_specs_change_scenario_fingerprints
left_and_right_limb_slots_have_stable_discriminants
geometry_results_match_across_threads_native_and_wasm
```

```powershell
cargo test -p fx
cargo test -p sim
cargo test
cargo run --release -p lab -- hash
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
git diff --check
```
