# Smart AI 119 -- diagnose the feature-wasm owner-validation stack

**Status:** complete. The current release stack is only 368 bytes over wasm's
1,048,576-byte stack: measured active frames total 1,048,944. The dominant avoidable
pair is lifted `trial` calling the by-value `apply_exact_group`; the already-landed
caller-output `apply_exact_group_into` predicts 936,608 active bytes and 111,968 bytes
of headroom. Smart120 owns that retained-scratch conversion. No diagnostic experiment,
production edit, pin or UI change survived Smart119.

## A -- immutable reproduction

Use only this already-built control first:

```text
target/smart116-feature-wasm/wasm32-unknown-unknown/release/web.wasm
bytes  1042367
sha256 25AFCA90C385F47FC701D9F47B8886E97122C02BFB67D38D177E764E14D8E1A3
```

Run [`tools/wasm_check.js`](../../tools/wasm_check.js) with both
`ARPG_WASM_PATH` and `ARPG_CARTESIAN_RECOIL=1`. Freeze the exact test ordinal/name,
expected/actual command words and whether the runner continues after the mismatch.
That mismatch is evidence of a stale default expectation until independently proved
otherwise; do not update it in this session. In a separate fresh instance, reproduce
the out-of-bounds trap and retain the complete JavaScript/wasm call stack, page counts
before the first call, after growth and at failure, and whether a second instance
fails at the same operation.

The currently named tail is:

```text
trajectory::validate_owner
trajectory::advance_exact_into
ExactKinematics::finish
solve_exact_contact_tick
World::step_with_arm_rates
compute_articulated_stream_digest
```

Confirm every name and ordering from the real artifact. Do not substitute a wasm unit
test or the earlier default artifact for this reproduction.

## B -- current release-frame ledger

Use [`tools/wasm_stack_frames.js`](../../tools/wasm_stack_frames.js) on the frozen
artifact. Record function offset and decoded frame for every member of the active
chain above, plus:

```text
validate_affine, validate_coordinate, owner_mass
advance_affine, normalize_position, normalize_momentum
ExactKinematics::finish/apply, resolution group solve and scan callers
the web digest driver and every non-inlined wrapper between named frames
```

Inspect [`crates/sim/src/combat/trajectory.rs`](../../crates/sim/src/combat/trajectory.rs)
and account separately for the 720-byte `ExactOwnerTrajectory` passed by value to
`validate_owner`, the `*owner` argument copies, `let mut next = *owner`, return ABI
slots and caller backups. A sum of decoded prologues is not enough: identify which
frames are simultaneously live at the trap and include caller-owned argument/result
areas. The wasm stack is 1,048,576 bytes. Passing headroom is at least 65,536 bytes,
so the proven deepest active total must be at most 983,040.

Extend only the parser's tests if a current prologue is undecodable. Fixtures must
cover the exact opcode form, imported-function offset, missing/duplicate name and
truncated/ambiguous prologue mutations. Parser work changes no Rust or wasm.

```powershell
node --test tools/wasm_stack_frames.test.js
node tools/wasm_stack_frames.js target/smart116-feature-wasm/wasm32-unknown-unknown/release/web.wasm "validate_owner|advance_exact_into|finish|solve_exact_contact_tick|step_with_arm_rates|compute_articulated_stream_digest"
```

## C -- bounded diagnostic experiments

After the baseline is frozen, use temporary branches one at a time:

1. Change only `validate_owner(ExactOwnerTrajectory)` and `owner_mass` to borrowed
   inputs, leaving every validation, ordering and refusal word unchanged. Measure the
   named callee and all callers; prove direct default/feature native equivalence on
   valid and every refusal fixture.
2. If the trap remains, remove only `advance_exact_into`'s local `next` aggregate by
   writing one already-reserved output slot field-atomically and committing its length
   only after validation. Preserve output-unchanged-on-error and capacity/pointer
   stability. Measure again.
3. If neither independently supplies 64 KiB headroom, stop with the measured residual
   owner/caller copy and name the next dominant frame. Do not stack speculative edits.

For each experiment build a fresh feature wasm to a separate target directory, record
bytes/SHA, parser frames, runtime pages and exact first failure. Require byte-for-byte
native result/refusal equivalence and make mutations red by restoring one by-value
call, retaining a dirty output on refusal and skipping one validation. Revert all Rust
and generated artifacts after measurement.

```powershell
cargo test -p sim --features cartesian-recoil advance_exact_into -- --nocapture
cargo test -p sim --features cartesian-recoil exact_trajectory -- --nocapture
$env:CARGO_TARGET_DIR='target/smart119-feature-wasm'
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
$env:ARPG_WASM_PATH='target/smart119-feature-wasm/wasm32-unknown-unknown/release/web.wasm'
$env:ARPG_CARTESIAN_RECOIL='1'
node --test tools/wasm_check.js
Remove-Item Env:ARPG_CARTESIAN_RECOIL
Remove-Item Env:ARPG_WASM_PATH
Remove-Item Env:CARGO_TARGET_DIR
```

## D -- stop boundary

Stop with the exact active ledger, avoidable-copy owner, experiment deltas and the
smallest directly landable successor recommendation. Restore every temporary Rust
edit. Do not update the command expectation, register or move a digest, weaken owner
validation, raise the wasm stack, change capacity, land a fix, run competence, or
touch Smart117/UI.

Expected registered pin movement is zero because no production change survives.

```powershell
node tools/check_docs.js
git diff --check
```

## Completed ledger and audit

```text
compute_articulated_stream_digest     359328
Sim::advance                            3568
World::step                               16
World::step_with_arm_rates            108224
resolve_contact                       110992
solve_exact_contact_tick                 464
ExactKinematics::resolve_group          6672
solve_lifted_group                    177216
trial                                 169616
apply_exact_group                     112640
validate_exact_rows                        0
validate_owner                           208
active total                         1048944
wasm stack                           1048576
overrun                                  368
```

This is Smart116's 1,042,367-byte feature artifact, receipt
`25AFCA...D8E1A3`; no separate full Smart119 SHA or log was supplied. The command
failure is independent: actual feature witness `0x5fcaba34556b2737` was compared with
default expectation `0xd1da6a40df0480b2`. That expected-value noise appears after
five of 23 checks and must not be repinned; later failures cascade from the real
stream trap.

`apply_exact_group_into` measures 304 bytes. Replacing only the lifted trial's
by-value outcome with that caller-output path predicts:

```text
1048944 - 112640 + 304 = 936608 active bytes
1048576 - 936608 = 111968 bytes headroom
```

The conversion must retain both trajectory work and a distinct accepted-owner stage
in `LiftedSolverScratch`; a local result or alias with the next trial would recreate
the caller-frame and atomicity defect.
