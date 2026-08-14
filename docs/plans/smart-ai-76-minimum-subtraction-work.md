# Smart AI 76 -- measure minimum borrowed subtraction work

**Status:** stopped and fully reverted. Semantics passed, but the claimed minimum-work
proof was false: the prototype delegated to Smart75's fixed-eight API, so construction
failures for `K=2..7` proved only its adapter shape, not subtraction liveness. The
valid frame comparison remains useful: production and local-K8 were both `9328`,
while caller-retained-K8 was `0`; the delegated compact helper was `1040`. No
prototype, production contact path, scratch layout, behavior, pin or corpus survives.

## A -- subtraction-specific liveness prototype

Edit `crates/sim/src/combat/wide.rs` under `#[cfg(test)]` only. Add a
`borrowed_sub_compact_into` prototype which implements exactly
`a.checked_add_divisible(b.checked_neg()?)` with borrowed lower signed/unsigned
helpers and caller output. It accepts `&mut [WideRational4096]`, uses named indexes,
and returns a distinct `WorkCapacity` diagnostic when the slice is too short; that
diagnostic never enters `ExactScanReject` or production.

Audit and record maximum simultaneously live slots separately for:

```text
equal denominator
left denominator divisible by right
right denominator divisible by left
general cross-product fallback
canonical zero/nonzero stage and atomic commit
```

Try exact bounds `2`, `3`, `4`, then only as needed through `8`. The accepted minimum
is the smallest `K` for which every old success/refusal and word is reproduced and
`K-1` reaches `WorkCapacity` on a named otherwise-successful fixture. Phase reuse is
allowed only after the prior value's last read; document the slot timeline. Do not
narrow the input grammar to equal denominators, special-case contact fixtures, add a
GCD, change branch order, or treat capacity as arithmetic refusal.

Tests cover Smart75's full branch table, dirty second-call work, 31/32/33 and
4094/4095 limb boundaries, exact old envelope refusals, cancellation to `0/1`,
nonzero binary canonicalization and sentinel output unchanged on refusal/capacity.

```rust
#[test] fn compact_borrowed_subtraction_matches_every_old_word_and_refusal() {}
#[test] fn compact_borrowed_subtraction_proves_its_smallest_work_bound() {}
#[test] fn compact_borrowed_subtraction_is_atomic_with_dirty_reused_work() {}
```

Mutation proof: lower `K` by one, reuse a still-live division slot, omit canonical
zero, and commit before a forced refusal. Each named test goes red, then restore.

## B -- local versus retained seam, same operation

In `crates/sim/src/combat/contact.rs`, add only `#[cfg(test)] #[inline(never)]` wasm
drivers around the same compact function:

```rust
fn compact_sub_local_driver(a: &WidePoint, b: &WidePoint,
    out: &mut [WideRational4096; 3]) -> Result<(), PrototypeReject>;
fn compact_sub_retained_driver(a: &WidePoint, b: &WidePoint,
    work: &mut [WideRational4096], out: &mut [WideRational4096; 3])
    -> Result<(), PrototypeReject>;
```

The local driver declares exactly `[WideRational4096; K]` once and reuses it for
three axes. The retained driver receives the same `K` slots from its caller; the wasm
test harness allocates/fills them outside the inline-never driver. Both use identical
operands, compact helper and output, and both are compared to production
`wide_vector_sub`. Add no production field or `Vec` yet.

Compile one lib-test artifact containing both drivers. Smart74's parser records their
frames and `wide_vector_sub` in the same artifact. Acceptance for a viable local seam
is a local driver strictly below the frozen `9328`; acceptance for the retained seam
is a retained driver strictly below both `9328` and the local driver, with no hidden
frame in the compact helper. Frame zero is desirable but not assumed. If neither is
below `9328`, stop and reconsider the lower wide-word API rather than adding storage.

Mutation proof for measurement: temporarily move the retained work array inside its
driver and require its frame to equal/grow toward the local variant; restore it. A
value-only pass is not frame evidence.

## C -- artifact record and successor decision

Run focused native semantics, compile wasm lib tests, and print the artifact absolute
path, size and full SHA-256. Parse the compact helper, local driver, retained driver,
and production baseline. Record `K`, exact slot timeline, every frame and signed delta.

```powershell
cargo test -p sim compact_borrowed_subtraction --features cartesian-recoil -- --nocapture
$env:CARGO_TARGET_DIR='target/smart76-wasm-tests'
cargo test -p sim --lib --target wasm32-unknown-unknown --features cartesian-recoil --no-run
$wasm=(Get-ChildItem 'target/smart76-wasm-tests/wasm32-unknown-unknown/debug/deps/sim-*.wasm' | Sort-Object LastWriteTimeUtc | Select-Object -Last 1)
$wasm.FullName; $wasm.Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
node tools/wasm_stack_frames.js $wasm 'compact_borrowed_subtraction|compact_sub_(local|retained)_driver|contact.*wide_vector_sub'
Remove-Item Env:CARGO_TARGET_DIR
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

Then stop. If retained wins, the new dependency order is: land the smallest consumed
retained scalar seam first; convert scalar families against it; convert caller-output
points/vectors/candidates; finally expand only the measured remaining workspace and
run the full headroom/digest gate. Smart71/72/73 are not resumed as written. If local
wins below `9328`, author a replacement scalar checkpoint with exact `K`; do not
silently amend Smart71 post-measurement. No release digest, pin or corpus is authorized.

## Stopped artifact record

```text
C:\Users\ostro\IdeaProjects\auto-rpg\target\smart76-wasm-tests\wasm32-unknown-unknown\debug\deps\sim-401f47b6d6a19617.wasm
bytes 30011202
sha256 829834D52D833D3CD3EB52D47FEDA3CA36827838403C5D51EB360A996494C7CF
production wide_vector_sub       9328
compact_sub_local_driver K=8    9328   delta 0
compact_sub_retained_driver K=8    0   delta -9328
delegated compact helper        1040
```

The equality/refusal tests were green, but they do not rescue the invalid `K`
derivation. Smart77 conservatively accepts only the demonstrated eight-slot retained
architecture; it does not claim eight is minimal.
