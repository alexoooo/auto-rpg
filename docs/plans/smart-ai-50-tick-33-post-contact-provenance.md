# Smart AI 50 -- tick-33 post-contact provenance

**Status:** complete with no divergence on 2026-08-13. On a clean reproduction with
both actuator Y products and all four geometry endpoint interpolations corrected,
every staged exact-response, commit, recoil, actuator, and published-pose field mapped
exactly through the complete 49-tick schedule: `ticks=49 phase=none`. There is no
tick-33 post-contact defect to assign. The earlier one-raw report was an incomplete
temporary edit, not evidence against the joint repair. No pin or corpus ran.

## A -- one bounded staged diagnostic

Under `cfg(feature = "cartesian-recoil")`, add a fixed, `Copy + Eq + Debug`
diagnostic row in [`crates/sim/src/world.rs`](../../crates/sim/src/world.rs) for each
arm, retained only for the completed tick beside existing unhashed contact evidence.
It contains public/raw scalar snapshots, not private solver objects:

```text
tick, entity, limb
pre-step ArmState words and pre-step exact-owner COM/held response words
mapped ContactResolution key, impulse, alpha and energy words
post-solve exact-owner body/held/floor-response words
committed body, hand, previous_hand, linear_velocity
post_contact_active and post_contact_com_velocity
inverse-hand bearing/height/reach, if commit performs an inverse
next actuator target, authority, inertia, available, errors and chase steps
post-actuator bearing/height/reach, speeds, residues, fatigue
post-actuator hand, linear_velocity and recoil COM words
```

Capture at existing production boundaries in
[`resolution.rs`](../../crates/sim/src/combat/resolution.rs), exact commit/application
in [`world.rs`](../../crates/sim/src/world.rs), and
[`integrate_arm_with_recoil`](../../crates/sim/src/combat/actuator.rs#L297). Pass one
optional internal sink through those calls; do not duplicate arithmetic or allocate.
Expose a borrowed slice from `World` for Lab only. It is unhashed, unrecorded, absent
from browser ABI, and cleared every tick.

Required diagnostic tests:

```rust
#[test] fn post_contact_provenance_captures_each_authoritative_boundary_in_order() {}
#[test] fn post_contact_provenance_is_fixed_bounded_unhashed_and_cleared_each_tick() {}
#[test] fn rejected_ticks_do_not_publish_partially_committed_post_contact_rows() {}
```

Mutation proof: move the committed-hand capture before commit and watch the boundary
test fail; omit recoil COM from the actuator exit capture and watch the completeness
test fail. Restore diagnostics before measurement.

## B -- exact mirror comparison

Extend `tactical-mechanics --mirror-trace-1536` to compare the staged rows before its
ordinary `PostStepPose` comparison. Map limbs `0<->1`; points through `y=16-y`;
vectors, linear velocity, impulse, and COM response through Y negation; bearing and
bearing speed through angular/signed negation; preserve height, reach, effort,
fatigue, residues, energy, entity, region, and contact kind. Compare sorted mapped
contact keys without swapping entities.

Print only the first mismatch:

```text
tick=33 stage=<stage> entity=<id> limb=<limb> field=<field>
plain=<raw> mirror=<raw>
```

The stage order is pre-step state, resolution input, solved response, exact-owner
commit, committed arm/recoil state, actuator input, actuator intermediates, actuator
exit, published pose. The first unequal authoritative word assigns the next plan;
later differences are consequences.

## C -- temporary reproduction and stop

Temporarily apply exactly both already-diagnosed corrections:

1. Smart44's two actuator Y `mul_div(..., Fx::ONE)` products;
2. Smart49's local reflection-safe endpoint interpolation in
   `swept_segment_segment_audited`.

Run only ordinal 1536. Require tick-32 TOI `38127|38127`, then record the first staged
tick-33 mismatch and stop. Do not fix it. Fully revert both temporary production
mutations and their tests; require empty diffs for `actuator.rs` and the Smart49
geometry repair (the Smart50 test-only diagnostic remains).

Existing registered-pin movement and new-pin budgets are zero. Do not measure pins,
run the 7,560-case corpus, measure damage, tune policy, promote the feature, or open
the Arena.

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p sim post_contact_provenance --features cartesian-recoil -- --nocapture
cargo test -p sim rejected_ticks_do_not_publish --features cartesian-recoil -- --nocapture
cargo test -p lab mirror_trace --features cartesian-recoil -- --nocapture

# Temporary Smart44 + Smart49 reproduction only:
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536
# Revert both; these commands must show no temporary production change:
git diff -- crates/sim/src/combat/actuator.rs
git diff -- crates/fx/src/geom3.rs

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

No server or browser is needed. Smart50 is diagnostic-only.
