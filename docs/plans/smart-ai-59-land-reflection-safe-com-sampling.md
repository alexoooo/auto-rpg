# Smart AI 59 -- land reflection-safe weapon COM sampling

**Status:** stopped at checkpoint C on 2026-08-13. Componentwise reflection-safe
weapon COM sampling landed and the prior resolution velocity mismatch is fixed. The
focused trace then found the next first unequal authoritative word:
`tick=34 phase=PostStepPose pair=right.hand.y 441359|441358`, with
`cause=none|none`. Per the stop, no pin was measured or updated and the 7,560-case
corpus did not run. Smart60 owns diagnostic-only tick-boundary commit/recoil/actuator
provenance; Smart59 does not widen the arithmetic repair.

## A -- one componentwise production replacement

In [`World::build_contact_colliders`](../../crates/sim/src/world.rs), retain the exact
existing definitions and parenthesization of:

```rust
let hand_velocity = body_velocity + self.arms[i][owner].linear_velocity;
let swing = (segment.requested.tip - segment.previous.tip)
    - (segment.requested.hilt - segment.previous.hilt);
```

Replace only `swing * balance` in the weapon `sampled` expression with a small local
componentwise helper using [`fx::mul_div`](../../crates/fx/src/fixed.rs):

```rust
fn scale_contact_vector(value: Vec3, scale: Fx) -> Vec3 {
    Vec3::new(
        fx::mul_div(value.x, scale, Fx::ONE),
        fx::mul_div(value.y, scale, Fx::ONE),
        fx::mul_div(value.z, scale, Fx::ONE),
    )
}

let sampled = clamp_contact_velocity(
    hand_velocity + scale_contact_vector(swing, balance),
);
```

Place the helper beside contact-collider construction under the same feature reach as
the changed path; do not change global `Fx::Mul`, `Vec3::Mul`, actuator arithmetic,
shield/body sampling, legacy swings, or any other multiplication. Preserve
`velocity_offset = sampled - hand_velocity` exactly. The existing clamp remains after
the sum; neither frozen orientation reaches it, and its bounds do not change.

## B -- production tests and mutation proof

Promote Smart58's fixture into direct `build_contact_colliders` assertions in
[`crates/sim/src/world.rs`](../../crates/sim/src/world.rs):

```rust
#[test] fn tick_32_weapon_com_sample_is_odd_under_reflection() {}
#[test] fn weapon_com_sample_uses_balance_at_the_same_centre() {}
#[test] fn weapon_velocity_offset_still_recovers_hand_velocity() {}
#[test] fn shield_body_and_zero_swing_rows_are_byte_identical() {}
```

Assert hilt/tip/swing/balance, exact numerator `226716760`, denominator `65536`,
quotients/remainders `3459 r27736|-3459 r-27736`, hand `1180|-1180`, and sampled
`4639|-4639`. Keep the existing test that the sample is at equipment balance rather
than hand/tip. Assert all XYZ components and both `velocity` and `velocity_offset`.

Mutation proof: restore ordinary `swing * balance` and require the reflected sample
test to fail as `4639|-4640`; apply `mul_div` to hand velocity or the final sum instead
of only swing scaling and require the byte-identity/offset tests to fail. Restore the
one-operation production change before gates.

## C -- focused trace stop

Run cumulative Smart51, Smart53, Smart55, Smart57 and Smart59 repairs:

```powershell
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536
```

Required output is `ticks=49 phase=none`. Any unequal authoritative word, rejection,
or selection change stops before pin capture and corpus. Record the exact first
boundary and author a new diagnostic plan; do not widen the COM repair.

## D -- pin ownership and paired targets

The sampled weapon velocity feeds candidate facts, response, armor/wounds, events and
authoritative state. Smart59 also inherits the still-unrecorded cumulative reflection
repairs. Before measurement the budget is:

```text
COMBAT_GEOMETRY_HASH: expected to move from cumulative Smart51 geometry
ARTICULATED_STREAM_DIGEST: expected to move from pose/event/velocity behavior
CONTACT_BEHAVIOR_DIGEST: explicitly at risk if its fixed corpus reaches the changed
                         exact weapon sample or point-driven armor/wound path
feature-reachable fight/state hashes: inspect and own only with exact changed-byte
                                      provenance from COM velocity to authoritative use
all default-only unrelated pins, layout versions, strides, format digests, command
hash, scenario fingerprints and learned inference digest: zero moves
new pins: zero
```

Keep old constants for native actual capture. Build wasm from identical source and
capture independent default and feature actuals. An unreachable fixture remains
unchanged; a move needs exact path/byte evidence. Native/wasm disagreement or any
unpredicted/unexplained move stops without re-record. Only agreeing explained moves
may update Rust, JavaScript and
[`docs/reference/hashes.md`](../reference/hashes.md#golden-registry), with old/new
values and unchanged layouts recorded.

## E -- gates, then one frozen corpus

After `phase=none`, paired pins and all default/feature/wasm/dependency gates are
green, rerun the focused trace. Only then run Smart41's unchanged 7,560-orientation,
four-shard noise-free mirror corpus once. Preserve eligibility, local 18-neighbour
product, tolerances, maximin physical-dissipation selection, duration/ordinal
tie-break and damage exclusion. Run all without early stop or post-measurement retune;
record counters, eligible sides, local/robust/selected result, checksum and elapsed
time.

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p sim tick_32_weapon_com_sample --features cartesian-recoil -- --nocapture
cargo test -p sim weapon_com_sample_uses_balance --features cartesian-recoil -- --nocapture
cargo test -p sim weapon_velocity_offset_still --features cartesian-recoil -- --nocapture
cargo test -p sim shield_body_and_zero_swing --features cartesian-recoil -- --nocapture
cargo test -p sim --features cartesian-recoil
cargo test -p sim
cargo test -p fx
cargo test -p lab --features cartesian-recoil
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536

# Old-pin paired captures.
cargo test -p web -- --nocapture
cargo test -p web --features cartesian-recoil -- --nocapture
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
node --test tools/wasm_check.js

# After only explained, paired pin updates.
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

# Last, only after every preceding gate is green.
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --noise-free-mirror-corpus

node tools/check_docs.js
git diff --check
```

`wasm_check.js` checks the artifact already present; each call follows its matching
build. No server or browser is needed.
