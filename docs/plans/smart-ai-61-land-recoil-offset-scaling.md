# Smart AI 61 -- land recoil offset scaling

**Status:** stopped at checkpoint D on 2026-08-13. A-C remain green and the permanent
trace is `ticks=49 phase=none`. Default native and wasm agree on a moved stream value,
but the feature wasm artifact traps out of bounds in `scan_detector_into`, so paired
feature evidence is incomplete. Per the atomic stop, no pin was updated and the
corpus did not run. Smart62 owns the wasm diagnosis; the agreeing default stream
update is deliberately deferred.

## A -- one production product

In [`integrate_arm_with_recoil`](../../crates/sim/src/combat/actuator.rs), retain the
existing old/new direction-times-length expressions byte for byte. Replace only
`(new-old)*item.balance`:

```rust
let delta = new - old;
Some(Vec3::new(
    mul_div(delta.x, item.balance, Fx::ONE),
    mul_div(delta.y, item.balance, Fx::ONE),
    mul_div(delta.z, item.balance, Fx::ONE),
))
```

Reuse the existing `mul_div` import. Do not change global `Fx::Mul`, `Vec3::Mul`, the
length products, Smart59's collider sampling, or any other actuator arithmetic. Leave
`update`, `com_accel`, `com_max`, `free_hand`, `crosses`, post-contact lifetime and
fatigue billing untouched.

## B -- tests and mutation proof

In [`crates/sim/src/combat/actuator.rs`](../../crates/sim/src/combat/actuator.rs) and
the frozen tick-boundary tests in
[`crates/sim/src/world.rs`](../../crates/sim/src/world.rs), add:

```rust
#[test] fn tick_34_recoil_offset_balance_is_odd_under_reflection() {}
#[test] fn tick_34_direction_length_products_remain_byte_identical() {}
#[test] fn tick_34_recoil_hand_maps_after_only_offset_scaling_changes() {}
#[test] fn recoil_clamp_crossing_lifetime_and_fatigue_are_unchanged() {}
#[test] fn inactive_recoil_and_non_segment_items_are_byte_identical() {}
```

Freeze direction `27667|-27667 -> 30738|-30738`, length offsets
`55334|-55334 -> 61476|-61476`, delta `6142|-6142`, balance `36044`, old product
`3378|-3379`, corrected `3378|-3378`, `com_accel=102`, `com_max=614`, old relative
hand `-14040|14041`, corrected `-14040|14040`, and mapped final pose. Assert XYZ,
active flags, velocity, fatigue and residue.

Mutation proof: restore ordinary `(new-old)*balance` and require offset/hand tests to
fail. Apply `mul_div` to either direction-times-length product and require the
byte-identity control to fail. Restore the one-product repair.

## C -- focused trace stop

```powershell
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536
```

With cumulative Smart51/53/55/57/59/61 repairs, required output is
`ticks=49 phase=none`. Any unequal word, rejection or selection change stops before
pins and corpus; author a diagnostic successor and do not broaden actuator arithmetic.

## D -- pins and paired targets

The cumulative repairs do not all reach the same build:

- Smart51 actuator Y and `fx::geom3` interpolation are shared/default behavior.
  Geometry alone owns `COMBAT_GEOMETRY_HASH`; either path may affect a reached default
  fight or stream fixture.
- Smart53/55/57 publication and rebase changes are `cartesian-recoil`-only. They may
  explain feature trace/corpus bytes, never movement of a default pin.
- Smart59 weapon COM sampling is shared `World::build_contact_colliders` behavior and
  may explain a reached default contact, stream or state fixture.
- Smart61 executes only inside feature-gated `integrate_arm_with_recoil`. Its law uses
  shared arithmetic vocabulary, but it cannot itself explain a default pin move.

Before measurement:

