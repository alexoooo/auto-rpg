# Smart AI 103 -- promote robust ordinal 3144 into tactical strikes

**Status:** stopped at the competence gate. The exact ordinal-3144 reach/timing split
and focused command/mechanics tests landed, then the complete frozen moving-duel gate
returned `0/100` body decisions and `156430` solver-rejected ticks. The result is
`revise`; Smart106 owns rejection provenance only. Smart104 remains blocked, and no
retune, UI change or pin movement is authorized.

## A -- one selected schedule, no second search

Edit [`crates/policy/src/articulated_tactics.rs`](../../crates/policy/src/articulated_tactics.rs#L19).
The selected source-41 literal is immutable:

```text
ordinal             3144
chamber ticks       28
commit ticks        28
chamber reach raw   65536 (the corpus's fixed full-reach chamber)
commit reach raw    61440
bearing arc         toward -/+ one eighth turn, reflected by swapping signs
selected target     Brute
selected offset     (-163840,-65536), measurement provenance only
local robustness    strike +/-1, reach +/-256, both mirrors; all 18 dissipated 278
```

Keep `CHAMBER_TICKS = 28`, `COMMIT_TICKS = 28`, recovery, approach/withdraw speeds,
intent selection, region scoring and deterministic tie order unchanged. Split the
overloaded reach name into `GUARD_REACH = 3/4`,
`STRIKE_CHAMBER_REACH = Fx::ONE`, and
`STRIKE_COMMIT_REACH = Fx::from_raw(61_440)`. Guard coverage and Guard commands keep
using `GUARD_REACH`. Route only the two endpoints in
[`candidate_crosses`](../../crates/policy/src/articulated_tactics.rs#L551) and the two
strike arms in [`strike_command`](../../crates/policy/src/articulated_tactics.rs#L691)
through the strike constants. The predictor and submitted command must use the same
two values; a full-reach prediction paired with a 15/16 command is invalid.

Do not copy the Brute anatomy or selected offset into policy. They selected a schedule;
they are not privileged runtime observations. Keep [`choose_plan`](../../crates/policy/src/articulated_tactics.rs#L586)
generic over every observed opponent/region and both weapon hands. The existing two
ordered eighth-turn arcs already implement the reflected schedule and remain the only
arc candidates. `PolicyKind::Duelist` is the legacy non-articulated controller and is
out of scope; the promoted smart controller is `TacticalArticulatedPolicy`.

## B -- command, prediction and mutation proof

Add focused tests beside the existing stationary-target and mirror tests:

```rust
#[test] fn ordinal_3144_reach_words_drive_prediction_and_submission() {}
#[test] fn ordinal_3144_keeps_guard_reach_independent_of_strike_reach() {}
#[test] fn ordinal_3144_mirror_swaps_the_two_eighth_turn_endpoints() {}
#[test] fn ordinal_3144_stationary_brute_replays_all_eighteen_local_cases() {}
```

The first freezes raw reach words `65536` and `61440`, both 28-tick phase boundaries,
and equality between predicted and submitted endpoints. The second proves a guard
still submits raw `49152`. The mirror test compares exact bearing/reach/height/effort
words after the existing anatomical hand mapping. The local test lives in
`crates/lab/src/tactical_mechanics.rs` behind `cartesian-recoil`; it reuses the
selected Fighter sword/shield versus Brute fixture and the frozen `3 * 3 * 2` neighborhood;
it asserts unique crossing, zero refusals, zero solver rejections and nonzero physical
dissipation, but does not select or assert damage.

Make the tests red separately by restoring commit reach to `Fx::ONE`, applying the
strike reach to guards, using a different prediction reach, and failing to swap the
mirrored arc. Restore every mutation.

```powershell
cargo test -p policy ordinal_3144 -- --nocapture
cargo test -p policy a_stationary_target_is_crossed_by_the_region_the_plan_named -- --nocapture
cargo test -p policy mirrored_observations_produce_mirrored_strikes -- --nocapture
cargo test -p policy
cargo test -p lab --features cartesian-recoil ordinal_3144 -- --nocapture
```

## C -- predeclared 95/100 competence gate

Extend the existing [`lab articulated`](../../crates/lab/src/main.rs#L1099) command
with one refusal-checked `--competence-gate` mode. It accepts no seed, tick, policy,
opponent, attack-move or threshold override: it always builds two fresh Tactical
instances, runs seeds `0..50` in canonical and mirrored fixtures, and caps each trial
at tick 1,800. That is 100 independently scored trials. A body decision is
`timed_out == false`; a points decision at the cap is not a body decision.

The frozen pass is at least `95/100` body decisions, exactly the roadmap's gate,
rate, with zero refused submissions and zero solver-rejected ticks. Print the two
orientation counts, all outcome/contact-kind totals, worst decision tick, command
digest receipts and wall time before printing `pass` or `revise`. Do not require a
particular winner, wound channel, selected region, or damage total. Add:

```rust
#[test] fn tactical_competence_is_exactly_fifty_mirrored_seed_pairs() {}
#[test] fn a_points_decision_at_tick_1800_does_not_count_as_a_body_decision() {}
#[test] fn competence_gate_refuses_every_measurement_changing_override() {}
#[test] fn competence_gate_threshold_is_95_of_100_and_cannot_round_down() {}
```

```powershell
cargo test -p lab --features cartesian-recoil tactical_competence -- --nocapture
cargo run --release -p lab --features cartesian-recoil -- articulated --competence-gate
```

Run once, in full, with no early stop. If the result is below `95/100`, or any
refusal/rejection is nonzero, record `revise` and stop. Do not change reach, timing,
arc, targeting, solver, threshold or seed set after reading it. Smart104 is authorized
only by a pass.

## D -- pins and complete gates

This is a policy-only behavior change. `ARTICULATED_STREAM_DIGEST` must remain
`0xdbbd86fedd61c4c7`: its fixture calls `stream_digest_command`, never a policy.
`COMBAT_GEOMETRY_HASH`, `CONTACT_BEHAVIOR_DIGEST`, `ARTICULATED_COMMAND_HASH`, legacy
`LAB_HASH`/`ROOM_HASH`, replay codecs, state-hash grammar and every ABI version must
also remain unchanged. No registered pin is budgeted. The competence receipts are
unregistered evidence, not a new golden.

```powershell
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```

Update `docs/performance/smart-ai-tactical-policy.md` with exact pre/post result and
the selected source-41 provenance. Passing authorizes only Smart104's existing-policy
arena default; it does not authorize learning, mechanics retuning or a new hash.

## Stopped competence result

The complete feature command in C ran all 50 canonical and 50 mirrored trials without
an override or early stop. Exact stdout was:

```text
tactical competence: seeds 0..50 x 2 orientations = 100 trials, tick cap 1800, threshold 95/100
body decisions: 0/50 canonical, 0/50 mirrored, 0/100 total
outcomes: 0 fighter, 0 brute, 0 mutual, 26 points, 74 draw
contacts: 484 total, 12 weapon/weapon, 0 weapon/shield, 472 weapon/body
authority: worst body-decision tick 0, 0 refused submissions, 156430 solver-rejected ticks
command receipts: canonical 0x5e7de3dce75ff4ce, mirrored 0x0bc82fd274009158
wall: 181143 ms
revise
```

No stdout log or artifact SHA was retained; none is reconstructed here. The zero
command refusals show that ordinal 3144 reached the ordinary command boundary, while
the rejection count prevents the contact/damage rows from supporting a competence
claim. The schedule remains the predeclared mechanics selection and is not retuned
from this outcome. Smart115's later post-mechanics audit reached only `21/100` strict
and `55/100` outcome-only, so Smart104's generalized default premise remains blocked.
Smart117/118 supersede Smart105 only for a visibly named controlled ordinal-3144
demonstration; they do not promote the ordinary Tactical policy.
