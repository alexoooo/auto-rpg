# Smart AI 116 -- land the independently proven mechanics repairs

**Status:** stopped at the fresh feature-wasm runtime gate. The audited stale Lab,
policy, sim-locomotion and web high-water fixtures were corrected test-only; complete
default and feature workspaces are now green. Default wasm passed all 28 checks. The
first genuinely fresh feature artifact instead reaches a stale command-witness
expectation and then traps out of bounds in the `validate_owner` advancement chain.
An earlier claimed feature-wasm pass used the default artifact and is invalid. Hold
all digest, pin, Smart117 and UI work for Smart119's stack diagnosis.

## A -- exact owned behavior

Complete the held edits in
[`crates/sim/src/combat/trajectory.rs`](../../crates/sim/src/combat/trajectory.rs),
[`crates/sim/src/combat/wide.rs`](../../crates/sim/src/combat/wide.rs),
[`crates/sim/src/combat/contact.rs`](../../crates/sim/src/combat/contact.rs), and
[`crates/sim/src/world.rs`](../../crates/sim/src/world.rs). The four changes are:

1. After clipped-wall reconciliation changes an integral velocity quotient,
   canonicalize the common-response momentum quotient/remainder without changing
   `velocity_raw * scale + remainder`.
2. After exact advancement changes a position quotient/remainder, canonicalize it by
   the same rational-identity law before strict trajectory validation.
3. Compare positive exact rational margins by the bounded continued-fraction order,
   preserving strict `Less/Equal/Greater` semantics without forming the overflowing
   4201-bit cross-products.
4. In only the SegmentBody `step=0`, adjacent-separated, swept-AABB-overlap branch,
   use the retained eight-corner swept separating-axis certificate. A certified
   interval continues at `t+1`; budget exhaustion remains
   `UnsupportedSubRawInterval`. Do not widen an envelope, invent a root or publish a
   rational interior time.

Preserve the frozen certificate caps exactly: depth 17, eight corners, eight endpoint
axes, four optional segment-cross axes and 32 nodes. Reuse retained caller-output
storage; no per-call `Box`, local wide aggregate, recursion without a fixed bound or
fallible live diagnostic is authorized.

## B -- missing production tests and mutations

Promote the diagnostic fixtures into production-boundary tests rather than leaving
only helper tests:

```rust
#[test] fn wall_reconciliation_normalizes_common_momentum_without_changing_its_rational_value() {}
#[test] fn world_finish_normalizes_each_advanced_owner_position_before_preflight() {}
#[test] fn positive_rational_order_matches_products_and_handles_the_4201_bit_margin() {}
#[test] fn segment_body_scan_uses_a_complete_certificate_only_after_zero_advance() {}
#[test] fn unresolved_swept_separation_keeps_the_original_unsupported_refusal() {}
#[test] fn retained_certificate_work_is_bounded_stable_and_clone_safe() {}
```

The World tests must drive the actual commit/advance call sites, including Smart110's
sign-opposed momentum words and Smart113's noncanonical proposed X position; helper-
only equality is insufficient. Certificate controls cover canonical and mirrored
Smart108 witnesses, stationary separation, tangency/crossing refusal, all eight
corners, node exhaustion and exact capacity/pointer stability across two calls and a
clone. Make tests red independently by retaining the old remainder, skipping
position normalization, restoring cross multiplication, accepting one certified
child, omitting the eighth corner and converting budget exhaustion to success.
Restore each mutation.

```powershell
cargo test -p sim trajectory::tests --features cartesian-recoil -- --nocapture
cargo test -p sim positive_rational_compare --features cartesian-recoil -- --nocapture
cargo test -p sim smart108 --features cartesian-recoil -- --nocapture
cargo test -p sim segment_body_scan_uses --features cartesian-recoil -- --nocapture
cargo test -p sim retained_certificate_work --features cartesian-recoil -- --nocapture
```

## C -- full target and stack gates

Run every default and feature test before measuring a receipt. Build fresh default and
feature wasm artifacts; parse named release frames with
[`tools/wasm_stack_frames.js`](../../tools/wasm_stack_frames.js), and run the feature
digest twice in each of two fresh wasm instances. The second call must not grow
memory. Native and wasm feature receipts must agree exactly.