```text
COMBAT_GEOMETRY_HASH: expected to move; Smart51 geom3 only
ARTICULATED_STREAM_DIGEST: expected to move only if its default fixture reaches
                           Smart51 actuator/geometry or Smart59 shared COM sampling
CONTACT_BEHAVIOR_DIGEST: at risk only through shared Smart51/Smart59 reach in its
                         registered default corpus; Smart53/55/57/61 cannot explain it
default fight/state hashes: at risk only through shared Smart51/Smart59 reach and
                           owned only with exact changed-byte provenance
feature trace and Smart41 checksum: may reflect every cumulative repair
all unrelated default pins, layouts, strides, format digests, command hash, scenario
fingerprints and learned inference digest: zero moves
new pins: zero
```

Checkpoint-D observations, with old constants still installed:

```text
COMBAT_GEOMETRY_HASH: unchanged 0x9d15344883cf6e9c
CONTACT_BEHAVIOR_DIGEST: unchanged 0x587b0259e877105a
default ARTICULATED_STREAM_DIGEST native: 0xdbbd86fedd61c4c7
default ARTICULATED_STREAM_DIGEST wasm:   0xdbbd86fedd61c4c7
feature stream native, unpinned:          0x2d323ac56c901e88
feature wasm: memory access out of bounds in scan_detector_into
feature command witness, unpinned:        0x5fcaba34556b2737
```

The unchanged geometry result corrects the pre-measurement expectation: Smart51's
interpolation repair is not reached by that frozen digest corpus. The feature command
number is not a moved `ARTICULATED_COMMAND_HASH`; Rust deliberately owns it only as an
unregistered exact-law witness. `tools/wasm_check.js` currently compares every
artifact to the default registered `0xd1da6a40df0480b2`, so its command failure on a
feature artifact is a checker-mode mismatch, not pin evidence. Likewise the feature
stream native value is diagnostic evidence, not a new pin.

Keep old constants for native capture, then build identical wasm and capture default
and feature actuals independently. Record build feature set and first changed fixture
byte before attribution. A default move attributed only to Smart53/55/57/61 is
unexplained and stops. An unreachable fixture stays unchanged.
Native/wasm disagreement or unexplained/unpredicted movement stops without re-record.
Only agreeing explained moves update Rust, JavaScript and
[`docs/reference/hashes.md`](../reference/hashes.md#golden-registry), with old/new
values and unchanged layouts recorded.

This update is not authorized yet: although the default stream pair agrees, D is one
atomic portable audit and the feature wasm trap stops it before re-record. Smart62
must finish without changing any constant; a later plan may resume the deferred
default update after feature target health is established.

## E -- gates, then one frozen corpus

After `phase=none`, paired pins and all default/feature/wasm/dependency gates are
green, rerun the trace. Only then run Smart41's unchanged 7,560-orientation,
four-shard noise-free mirror corpus once, preserving eligibility, local 18-neighbour
product, tolerances, maximin physical-dissipation selection, duration/ordinal
tie-break and damage exclusion. Run all without early stop or retune; record counters,
eligible sides, local/robust/selected result, checksum and elapsed.

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p sim tick_34_recoil_offset_balance --features cartesian-recoil -- --nocapture
cargo test -p sim tick_34_direction_length_products --features cartesian-recoil -- --nocapture
cargo test -p sim tick_34_recoil_hand_maps --features cartesian-recoil -- --nocapture
cargo test -p sim recoil_clamp_crossing_lifetime --features cartesian-recoil -- --nocapture
cargo test -p sim inactive_recoil_and_non_segment --features cartesian-recoil -- --nocapture
cargo test -p sim --features cartesian-recoil
cargo test -p sim
cargo test -p fx
cargo test -p lab --features cartesian-recoil
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536

cargo test -p web -- --nocapture
cargo test -p web --features cartesian-recoil -- --nocapture
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
node --test tools/wasm_check.js

# After only explained, paired updates.
cargo test
cargo test -p web
cargo test -p web --features cartesian-recoil
cargo run --release -p lab -- hash
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
node --test tools/wasm_check.js
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536
node tools/check_deps.js
node --test tools/check_deps.test.js

# Last, after every preceding gate is green.
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --noise-free-mirror-corpus

node tools/check_docs.js
git diff --check
```

Each wasm check follows its matching build. No server or browser is needed.
