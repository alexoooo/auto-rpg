# Smart AI 44 -- owned exact-reflection stream move

**Status:** stopped at checkpoint B on 2026-08-13. The restored two-Y correction and
focused actuator tests passed. The ordinal-1536 trace advanced through tick 32, then
first diverged at tick 33 `PostStepPose`: `right.hand.x 678247|677638`. Rejection
provenance was `none|mirror tick=32 phase=SolveGroup cause=ResolutionCount key=None`.
Per the declared stop, no native/wasm digest measurement or pin update ran. The
actuator production changes and tests were fully reverted, and the old default web
digest is green again. The full corpus did not run.

The trace refutes the claim that actuator reflection was the only remaining defect.
Smart45 owns diagnosis of the tick-32 `ResolutionCount`; Smart44 records no pin.

## Checkpoint A -- restore the proven two-product correction

In [`crates/sim/src/combat/actuator.rs`](../../crates/sim/src/combat/actuator.rs#L103),
restore only Smart43's diagnosed correction. Ordinary `Fx * Fx` rounds a negative
product toward negative infinity. Use the existing deterministic
[`fx::mul_div`](../../crates/fx/src/fixed.rs#L216) with denominator `Fx::ONE`, which
truncates toward zero and is odd under sign negation, for these two Y products:

```rust
// shoulder
mul_div(yaw.cos(), side, Fx::ONE)

// hand_position
shoulder.y + mul_div(bearing.sin(), physical_reach, Fx::ONE)
```

Keep the X products and every Z, state, rate, fatigue, recoil, solver, and collision
operation unchanged. Do not add a mirror flag, limb branch, raw-word compensation,
remainder, ABI field, or fixture special case.

The exact laws are:

```text
reflect point about y=8: (x,y,z) -> (x,16-y,z)
reflect vector:          (x,y,z) -> (x,-y,z)
LeftArm <-> RightArm
yaw a -> -a; bearing b -> -b; bearing speed s -> -s
height, reach, effort, fatigue, work residue and authority residue unchanged
```

Restore the focused tests beside the actuator implementation:

```rust
#[test] fn actuator_y_product_is_odd_at_the_ordinal_1536_words() {}
#[test] fn hand_position_is_exact_under_left_right_forward_plane_reflection() {}
#[test] fn one_arm_step_is_exact_under_reflection_at_every_declared_boundary() {}
#[test] fn fatigue_work_and_all_residues_are_identical_under_reflection() {}
#[cfg(feature = "cartesian-recoil")]
#[test] fn active_recoil_arm_step_is_exact_under_reflection() {}
#[test] fn ordinal_1536_tick_one_post_step_pose_is_exactly_mapped() {}
```

Use Smart43's bounded anatomy, limb, yaw/negated-yaw, bearing/negated-bearing,
reach, height, effort, and boundary-error products with literal stable loops and no
RNG. Mutation proof is required: restore either one of the two ordinary Y
multiplications and watch the focused ordinal test plus a bounded reflection case
fail; restore production before proceeding. This demonstrates that both edits, and
not an unrelated refactor, are necessary.

## Checkpoint B -- focused trace before any pin edit

With the old pin still present in both owners, run:

```powershell
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536
```

The source-41 plain/mirror pair must be mapped-equal through every chamber/follow
tick plus the following tick across `Config`, `Command`, `PreStepPose`,
`PostStepPose`, `Resolution`, `Rejection`, and `CrossingOracle`. Required output is
`phase=none` with the complete tick count. Any later divergence stops Smart44: do not
touch either digest constant and do not run the full corpus.

## Checkpoint C -- prove and own exactly one portable pin move

The stream digest is a values pin over the twenty-tick published pose, event, and
region words; the actuator correction legitimately changes those authoritative pose
values without changing any row layout or ABI version. Preserve the old constants
while collecting both failures:

1. Run the native web digest test and record its expected/actual pair.
2. Build `web.wasm` from the same source, then run `wasm_check.js` and record its
   independently computed actual digest.
3. Require both actual values to be identical. The predicted value from Smart43 is
   `0x078dcf03bbd5ed88` (`544318744924908936`), but disagreement or any third value
   stops the session for diagnosis rather than being normalized.

Only after native and wasm agree, update the pin in both owners:

- [`crates/web/src/lib.rs`](../../crates/web/src/lib.rs#L10809),
  `ARTICULATED_STREAM_DIGEST`;
- [`tools/wasm_check.js`](../../tools/wasm_check.js#L859), the paired JavaScript
  constant.

Update the `ARTICULATED_STREAM_DIGEST` row in
[`docs/reference/hashes.md`](../reference/hashes.md#golden-registry) with old/new
values, exact-reflection rationale, unchanged row layouts/versions, and native/wasm
agreement. Record the same evidence in
[`v2-articulated-contact-research.md`](../performance/v2-articulated-contact-research.md).
Then rerun native and wasm gates against the new constants.

The complete movement budget is:

```text
ARTICULATED_STREAM_DIGEST: expected to move once, in both registered owners
every other registered hash, fingerprint, digest, and exact-state pin: zero moves
new pins: zero
```

In particular `LAB_HASH`, `ROOM_HASH`, browser frame hashes,
`ARTICULATED_COMMAND_HASH`, `CONTACT_BEHAVIOR_DIGEST`, the contact-format corpus,
combat spec/fight fingerprints, legacy feature prefix, and
`LEARNED_INFERENCE_DIGEST` remain byte-identical. A second moved pin stops the
session; do not re-record it.

## Verification

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p sim actuator_y_product_is_odd -- --nocapture
cargo test -p sim hand_position_is_exact_under -- --nocapture
cargo test -p sim ordinal_1536_tick_one -- --nocapture
cargo test -p sim --features cartesian-recoil active_recoil_arm_step -- --nocapture
cargo test -p sim
cargo test -p sim --features cartesian-recoil
cargo test -p lab
cargo test -p lab --features cartesian-recoil

cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536

# Run these with the old pin first to capture matching actual values.
cargo test -p web articulated_stream_digest -- --nocapture
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js

# Only after equality, edit both owners, then run the complete firewall.
cargo run --release -p lab -- hash
cargo test
cargo test -p web
cargo test -p web --features cartesian-recoil
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
node --test tools/wasm_check.js

node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

`wasm_check.js` tests the artifact already present, so each invocation follows its
matching build. No development server or browser is needed. Passing Smart44 permits
a later plan to authorize the full audit; it does not authorize that audit here.
