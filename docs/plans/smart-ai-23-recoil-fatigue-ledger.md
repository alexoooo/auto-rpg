# Smart AI 23 -- recoil acceleration and fatigue ledger

**Status:** checkpoint A test-only prototype; default authority unchanged.

Session 22 proved the equipment-COM work identity but accepted an acceleration word
from its caller. This session derives that word from the exact existing actuator
formula and includes realised relative-COM acceleration in the same fatigue/residue
aggregate as bearing, height, and reach.

## Exact seam

Extract the existing expression without changing its parenthesization:

```rust
available = ((((effort * authority) * (ONE - fatigue)) * power) / inertia)
    .clamp(ZERO, ONE);
com_acceleration = arm_length * (Fx::from_raw(ARM_LINEAR_ACCEL_RAW) * available);
com_maximum = arm_length * (Fx::from_raw(ARM_LINEAR_MAX_SPEED_RAW) * agility);
```

The test-only COM chase uses those caps. Authority is expressed once in realised
`delta_c`; billing must not multiply it again. The one fatigue aggregate is:

```text
normalized_com = (|delta c.x| + |delta c.y| + |delta c.z|) / arm_length
sum = |delta bearing speed| + |delta height speed| + |delta reach speed|
    + normalized_com
work = inertia^2 * effort * sum
accumulated = work.raw + existing work_residue.raw
fatigue += accumulated / 256
work_residue = accumulated % 256
```

Recovery occurs only when the scalar step was idle at entry **and** `delta_c==ZERO`.
An idle scalar pose with active COM reconciliation pays work. A `Both` item has one
right-owned COM row and bills that right arm exactly once; the left mirror receives no
second bill.

## Checkpoint A evidence

`crates/sim/src/combat/actuator.rs` keeps ordinary `bill_fatigue` as a zero-COM wrapper
over test-only `bill_fatigue_with_com_delta`. Full `ArmState` equality proves both
nonidle billing and idle recovery remain byte-identical at `delta_c==ZERO`.

Exact fixtures:

- Fighter arm length `49152` scales full world COM caps to acceleration/speed
  `204/1228`; normalized `273/1638` is a units regression;
- scalar deltas `100/200/300`, COM delta `(205,-102,51)`, Fighter arm length
  `49152`, inertia raw `16384`, effort one, fatigue/residue `100/200` normalize COM
  L1 to `477`, aggregate to `1077`, and produce `101/11`;
- scalar-idle with the same COM delta gives `101/59`, not recovery to `96`;
- effort zero leaves `100/255` unchanged even with supplied nonzero deltas;
- effort zero, authority zero, or fatigue one derives COM acceleration zero;
- dividing by sword inertia cannot produce more acceleration than the unarmed control;
- a 256-raw right-owned `Both` COM delta bills right `1/0` while left remains `17/19`.

Mutations that omit any absolute component, restore the old idle early return, use
signed components, multiply authority again during billing, or bill the mirrored left
row must fail these literals. Integer quotient with carried residue is associative, so
the plan deliberately does not claim a final-state comparison can distinguish two
sequential folds from one; production integration must expose exactly one combined
call site for structural review.

This checkpoint closes `revise`: the arithmetic and caps are demonstrated, but no
World contact, motor, or clearing branch consumes the feature-gated state. Production
still owes session 22's exact COM step in the real actuator, the single combined call
site, TOI commit, reset/clear classifications, anatomy, replay, mirror, Lab, and wasm
gates.

## Pin budget and commands

Test-only helpers and refactoring the identical `available` expression move no default
pin. Production inherits sessions 21--22's declared pin budget; no pin is re-recorded
here.

```powershell
cargo test -p sim combat::actuator::tests:: -- --nocapture
cargo test -p sim post_contact -- --nocapture
cargo test -p sim
node tools/check_docs.js
git diff --check
```
