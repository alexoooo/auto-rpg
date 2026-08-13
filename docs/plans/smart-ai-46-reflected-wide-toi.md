# Smart AI 46 -- reflected wide-detector TOI

**Status:** stopped and refuted on 2026-08-13. Under the temporary two-Y reproduction,
wide provenance was absent and reported `CompatibilityFallback`. Exact response was
proven zero, so the dispatcher deliberately used
`scan_compatibility_candidates_into`; the selected-time mismatch remained
`38127|38111`. The wide-detector premise was false, so no direct oracle or fix ran.
The actuator mutation was reverted cleanly; no pin or corpus ran. Smart47 moves the
focused diagnosis to the legacy compatibility sweep.

## Checkpoint A -- pair and primitive provenance

Extend Smart45's feature-only fixed diagnostic in
[`crates/sim/src/combat/resolution.rs`](../../crates/sim/src/combat/resolution.rs#L82)
and the exact scan implementation in
[`crates/sim/src/combat/contact.rs`](../../crates/sim/src/combat/contact.rs) with a
bounded `ExactWideToiDiagnostic`. It contains the mapped `ContactKey` tuple, body
region, collider shape pair, primitive name, interval endpoints, candidate root(s),
accepted root, and comparison/rejection stage as exact integer words. Expose no
private trajectory type, raw scratch slice, impulse, or remainder. Store one row per
mapped group member in the already bounded feature-only diagnostic array; it is
unhashed, unrecorded, allocation-free, and absent from browser exports.

Instrument the production path, not a duplicate Lab detector. Name which primitive
is entered (segment/segment, segment/region capsule, shield/region, or other existing
wide primitive), which polynomial or closest-approach boundary produces each root,
and the exact inclusive/exclusive comparison that accepts it. Lab maps points by
`(x,y,z)->(x,16-y,z)`, vectors by `(x,y,z)->(x,-y,z)`, limbs `0<->1`, preserves
entity/kind, and maps the body-region identity without sorting away identity.

Required tests:

```rust
#[test] fn wide_toi_provenance_names_pair_region_primitive_root_and_comparison() {}
#[test] fn wide_toi_provenance_is_fixed_bounded_unhashed_and_cleared_each_tick() {}
#[test] fn reflected_contact_keys_preserve_region_and_swap_only_limb_slots() {}
```

## Checkpoint B -- direct reflected primitive oracle

Capture the exact tick-32 pair inputs selected by A as literal wide integer inputs in
the detector module's tests. Call the production primitive directly on the plain row
and its mathematically reflected row. Assert every invariant input (squared lengths,
radii, discriminant or closest-approach numerator/denominator, interval bounds) maps
exactly, and compare each root-selection intermediate until the first unequal pair.
The existing result is the required red oracle: `38127|38111`.

Also run a bounded reflection product covering the responsible primitive's endpoint
orderings, zero/nonzero transverse components, both signs around division
remainders, discriminants immediately around square boundaries, and roots at
`0`, `1`, `65535`, and `65536`. Literal stable loops only; no RNG and no tolerance.

```rust
#[test] fn tick_32_pair_exposes_the_first_non_reflecting_wide_toi_operation() {}
#[test] fn wide_toi_is_exact_for_the_declared_reflected_boundary_product() {}
```

## Checkpoint C -- repair root choice, not its envelope

Correct the first operation named by B using a reflection-safe integer
parenthesization, sign normalization, comparison ordering, or canonical root choice.
Both reflected inputs must follow the same branch and return the exact same TOI word.
Do not average the two answers, add a 16-raw tolerance, widen an interval, add search
steps, special-case tick/pair/region/sign, or change the lifted solver.

Mutation proof is mandatory: restore the old expression and watch the tick-32 direct
oracle plus a bounded case fail; perturb the new comparison/root tie-break and watch
a different boundary case fail. Restore production before gates.

Required green tests:

```rust
#[test] fn tick_32_reflected_pair_returns_one_exact_toi() {}
#[test] fn reflected_wide_detector_selects_the_same_canonical_root() {}
#[test] fn unrelated_wide_detector_primitives_are_byte_identical() {}
```

## Checkpoint D -- focused reproduction and stop

Temporarily reapply Smart44's reviewed two `mul_div(..., Fx::ONE)` actuator Y lines,
run only ordinal 1536, and require the tick-32 mapped group times and keys to agree.
The trace must advance beyond tick 32. Any later divergence is recorded and stops;
do not fix a second subsystem. Fully revert the temporary actuator lines/tests and
require an empty actuator diff before final gates.

No full audit, damage measurement, or pin measurement/update is authorized. Existing
and new pin budgets are zero; every registered digest remains byte-identical.

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p sim wide_toi_provenance --features cartesian-recoil -- --nocapture
cargo test -p sim tick_32_pair --features cartesian-recoil -- --nocapture
cargo test -p sim wide_toi_is_exact --features cartesian-recoil -- --nocapture
cargo test -p sim reflected_wide_detector --features cartesian-recoil -- --nocapture
cargo test -p lab mirror_trace --features cartesian-recoil -- --nocapture

# Temporary two-line actuator reproduction only:
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536
# Revert it and prove no actuator production/test diff remains:
git diff -- crates/sim/src/combat/actuator.rs

cargo test -p sim
cargo test -p sim --features cartesian-recoil
cargo test -p lab
cargo test -p lab --features cartesian-recoil
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

`wasm_check.js` checks the artifact already present; each run follows its matching
build. No server or browser is needed. Only a later plan may authorize another full
corpus.
