# Smart AI 04 -- calibrate the arm actuator from clean strikes

**Status:** revise -- the full corpus rejected every candidate.

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

Add the actuator-unit tests in
[`crates/sim/src/combat/actuator.rs`](../../crates/sim/src/combat/actuator.rs):

```rust
#[test]
fn bearing_speed_reaches_the_selected_sweep_without_overshoot() {}
#[test]
fn the_selected_pair_preserves_the_measured_speed_to_acceleration_ratio() {}
```

Add the corpus discriminator in
[`crates/lab/src/strike_corpus.rs`](../../crates/lab/src/strike_corpus.rs), where it
can use the session-03 policy without reversing the `sim <- policy <- lab`
dependency direction:

```rust
#[test]
fn the_old_and_selected_actuators_are_distinguished_by_the_strike_corpus() {}
```

When no candidate is selected, name that test
`the_old_and_candidate_actuators_are_distinguished_by_the_strike_corpus` instead;
the test still guards the calibration seam without claiming that production adopted
a rejected pair.

The second test is about the candidate pair, not the fighter's agility stat. The
actuator contract scales maximum speed by agility while acceleration is scaled by
available effort, authority, fatigue, power and equipment inertia. Calibration does
not change that rule: every candidate above raises the base maximum speed and base
acceleration by the same factor and preserves their measured 6:1 ratio.

Break the production speed back to 1,092 after selecting a higher value and show the
third test fail.

## Outcome

The 100-seed mirrored result is recorded in
[`smart-ai-actuator-calibration.md`](../performance/smart-ai-actuator-calibration.md).
The smallest pair to clear crossing, contact conversion and travel was `(2_184,
364)`, but it increased contact-without-named-cross cases from 64 to 68. Every larger
pair increased that regression further. No candidate passed all criteria, so the
production constants and every golden remain unchanged.

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
