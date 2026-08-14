# Smart AI 123 -- close and register the lifted Coulomb solver gate

**Status:** planned after Smart122. Smart127 closed the missing ordinary boundary
authority, but no solver digest value has been measured or registered;
`LIFTED_COULOMB_SOLVER_DIGEST` remains `TBD`. Do not run the pin registration
independently of the prerequisite trajectory digest.

This session adds the one missing named response mutation proof and registers the
feature-only Smart38 solver/corpus grammar. It does not rerun the 7,560-case search,
retune policy, select by damage or move an existing pin.

## A -- the missing mechanics-before-damage mutation

In [`crates/sim/src/combat/lifted_solver.rs`](../../crates/sim/src/combat/lifted_solver.rs),
add exactly:

```rust
#[test]
fn removing_normal_or_friction_response_breaks_the_gate_before_damage_is_read() {}
```

Use the existing analytic exact pair, `trial`, `constraints_hold`, `score` and
`compare_score` helpers. Solve one restitution-only row and one row with nonzero
tangential motion/friction. For the normal mutation, zero the selected normal
component, rebuild the trial and require restitution/constraints to fail. For the
friction-response mutation, zero the selected tangent component and require its
exact score to lose to the selected circular-cone solution. Do not claim the latter
is outside the cone: zero tangent may be admissible but is not the selected minimum-
slip response.

A local `Cell<bool>` damage reader runs only after constraints and exact selected
score match. Baseline reaches it; both mutations leave it false. Bypass each check
independently and observe this named test fail, then restore.

Delete or clearly supersede the two obsolete ignored Smart38 corpus tests in
[`crates/sim/src/world.rs`](../../crates/sim/src/world.rs). Add exact-name live wrappers
in [`crates/lab/src/tactical_mechanics.rs`](../../crates/lab/src/tactical_mechanics.rs):

```rust
#[test] fn retained_strike_is_selected_by_mechanics_and_then_records_a_wound() {}
#[test] fn ordinary_command_strike_and_eighteen_neighbours_pass_the_mirrored_gate() {}
```

Both wrappers must call the existing source-41 ordinal-3144 measurement. Keep the
direct-pose/exact-state provenance refusal test. Do not duplicate the corpus or make
damage enter eligibility/selection.

## B -- fixed solver digest grammar

Add a feature-only `sim::lifted_coulomb_solver_digest() -> u64` in the Smart121/122
diagnostic module. It exposes no solver scratch or private exact row. Avoid a
`sim -> policy` edge: either extract only the already-frozen command constructor to a
lower sim helper and prove policy/Lab command bytes unchanged, or keep a concise sim
diagnostic constructor and add an exact command-receipt equality test against the
policy runner.

Run only source-41 ordinal 3144's frozen robust neighbourhood:

```text
target/anatomy             neutral Brute / Legs
offset raw                 (-163_840, -65_536)
chamber                    28
central strike             28
central reach raw          61_440
strike delta order         [-1, 0, +1]
reach delta order          [-256, 0, +256]
mirror order               [false, true]
total                      18
```

Each case must use stored ordinary commands and compare direct, rerun and recorded
replay before hashing the replay. Require all 18 eligible, mapped keys/regions,
identical physical dissipation `278`, nonzero impulse, interior TOI, zero refusal/cap,
both exact remainder classes after commit and the next tick, and matching anatomy.
Damage is outcome evidence after the mechanical checks.

Hash this exact order:

```text
"ARPG-LIFTED-COULOMB-V1"
u16 grammar version = 1
u32 bounds: facts 16, rows 42, sweeps 8, lifts/visit 96
u16 corpus source = 41
u32 selected ordinal = 3144
central anatomy/offset/chamber/strike/reach words and literal perturbation counts

for each of 18 cases in the order above:
  strike delta, reach delta, mirror flag
  scenario fingerprint and submitted-command receipt
  contact tick, mapped key, kind, region, TOI
  exact point, normal, velocity A/B and selected impulse A/B
  group alpha and energy before/after/dissipated
  post-commit and next-tick state digests
  exact external rows, anatomy words, cap and refusal code

fixed ordered refusal-code table tail
```

Include damage words only after the selected mechanical row. Do not hash candidate
capacity, visits, scratch addresses or wall time.

## C -- paired feature pin

Add cached feature-only lo/hi exports and a native paired assertion in
[`crates/web/src/lib.rs`](../../crates/web/src/lib.rs). Extend feature mode in
[`tools/wasm_check.js`](../../tools/wasm_check.js) to require, compare and call them
twice without second-call growth; default mode proves absence. Register the agreed
value in the Rust owner, JavaScript owner and
[`docs/reference/hashes.md`](../reference/hashes.md#golden-registry) only after native
direct/rerun/replay and fresh wasm replay agree.

Expected existing pin moves are zero. In particular default stream
`0xdbbd86fedd61c4c7`, geometry `0x9d15344883cf6e9c`, contact behavior
`0x587b0259e877105a`, ABI/replay/command/learned pins and absent `ARTICULATED_HASH`
remain unchanged. The feature stream receipt `0xa6835666303601d2` is a separate
unregistered witness and must not be renamed into either new pin.

## Verification

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p sim --features cartesian-recoil removing_normal_or_friction -- --nocapture
cargo test -p lab --features cartesian-recoil retained_strike -- --nocapture
cargo test -p lab --features cartesian-recoil ordinary_command_strike -- --nocapture
cargo test -p sim --features cartesian-recoil lifted_coulomb_solver_digest -- --nocapture
cargo test -p web --features cartesian-recoil lifted_coulomb_solver_digest -- --nocapture
cargo test
cargo test --workspace --features cartesian-recoil
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
$env:ARPG_CARTESIAN_RECOIL='1'
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```
