# Smart AI 49 -- odd-symmetric sweep interpolation

**Status:** complete on corrected reproduction, 2026-08-13. A fresh run with both
actuator Y products and all four swept-segment endpoint interpolations corrected
returned `ticks=49 phase=none`. The earlier tick-33 report came from a mid-edit run
where the first endpoint still used `Vec3::lerp`, compounded by later witness edits;
it is not a production defect. The direct TOI remains `38127|38127`. All temporary
repairs were reverted, and no pin measurement/update or full corpus ran. Smart51
jointly owns landing the two proven repairs.

## A -- narrow production repair

In [`crates/fx/src/geom3.rs`](../../crates/fx/src/geom3.rs#L376), add a private
component helper computing `origin + mul_div(delta, t, Fx::ONE)` with existing
[`mul_div`](../../crates/fx/src/fixed.rs#L216), and a local reflection-safe `Vec3`
lerp. Use it only for the four endpoint interpolations inside
`swept_segment_segment_audited`'s distance closure. Do not change public `Fx`/`Vec3`
lerp, other sweep primitives, closest-points, speed, radius, tolerance,
`SWEEP_ADVANCES`, quotient, minimum advance, or touch comparison.

The exact law after a shared origin is
`L((x,-y,z),(x',-y',z),t)=reflect(L((x,y,z),(x',y',z),t))`. The diagnosed products
must become `+673|-673`; do not compensate the endpoint or TOI afterward.

## B -- direct red tests and mutations

Retain Smart48's literal pair and per-iteration trace. Before the edit these are red:

```rust
#[test] fn reflected_lerp_is_exact_at_plus_minus_1180_times_37379() {}
#[test] fn tick_32_reflected_segment_pair_returns_one_exact_toi() {}
#[test] fn reflected_segment_sweep_iterations_match_word_for_word() {}
```

Afterward both orientations must return one exact TOI and every mapped iteration word
must agree. Cover delta `[-32768,-1180,-1,0,1,1180,32768]`, time
`[0,1,37379,65535,65536]`, and positive/negative origins with literal loops.

Mutation proof: restore ordinary `delta*t` in one endpoint component and watch the
literal TOI/iteration test fail; restore arithmetic-shift rounding and watch the
signed product test fail. Restore production before gates.

## C -- focused trace and stop rule

Temporarily restore Smart44's two reviewed actuator Y lines and run only
`tactical-mechanics --mirror-trace-1536`. Tick 32 must have identical mapped key,
region, primitive, iterations, and TOI, and the trace must advance beyond tick 32.
Any later divergence is recorded exactly and stops Smart49. Revert the actuator and
require its diff empty before any pin measurement. Do not fix a later subsystem.

## D -- predeclared portable pin ownership

With the actuator clean, Smart49 owns these predicted default movements:

```text
COMBAT_GEOMETRY_HASH: expected to move
CONTACT_BEHAVIOR_DIGEST: expected to move if its sweep corpus reaches this operation
ARTICULATED_STREAM_DIGEST: expected to move if its 20-tick fixture reaches it
all other registered pins: zero moves
new pins: zero
```

Keep old constants while collecting native actuals, then build wasm and collect its
actuals independently. A conditional pin left unchanged is recorded as unaffected.
An unpredicted move or target disagreement stops. Only after focused-trace success and
native/wasm equality update each moved pin in both registered owners plus
`docs/reference/hashes.md` and
[`v2-articulated-contact-research.md`](../performance/v2-articulated-contact-research.md),
then rebuild and rerun. No full corpus, damage, policy, promotion, or Arena work.

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p fx reflected_lerp -- --nocapture
cargo test -p fx tick_32_reflected_segment_pair -- --nocapture
cargo test -p fx reflected_segment_sweep_iterations -- --nocapture
cargo test -p fx
cargo test -p sim --features cartesian-recoil
cargo test -p lab --features cartesian-recoil

# Temporary actuator reproduction, followed by clean revert:
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536
git diff -- crates/sim/src/combat/actuator.rs

# Old pins remain for paired actual-value capture.
cargo test -p web -- --nocapture
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js

# After permitted paired updates:
cargo test
cargo test -p web
cargo test -p web --features cartesian-recoil
cargo run --release -p lab -- hash
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
node --test tools/wasm_check.js
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

No server or browser is needed. Only a later plan may authorize the full corpus.
