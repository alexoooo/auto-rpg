# Smart AI 02 -- measure intentional strikes

**Goal:** replace “looks like flailing” with a deterministic corpus that can say
whether a commanded strike crossed its named target, at what speed, and with what
result.

The articulated observation at [`crates/sim/src/obs.rs#L431`](../../crates/sim/src/obs.rs#L431)
contains opponent region volumes but not the subject weapon pose or dimensions needed
to predict its own sweep. Add outward observation data only; do not alter authoritative
world state or the 922-column legacy feature vector.

## Observation seam

Append these fields to `ArticulatedObservation` and fill them in
[`World::observe_articulated`](../../crates/sim/src/world.rs#L1547):

```rust
pub standing_height: Fx,
pub arm_length: Fx,
pub hand_radius: Fx,
pub weapons: [Option<SegmentPose>; 2],
```

`SegmentPose` already exists at
[`crates/sim/src/combat/geometry.rs#L19`](../../crates/sim/src/combat/geometry.rs#L19).
The values are views of immutable spec/current pose. They are not serialized, hashed,
or appended to `Observation::write_features` in this session.

Add exact tests:

```rust
#[test]
fn an_articulated_observation_carries_the_subjects_reachable_weapon_geometry() {}

#[test]
fn observing_weapon_geometry_does_not_change_the_world_hash() {}
```

Break the field population after writing the first test and show it fail.

## Lab corpus

Add `crates/lab/src/strike_corpus.rs` and the command:

```powershell
cargo run --release -p lab -- strike-corpus --policy neutral --seeds 100 --mirrored
```

Each case places one armed attacker at nine fixed approach offsets against a neutral
Fighter and Brute, in both mirrors. Record CSV rows with:

```rust
struct StrikeRow {
    seed: u64,
    mirrored: bool,
    intended_region: BodyPart,
    first_cross_tick: Option<u32>,
    first_contact_tick: Option<u32>,
    blade_travel_raw: i32,
    closure_energy: u64,
    wound_energy: u64,
    decided_tick: Option<u32>,
    refusals: u32,
    solver_rejections: u32,
}
```

“Cross” is geometric: the committed weapon sweep intersects the named published
`RegionVolume`; it is not inferred from a damage event. Keep strike attribution in
Lab/policy instrumentation, outside sim authority and replay.

Tests in `crates/lab/src/strike_corpus.rs`:

```rust
#[test]
fn a_cross_is_the_named_region_and_not_merely_any_contact() {}
#[test]
fn mirrored_strike_rows_differ_only_in_handed_coordinates() {}
#[test]
fn the_stationary_control_never_invents_a_committed_strike() {}
```

All current hashes must remain byte-identical.

## Verification

```powershell
cargo test -p sim
cargo test -p lab
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```
