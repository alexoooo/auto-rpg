# Smart AI 24 -- feature-gated recoil lifecycle

**Status:** bounded feature-gated World slice closes `revise`; default authority and
all hosts remain unchanged.

Sessions 21--23 established the state, equipment-COM work identity, physical arm-length
units, acceleration permission, and shared fatigue arithmetic. This session connects
the smallest coherent subset behind `sim/cartesian-recoil` and measures the remaining
promotion blockers rather than weakening them.

## Implemented slice

The feature build now:

- drives scalar joints once through an unbilled integration seam, derives the held
  segment COM-offset change from that committed bearing, and computes the COM motor
  step from the same entry fatigue/effort/authority/inertia values;
- clamps desired body-relative COM velocity to the physical COM maximum, accelerates
  by the physical COM cap, derives free hand velocity as `c1-next_offset`, and sends
  scalar plus normalized COM deltas through one fatigue/residue call;
- commits the final collider hilt/shield centre as the actual hand for a directly
  impulsed equipment row and stores `row.velocity-body.velocity` as body-relative COM
  velocity; it does not subtract `velocity_offset`, which would store hand velocity;
- leaves pre-existing recoil byte-exact when an owner's held row moved only with its
  body and acquired no direct impulse;
- clears a changed/released/severed grip, zero-initializes reused slots, and keeps the
  non-owning arm untouched; a `Both` mirror clears the left non-owner and retains only
  the right owner's recoil state;
- canonicalizes exact motor capture to inactive/zero only after the final interval's
  work has been billed.

The retained actual-World fixture asserts one right sword/body fact, activates only the
direct source sword, preserves poison state on the target's body-only translated held
row, and observes a changed hand or COM word plus nondecreasing fatigue on the next
actuator tick. Grip release and severance clear exact nonzero seeds; the slot-reuse
test now poisons both arms before reap and proves the next generation is canonical.

## Why this still closes revise

The feature is not promotable. Wall/envelope settlement and contact-cap clearing do
not yet publish a named widened-numerator dissipation ledger; silently zeroing them
would violate session 21. Grip/sever clear paths canonicalize state but likewise do
not yet report removed energy. Replay evidence is impossible until an ordinary
recorded command activates this feature path, and the actual retained production
contact solver still has session 11's restitution defect, so the anatomy gate
`(381,105,276)`, `(132,0,144)`, and wound delta `12672` cannot honestly pass.

The remaining gates are therefore: named reset/cap/wall/envelope dissipation; Both
direct-contact and mirror mutation fixtures; exact final endpoint/COM work ledger over
the following tick; active-tick replay plus recorded release; actual `after_group`
anatomy; Lab meaningful strike; same-feature native/wasm equality. No default host is
allowed to enable the feature before all pass.

## Pin budget and commands

The default build moves no pin. The feature build intentionally changes the articulated
state grammar and is not compared with default goldens. Promotion inherits sessions
21--23's budget and requires the feature to be enabled uniformly through policy, Lab,
web, native, and wasm before any permitted pin is recorded.

```powershell
cargo test -p sim --features cartesian-recoil retained_world_commit -- --nocapture
cargo test -p sim --features cartesian-recoil grip_change_and_severance -- --nocapture
cargo test -p sim --features cartesian-recoil articulated_columns_follow_every_allocated_and_reused_slot
cargo test -p sim
node tools/check_docs.js
git diff --check
```
