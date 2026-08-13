# Smart AI 47 -- compatibility-sweep reflection

**Status:** stopped on 2026-08-13 after localization, before a fix. The temporary
two-Y reproduction identified the exact compatibility segment/segment pair and
literal reflected detector inputs; the production primitive returned plain TOI
`38127` and mirror TOI `38111`. Translating both cases to a shared origin left the
mismatch unchanged, refuting large world-coordinate origin as the cause. Per the
diagnostic stop, no geometry fix, pin measurement/update, or corpus ran, and the
actuator was reverted cleanly. Smart48 owns internal closest-points/conservative-step
provenance only.

## A -- name the compatibility primitive

Add feature-only bounded provenance at
[`scan_compatibility_candidates_into`](../../crates/sim/src/combat/contact.rs#L351)
and [`candidate`](../../crates/sim/src/combat/contact.rs#L2834). Record public mapped
key, region, shape pair, selected primitive (`swept_segment_segment`,
`swept_segment_rectangle`, or another actual branch), input endpoints/radii, accepted
TOI, and body-region ordinal. No private scratch, ABI, replay, or hash field.

Temporarily restore the two reviewed actuator Y lines only to reproduce ordinal 1536.
Print the first plain/mirror pair whose mapped inputs enter the same primitive but
return `38127|38111`, then revert the actuator before gates.

```rust
#[test] fn compatibility_provenance_names_the_tick_32_pair_region_and_fx_primitive() {}
#[test] fn compatibility_provenance_is_bounded_unhashed_and_cleared_each_tick() {}
```

## B -- direct reflected `fx` oracle

Freeze that pair's exact inputs as literals beside the responsible primitive in
[`crates/fx/src/geom3.rs`](../../crates/fx/src/geom3.rs#L367). Invoke the production
primitive on the plain inputs and the exact reflection `(x,y,z)->(x,-y,z)`. Instrument
the audited helper to identify the first unequal word among relative endpoint deltas,
speed, distance, safe step, visited time, and accepted time. The direct oracle must be
red at `38127|38111` before repair.

Add a bounded reflected product around the diagnosed signs/remainders and adjacent
safe-step boundaries. Literal loops, no RNG, tolerance, widened iteration count, or
expanded radius.

```rust
#[test] fn tick_32_compatibility_inputs_expose_the_first_nonreflecting_fx_word() {}
#[test] fn compatibility_sweep_is_exact_for_reflected_boundary_cases() {}
```

## C -- repair only the first rounding operation

Use a sign-symmetric fixed-point product/division, canonical comparison, or equivalent
integer parenthesization at the first unequal operation. Do not special-case the pair,
region, sign, or 16-raw gap. Old-expression mutation must fail the direct oracle;
perturbing the new tie-break must fail an adjacent bounded case.

Pin ownership is declared before measurement because `geom3` compatibility sweeps
feed default articulated contacts:

```text
COMBAT_GEOMETRY_HASH: expected to move; update Rust and wasm owners only on agreement
CONTACT_BEHAVIOR_DIGEST: expected to move if its swept corpus reaches the operation
ARTICULATED_STREAM_DIGEST: expected to move if its 20-tick fixture reaches it
all other registered pins: zero moves
new pins: zero
```

Collect native and wasm actual values with old constants first. A predicted pin that
does not move is recorded as unaffected. An unpredicted pin move stops; do not
re-record it. Update both owners and `docs/reference/hashes.md` only after native/wasm
agreement and after the focused trace passes.

## D -- focused trace, then portable pins

Temporarily restore the two actuator Y lines, run only `--mirror-trace-1536`, and
require tick-32 keys and selected time to map exactly and the trace to advance beyond
tick 32. A later subsystem difference stops. Revert the actuator and require its diff
empty. No full audit, damage, or policy work.

```powershell
cargo test -p fx tick_32_compatibility -- --nocapture
cargo test -p fx compatibility_sweep_is_exact -- --nocapture
cargo test -p sim compatibility_provenance --features cartesian-recoil -- --nocapture
cargo test -p lab mirror_trace --features cartesian-recoil -- --nocapture
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536
git diff -- crates/sim/src/combat/actuator.rs
cargo test -p fx
cargo test -p sim
cargo test -p sim --features cartesian-recoil
cargo test -p lab --features cartesian-recoil
cargo test
cargo test -p web
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
node --test tools/wasm_check.js
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

No server or browser is needed. A full corpus remains unauthorized.
