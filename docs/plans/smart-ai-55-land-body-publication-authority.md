# Smart AI 55 -- land body publication authority

**Status:** stopped at checkpoint C on 2026-08-13. The production `P=M+Q(R)` body
authority and its consistent stage/rebase tests landed, and the previous body-pose
difference is fixed. The trace then found the next first unequal authoritative word:
`tick=33 phase=Resolution pair=resolution.point.y 514088|514089`, with
`cause=none|none`. Per the declared stop, no pin was measured or updated and the
7,560-case corpus did not run. Smart56 owns a non-authoritative diagnosis of contact
point publication; Smart55 adds no tolerance or post-trace retune.

## A -- one production body quotient

In [`crates/sim/src/combat/contact.rs`](../../crates/sim/src/combat/contact.rs), add
an internal `#[cfg(any(test, feature = "cartesian-recoil"))]` helper:

```rust
wide_body_origin_quotient(
    origin: ExactMotorPoint,
    owner: &ExactOwnerTrajectory,
    time: u32,
) -> Result<Vec3, ExactScanReject>
```

For each coordinate, evaluate the integral motor word `M` at `time` and the owner's
common response rational `R` through the existing wide arithmetic, then publish
`M + Q(R)`. Convert only `R` once. Preserve every checked envelope and existing
refusal kind. Do not round, average mirrored values, compensate by one raw unit, add
a tolerance, or special-case the fixture. Body rows have no held response; refuse a
shape/owner mismatch through the existing exact-scan error vocabulary.

In [`World::stage_exact_contact`](../../crates/sim/src/world.rs), replace only the
body origin obtained through `wide_evaluated_shape_quotient` with this helper. Keep
Smart53's held publication exactly `published_body + Q(H-O)` for segments and its
relative-corner shield construction. No extra diagnostic evaluation may enter the
live path.

In [`wide_rebase_owner_tick`](../../crates/sim/src/combat/contact.rs), obtain
`published_body` from the same helper. Retain the exact common residual against that
published word:

```text
residual = exact(M + R) - (M + Q(R))
```

and keep held rebase anchored to `published_body + Q(H-O)`. Stage and rebase must call
the same authority; an independently reconstructed quotient is not acceptable.

## B -- production and mutation proofs

Promote the Smart54 oracle into direct production-path tests and retain Smart53's
segment/shield tests:

```rust
#[test] fn tick_32_body_stage_publishes_motor_plus_response_quotient() {}
#[test] fn reflected_body_stage_maps_524826_to_523750() {}
#[test] fn body_stage_and_common_rebase_share_one_publication_authority() {}
#[test] fn body_rebase_retains_equal_and_opposite_subraw_residuals() {}
#[test] fn body_authority_leaves_relative_segment_and_shield_anchors_unchanged() {}
```

Assert the exact Smart54 numerators, quotients, remainders, reflection sum and
next-tick reconstruction in test comments and values. Mutation proof: restore
absolute `Q(M+R)` in stage and require the reflected-stage test to fail; restore it
only in rebase and require the next-tick test to fail. Restore production before any
gate.

## C -- focused trace is the behavior gate

Run the permanent two actuator-Y, four interpolation, Smart53 held-relative, and
Smart55 body-authority repairs together:

```powershell
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536
```

The required result is `ticks=49 phase=none`. Any earlier or later unequal
authoritative word stops Smart55 before pin capture and before the corpus; author a
new diagnostic plan for that exact boundary. Do not retune this repair from trace
output.

## D -- owned pins, paired targets, and stop rules

This landing includes the still-unrecorded Smart51 interpolation/actuator behavior,
Smart53 held publication, and Smart55 body publication. Before measurement, the pin
budget is:

```text
COMBAT_GEOMETRY_HASH: expected to move (Smart51 odd-symmetric interpolation)
ARTICULATED_STREAM_DIGEST: expected to move (published articulated trajectory)
CONTACT_BEHAVIOR_DIGEST: conditional only if its fixed corpus reaches a changed path
all other registered pins, hashes, fingerprints, and layout versions: zero moves
new pins: zero
```

There is no registered exact-trajectory digest. `LAB_HASH`, `ROOM_HASH`, legacy
feature prefix, `ARTICULATED_COMMAND_HASH`, scenario fingerprints, format digests,
and learned inference digest must remain unchanged. Keep old constants while
capturing native actuals, build wasm from the identical source, and capture its
actuals independently. A native/wasm disagreement or any unpredicted pin move stops
without updating constants. Update Rust, JavaScript, and
[`docs/reference/hashes.md`](../reference/hashes.md#golden-registry) only after both
targets agree, recording old/new values and why row layouts did not change.

## E -- full gates, then the frozen corpus once

After the focused trace and paired pin update are green, run all default, feature,
dependency, and wasm gates. Only then run Smart41's unchanged 7,560-orientation
noise-free mirror corpus once, with its four shards, eligibility rule, local
18-neighbour product, tolerances, maximin physical-dissipation selection,
duration/ordinal tie-break, and damage exclusion. Run the full domain with no early
stop or post-measurement retune. Record counters, eligible sides, local/robust/selected
result, checksum, and elapsed time in Smart55 and durable research.

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p sim tick_32_body_stage --features cartesian-recoil -- --nocapture
cargo test -p sim reflected_body_stage --features cartesian-recoil -- --nocapture
cargo test -p sim body_stage_and_common_rebase --features cartesian-recoil -- --nocapture
cargo test -p sim body_rebase_retains --features cartesian-recoil -- --nocapture
cargo test -p sim body_authority_leaves_relative --features cartesian-recoil -- --nocapture
cargo test -p sim --features cartesian-recoil
cargo test -p sim
cargo test -p fx
cargo test -p lab --features cartesian-recoil
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536

# Old-pin paired capture; do not edit constants until native and wasm actuals agree.
cargo test -p web -- --nocapture
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js

# After only the predeclared agreeing pin updates:
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

# Last, after every preceding gate is green:
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --noise-free-mirror-corpus

node tools/check_docs.js
git diff --check
```

`wasm_check.js` checks the artifact already present, so each invocation follows its
matching build. No server or browser is needed.
