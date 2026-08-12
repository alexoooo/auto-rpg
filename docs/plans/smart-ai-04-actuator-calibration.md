# Smart AI 04 -- calibrate the arm actuator from clean strikes

**Goal:** test the measured hypothesis that arm slew, not policy choice, prevents a
geometrically correct strike from carrying useful energy.

This session is authorized only after session 03 reports at least 90% intended-region
crossings. The current constants are
[`ARM_BEARING_MAX_SPEED_RAW = 1_092`](../../crates/sim/src/combat/actuator.rs#L6)
and [`ARM_BEARING_ACCEL_RAW = 182`](../../crates/sim/src/combat/actuator.rs#L7).

## Measurement before edit

Make both constants inputs to a test-only/Lab calibration function while production
continues to use the current pair. Evaluate paired values:

```rust
const ACTUATOR_CANDIDATES: [(i32, i32); 4] = [
    (1_092, 182),
    (2_184, 364),
    (4_368, 728),
    (8_736, 1_456),
];
```

Use the identical session-02 cases and bracket each subject with the current control.
Select the smallest pair satisfying all of:

- at least 90% intended-region crossings;
- at least 80% of committed crossings become weapon/body contacts;
- median committed blade travel is at least the corpus’s measured minimum for a wound,
  derived from data rather than copied from the legacy impact threshold;
- command refusals and solver rejections remain zero;
- no candidate increases energy excess or tunnelling regressions.

If none passes, land the table and mark `revise`; production constants stay unchanged.
Do not silently widen the table.

## Tests and hash decision

Add exact tests in [`crates/sim/src/combat/actuator.rs`](../../crates/sim/src/combat/actuator.rs):

```rust
#[test]
fn bearing_speed_reaches_the_selected_sweep_without_overshoot() {}
#[test]
fn agility_scales_speed_and_acceleration_by_the_same_documented_rule() {}
#[test]
fn the_old_and_selected_actuators_are_distinguished_by_the_strike_corpus() {}
```

Break the production speed back to 1,092 after selecting a higher value and show the
third test fail.

If constants change, predict only `ARTICULATED_STREAM_DIGEST`: its hand-written
twenty-tick command reaches actuator behavior. `ARTICULATED_COMMAND_HASH` is unstepped,
`CONTACT_BEHAVIOR_DIGEST` constructs its own colliders, and no policy or learning pin
is reachable. Update the actuator reference, gate ledger, Rust pin and JS mirror with
the measured reason. Any other moved pin rejects the change.

## Verification

```powershell
cargo test -p sim
cargo run --release -p lab -- strike-corpus --policy striker --seeds 100 --mirrored
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```