```powershell
cargo test
cargo test --workspace --features cartesian-recoil
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
$env:CARGO_TARGET_DIR='target/smart116-feature-wasm'
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
$env:ARPG_WASM_PATH='target/smart116-feature-wasm/wasm32-unknown-unknown/release/web.wasm'
$env:ARPG_CARTESIAN_RECOIL='1'
node --test tools/wasm_check.js
Remove-Item Env:ARPG_CARTESIAN_RECOIL
Remove-Item Env:ARPG_WASM_PATH
Remove-Item Env:CARGO_TARGET_DIR
node --test tools/wasm_stack_frames.test.js
node tools/check_docs.js
git diff --check
```

No registered pin is budgeted: default mechanics cannot reach the feature branch.
`ARTICULATED_STREAM_DIGEST = 0xdbbd86fedd61c4c7`, geometry
`0x9d15344883cf6e9c`, contact behavior `0x587b0259e877105a`, its 3,548 bytes, legacy
hashes, replay/state grammar and every ABI version must remain unchanged. The feature
native/wasm value is a receipt, not a new pin. Any default movement, target
disagreement, stack overflow, second-call growth, unresolved mutation or full-suite
failure stops this session. Passing authorizes only Smart117's controlled demo.

## Stopped gate receipt

The complete default command in C is retained as `target/smart116-default.log`,
113,717 bytes, SHA-256
`D3B2CB2142A924969B23D97C6E8113203621EE55562076D1BEC9BE2DF5E25959`.
It is green across the workspace, including policy `138/138`, sim
`560 passed / 0 failed / 1 ignored`, determinism `10/10`, and web
`124 passed / 0 failed / 4 ignored`.

The feature command stopped in Lab. Its retained log
`target/smart116-feature.log` is 35,992 bytes with SHA-256
`93E842880F65F26E21C4A9A3ABB34A684B313AEBA56F5FD855EF171DF1C7D1A6` and the exact
Lab summary is `88 passed; 10 failed; 5 ignored` in 189.79 seconds. The failures are:

```text
smart103_first_moving_rejection_names_seed_mirror_tick_and_phase
smart103_first_rejection_is_independent_of_thread_completion_order
smart103_policy_stage_geometry_is_the_single_offered_command
smart103_provenance_capture_does_not_step_scan_solve_or_decide_twice
smart103_rejection_key_names_its_group_pair_and_primitive_or_is_explicitly_none
smart106_canonical_segment_body_names_its_first_root_progress_failure
smart106_mirrored_segment_body_names_its_first_root_progress_failure
smart106_segment_body_progress_maps_regions_and_rationals_under_reflection
smart106_segment_body_progress_replays_the_production_cause_branch
zero_created_energy_excess_and_intentional_refusals_are_separate_evidence
```

The first nine unwrap an absent historical diagnostic after the certificate advances
past that refusal. The last reports the composed feature control's exact actual
`(19, Some(ExactUnsupportedSweep))` against stale expected `(0, None)`. This session
authorizes no silent deletion or production change: audit each assertion against its
original evidence purpose, make the test-only correction fail under the old behavior,
then rerun the complete feature workspace. Wasm remains deliberately unbuilt.

## Current green workspace and wasm stop

The stale diagnostic/control audit was completed test-only. The final default log is
`target/smart116-default-final.log`, 113,717 bytes, SHA-256
`7EDBC8D60D167AA0008146F40662217B9B13154BB5DC6F34F56246DD4D20F32A`.
The final feature log is `target/smart116-feature-final3.log`, 124,051 bytes,
SHA-256 `24C423C0124AE3747F1E6F62AC7769B1523CFBFCC501E05533DC808C7E6B41EE`.
It is green across the workspace: Lab `91/91` with five ignored, policy `138/138`,
sim `705 passed / 0 failed / 3 ignored`, determinism `10/10`, and web
`124 passed / 0 failed / 4 ignored`. The default wasm checker passed `28/28`.

The fresh feature build is
`target/smart116-feature-wasm/wasm32-unknown-unknown/release/web.wasm`, 1,042,367
bytes, SHA-256
`25AFCA90C385F47FC701D9F47B8886E97122C02BFB67D38D177E764E14D8E1A3`. The checker
completed five of its 23 feature checks before reporting that the command witness no
longer equals its default expected value; no replacement literal is inferred or
authorized. Continuing the actual feature execution traps out of bounds through
`validate_owner` in the exact owner-advancement path. This is the first valid feature
artifact result. The earlier green run pointed the checker at a default artifact and
is explicitly discarded. No feature digest, stack headroom, pin or Arena result was
accepted. Smart119 owns diagnosis only.
