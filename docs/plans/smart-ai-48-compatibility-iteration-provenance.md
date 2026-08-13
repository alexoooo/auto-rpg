# Smart AI 48 -- compatibility iteration provenance

**Status:** complete on 2026-08-13. The first unequal internal word was iteration 1,
entry time `37379`, interpolated endpoint `[0].y`: plain `452236`, mapped mirror
`452237`. `Fx::lerp` rounded `+1180*37379 -> +673` but
`-1180*37379 -> -674`. Closest point A and distance then differed; speed remained
equal at `8144`. Direct and shared-origin TOIs remained `38127|38111`. No fix, pin
measurement/update, or corpus ran, and the actuator was reverted cleanly. Smart49
owns the narrow interpolation repair.

## A -- freeze the literal pair

Freeze Smart47's emitted row byte for byte in one test beside
[`swept_segment_segment_audited`](../../crates/fx/src/geom3.rs#L376). Do not rebuild
it from a scenario or decimal units:

```text
key: entity 0 slot 1 -> entity 1 BODY_SLOT, WeaponBody, region 4
primitive: SweptSegmentSegment
weapon previous:  [678151,451563,26213] -> [799703,500607,26213]
weapon requested: [677638,452743,26213] -> [796458,508077,26213]
Legs previous:    [786432,524288,0] -> [786432,524288,52428]
Legs requested:   [786432,524288,0] -> [786432,524288,52428]
radii: [2621,19660]
```

Construct the mirror solely by replacing every Y word with `1_048_576-y` (reflection
about `y=8`); assert the key maps only held slot `1->0`, while entity, `BODY_SLOT`,
kind, and region remain exact. The red baseline is exact:

```rust
assert_eq!(plain_toi.get().raw(), 38_127);
assert_eq!(mirror_toi.get().raw(), 38_111);
```

Also preserve the already-run shared-origin experiment as a regression test: subtract
the same endpoint origin within each orientation and require the two unequal answers
to remain `38127|38111`. This prevents Smart48 from reopening the refuted hypothesis.

## B -- bounded per-iteration provenance

In [`crates/fx/src/geom3.rs`](../../crates/fx/src/geom3.rs#L895), add a test-only
audited entry point returning a fixed `[Option<SweepIterationDiagnostic>;
SWEEP_ADVANCES]`; production `swept_segment_segment` continues through the same
implementation and return type. Each visited iteration records exact raw words for:

```text
iteration index; entry time
four interpolated segment endpoints
closest-points branch/feature and its unclamped/clamped segment parameters
chosen closest point A and B
delta A-B; distance_sq; distance
radius; separation; speed
quotient; remaining; advance_raw; exit time
touch/time-one/cap decision
```

The closest-points provenance belongs at
[`closest_points_on_segments`](../../crates/fx/src/geom3.rs#L123), not in a duplicate
formula. Use a small internal sink passed through the audited path under `cfg(test)`;
fixed arrays only, no allocation, RNG, float, logging, or authoritative field.

Compare plain and reflected rows in order. Points/vectors map by Y negation; scalar
squares, distances, speed, separation, quotient, advance, time, branch, and decision
must be identical. Print and assert the first unequal field with iteration and both
raw values. Stop after naming it; do not edit the arithmetic in Smart48.

Required tests:

```rust
#[test] fn tick_32_literal_pair_retains_the_38127_38111_baseline() {}
#[test] fn shared_origin_does_not_remove_the_tick_32_toi_mismatch() {}
#[test] fn tick_32_iteration_trace_names_the_first_nonreflecting_internal_word() {}
#[test] fn iteration_provenance_is_fixed_bounded_and_does_not_change_the_answer() {}
```

Mutation proof: move the closest-points capture from before clamping to after
clamping and require the named first field test to fail; then make the iteration sink
skip one visit and require the exact trace-length/index assertion to fail. Restore
diagnostic production before gates. This proves the trace observes the boundary it
claims rather than merely printing the final TOI.

## C -- focused scenario confirmation and stop

Temporarily restore Smart44's two reviewed actuator Y lines, run only ordinal 1536,
and require its compatibility row to contain the same literal inputs and
`38127|38111`. Revert the actuator immediately and require its diff empty. Record the
first internal field/iteration in this plan and
[`v2-articulated-contact-research.md`](../performance/v2-articulated-contact-research.md),
then stop. A correction and any pin ownership belong to a later pre-measurement plan.

Existing pin movement and new-pin budgets are zero. No full audit or policy work.

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p fx tick_32_literal_pair -- --nocapture
cargo test -p fx shared_origin -- --nocapture
cargo test -p fx tick_32_iteration_trace -- --nocapture
cargo test -p fx iteration_provenance -- --nocapture
cargo test -p lab mirror_trace --features cartesian-recoil -- --nocapture

# Temporary two-line actuator reproduction only:
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536
# Revert it and prove the actuator is clean:
git diff -- crates/sim/src/combat/actuator.rs

cargo test -p fx
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

No server or browser is needed. Smart48 is diagnostic-only.
