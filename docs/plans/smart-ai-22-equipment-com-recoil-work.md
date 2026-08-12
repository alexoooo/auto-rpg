# Smart AI 22 -- equipment-COM recoil work

**Status:** checkpoint A test-only prototype closes `revise`; default authority unchanged.
Session 21 separated the retained contact's post-impact equipment-COM velocity from its
whole-tick displacement, but correctly refused to drive that velocity on the next
tick without accounting for motor work at the held equipment's centre of mass. This
session supplies that accounting seam. It does not promote Cartesian recoil merely
because an energy identity is green.

## Scope and predeclared outcome

The bounded checkpoint owns one held row and one motor interval. It persists exact raw
body-relative equipment-COM velocity `c`, not hand velocity. Given the next scalar
pose's sampled offset `s1`, free inertial hand velocity is `h_free=c0-s1`; therefore
`h_free+s1=c0` byte-exactly and bearing motion cannot invent COM momentum. It compares:

```text
initial = body_before + com_relative_before
coast   = body_after  + com_relative_before
final   = body_after  + com_relative_after
```

`initial -> coast` is body/external transport. `coast -> final` is actuator work.
Offset changes affect hand velocity but cancel from COM velocity; adding them again is
double counting. For widened numerator
`K(v)=mass_raw*(vx_raw^2+vy_raw^2+vz_raw^2)`, the ledger records checked signed
differences, never the floored public `u64` energy:

```text
external_delta = K(coast) - K(initial)
motor_delta    = K(final) - K(coast)
total_delta    = K(final) - K(initial)
```

It independently verifies the discrete work identity
`motor_delta = mass_raw * (final-coast).dot(final+coast)`. Positive motor delta is
supplied work; negative motor delta is motor absorption. The identity is accounting,
not permission: promotion still needs a checked power/fatigue budget derived from
effort, authority, inertia, and the actuator caps. Defining the allowed budget as the
measured positive delta would be circular and must fail review.

The prototype is fixed-point and allocation-free over one row. Every add, subtract,
square, multiply, and accumulation is checked in `i128`. Zero/negative mass,
noncanonical inactive recoil, and overflow reject by distinct names. A shield with
zero offset is the control; a segment with a changing nonzero offset is the
load-bearing cancellation case. Axis permutation and simultaneous sign mirror must map
the complete ledger exactly.

## Test-first checkpoint A

Checkpoint A added test-only helpers beside the existing widened friction numerator
in `crates/sim/src/combat/resolution.rs`, with a small `pub(crate)` surface for the
World fixture:

```rust
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct EquipmentComWorkLedger {
    pub initial_numerator: i128,
    pub coast_numerator: i128,
    pub final_numerator: i128,
    pub transport_delta: i128,
    pub motor_work: i128,
}

pub(crate) fn equipment_com_work_ledger(
    initial: &[EquipmentComSample], coast: &[EquipmentComSample],
    final_state: &[EquipmentComSample],
) -> Result<EquipmentComWorkLedger, DirectionalReject>;
```

The exact pure fixture has initial hand/offset `5/3`, coast `10/-2`, and final
`11/-2`: relative COM is `8,8,9`, all initial/coast COM words are `10`, and final COM
is `11`, producing numerator `(300,300,363)`, transport `0`, and motor work `63`.
The load-bearing tests include:

```rust
#[test] fn equipment_com_energy_includes_offset_changes_and_every_cross_term() {}
#[test] fn equipment_com_motor_work_uses_relative_com_and_a_fixed_body() {}
#[test] fn equipment_com_work_rejects_row_drift_and_checked_overflow() {}
#[test] fn retained_sword_stores_com_relative_velocity_and_derives_the_free_hand() {}
#[test] fn explicit_post_contact_com_velocity_reconciles_with_exact_work() {}
```

Storing hand velocity, adding the new offset twice, using `mass*|hand|^2`, flooring through `closure_energy`, or
dropping the `coast` state must make a named test red. A World-side retained fixture
then feeds the exact sword row into the helper and pins source Equipment/target Body,
TOI `55704`, offset `(197,3768,0)`, body-relative post COM velocity `(2,-1,0)`, and
derived hand velocity `(-195,-3769,0)`. Its widened sword-row numerator moves from
`3273351951552` to `251568802272`. The motor prototype takes an externally supplied
acceleration word, applies the existing component-chase shape, and pins one step's
numerator `406320 -> 1641939120`, signed/supplied work `1641532800`, zero-acceleration
work `0`, and exact-capture work `169` before canonical clearing. These remain
measurements: no contact or actuator branch reads the feature-gated state.

## Checkpoint B before authority

Production promotion must derive that acceleration word inside the real actuator from
requested effort, arm authority, fatigue, equipment inertia, and the existing caps,
then append the L1 relative-COM velocity change to the existing fatigue/residue bill
exactly once. The current helper proves the work caused by an already-bounded step; it
does not prove that caller derivation or billing. Positive `motor_delta` is supplied
work and negative delta is named absorption. Body transport, wall and
envelope reactions, sever/release/grip replacement, contact-cap clearing, and exact
target capture each get separate ledger classifications; none silently zeros recoil.

Only after that law passes may session 21's full lifecycle proceed: nonzero-TOI final
collider endpoint commit, last direct-group replacement, body-only preservation,
two-hand right ownership and mirror, shield cache, reset/reuse, replay, native/wasm,
and actual `ContactProjector::after_group` anatomy. The retained anatomy gate remains
`(381,105,276)`, channels `(132,0,144)`, internal wound/integrity delta `12672`, and
published fractions `65536 -> 59200` and `0 -> 6336` on the uniquely attributed
region. The response-independent session-19 Lab diagnostic runs only after those
World gates.

Checkpoint A establishes the accounting identity and therefore closes `revise`: it
does not yet supply the noncircular permission/fatigue law. This is a useful result and
must not be relabelled partial authority.

## Pin budget

The test-only checkpoint and feature-gated unused helper move no default pin.
Promotion inherits session 21's budget: `ARTICULATED_COMMAND_HASH` moves for appended
inactive state bytes, `CONTACT_BEHAVIOR_DIGEST` moves for authority, and
`ARTICULATED_STREAM_DIGEST` may move only if its script reaches changed state or
publication. All legacy hashes, `COMBAT_GEOMETRY_HASH`, ABI versions, replay command
schema, feature-prefix pins, and `LEARNED_INFERENCE_DIGEST` remain fixed. Enable the
same recoil feature through every native and wasm host before comparing targets. No
pin is re-recorded in this checkpoint.

## Commands

```powershell
cargo test -p sim equipment_com_work -- --nocapture
cargo test -p sim post_contact -- --nocapture
cargo test -p sim --features cartesian-recoil post_contact
cargo test -p sim
node tools/check_docs.js
git diff --check
```

Production promotion additionally owes the full workspace, Lab, release wasm, and
`tools/wasm_check.js` gates from `AGENTS.md`.
