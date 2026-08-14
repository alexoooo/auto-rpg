# Smart AI 67 -- borrowed exact-wide rational primitives

**Status:** implementation retained, but acceptance is invalid pending Smart69; frame
evidence was unmeasured and the full sim suite is not claimed. `wide.rs` alone contains
the borrowed/caller-output rational and lower signed/unsigned primitives with eight
work slots. All four focused tests below passed. The zero-divisor mutation made the
matrix red and was restored. No contact caller, geometry, rejection, hash grammar,
ABI, pin, policy, corpus or Arena behavior changed. Smart68 owns release-wasm frame
measurement exposed a source-level violation before it could consume the API:
`checked_div_into` copies slot 7's roughly 516-byte numerator and denominator into
by-value locals before multiplication. Smart69 must correct and audit the whole new
helper family before Smart68 may consume it.

## A -- safe caller-output arithmetic

Keep every existing by-value method as the frozen production oracle. Add a fixed
work contract and borrowed entry points:

```rust
pub(crate) const WIDE_RATIONAL_WORK_SLOTS: usize = 8;

pub(crate) fn checked_neg_into(&self, work: &mut [Self; 8], out: &mut Self) -> bool;
pub(crate) fn checked_add_divisible_into(
    &self, rhs: &Self, work: &mut [Self; 8], out: &mut Self,
) -> bool;
pub(crate) fn checked_mul_into(
    &self, rhs: &Self, work: &mut [Self; 8], out: &mut Self,
) -> bool;
pub(crate) fn checked_div_into(
    &self, rhs: &Self, work: &mut [Self; 8], out: &mut Self,
) -> bool;
pub(crate) fn checked_cmp_into(
    &self, rhs: &Self, work: &mut [Self; 8], out: &mut Ordering,
) -> bool;
pub(crate) fn trunc_i128_into(
    &self, work: &mut [Self; 8], out: &mut i128,
) -> bool;
```

Use named indexes for result stage, negated/reciprocal operand, left and right signed
products, denominator product, quotient, remainder and canonicalization stage. Split
the array into disjoint slices before borrowing fields. Add private borrowed
caller-output operations for `UnsignedWide4096` and `SignedWide4096` wherever an old
by-value add/subtract/multiply/shift/div-rem/conversion would otherwise recreate the
copy. No `_into` implementation may dereference a borrowed wide word merely to call
the old by-value method.

Work slots may be dirty after failure. `out` is atomic: it retains its sentinel value
on every `false`, and receives the result-stage value only after the exact old
operation would return `Some`. The success copy must compile to a direct memory copy,
not a new by-value temporary. Inputs, work and output are disjoint by signature and
borrow construction. Use no unsafe code, allocation, recursion, GCD/reduction,
floating point, wider envelope or changed limb order.

Preserve these laws exactly:

- denominator equality and both divisibility branches precede general addition;
- subtraction is checked negation followed by divisible addition;
- multiplication cancels the same cross powers of two before limb multiplication;
- division refuses zero numerator and constructs the same signed reciprocal;
- comparison forms left then right cross-products and refuses on the same overflow;
- truncation divides toward zero and refuses the same out-of-`i128` result;
- `from_words` canonicalizes zero/sign and binary factors exactly as today.

## B -- exhaustive declared branch matrix and mutations

Add tests beside the type in `wide.rs`. For every operation, run old and new paths on
the Cartesian product of zero, one, minus one, unequal/equal denominators, each
divisibility direction, coprime denominators, negative operands, `i128` boundaries,
limb boundaries 31/32/33 and 4094/4095, maximum successful products and the adjacent
overflow/refusal. Assert exact numerator limbs, denominator limbs, success/refusal,
ordering/truncation and unchanged sentinel output on failure.

```rust
#[test] fn borrowed_wide_rational_primitives_match_every_old_branch_and_refusal() {}
#[test] fn borrowed_wide_rational_outputs_are_atomic_on_every_failure() {}
#[test] fn borrowed_wide_rational_work_is_fixed_and_reusable_without_stale_words() {}
#[test] fn borrowed_wide_rational_primitives_allocate_nothing() {}
```

The allocation claim is structural: the API accepts caller work and `wide.rs` gains
no `Vec`, `Box` or allocator call. Do not install another global allocator.

Mutation proof: reverse the divisible-add branch order, omit cross cancellation,
reverse compare products, round signed division away from zero, commit result stage
before a forced failure, and reuse one quotient slot without clearing its high limb.
Each mutation must make the named equivalence, atomicity or second-call test red and
then be restored.

## C -- native and wasm frame evidence

Add one `#[cfg(test)]`, `#[inline(never)]` unit driver per new primitive. Each driver
receives operands, eight work slots and output by mutable reference; it must not
construct a wide array locally. Run the native unit matrix, then compile the same lib
tests for `wasm32-unknown-unknown` without running them. Use the toolchain
`llvm-objdump`/name section to record each native and wasm driver prologue, sret
parameters and calls. Record artifact paths and full SHA-256 values.

Acceptance requires that the new wasm drivers have no by-value `WideRational4096`
parameter or return/sret slot and no roughly 1032-byte per-call operand/result copy;
their fixed frame must not grow with repeated calls. The native and wasm artifacts
must both retain caller-output signatures. Artifact-size changes alone are not
evidence. If a lower signed/unsigned helper still creates a wide by-value frame,
finish that helper inside this owned file before declaring green; if the safe API
cannot do so, revert and stop.

The wasm lib-test compile passed and selected
`C:\Users\ostro\IdeaProjects\auto-rpg\target\smart67-wasm-tests\wasm32-unknown-unknown\debug\deps\sim-401f47b6d6a19617.wasm`,
size `29938987`, SHA-256
`D30E53DC8CDFA2B24121197D1088996FBE552593A7EC3E52A14D4225B5312BDA`.
`llvm-objdump` was unavailable, so no native or wasm prologue claim was made. A green
compile is not frame evidence; Smart68 must measure the release consumer chain with
a dependency-free parser before accepting the geometry workspace.

Smart67 predicted zero golden movement because no production caller changed. Do not
run or re-record browser hashes, change default stack size, resume Smart66 geometry,
run the full behavior suite, or start the 7,560-case corpus.

```powershell
cargo test -p sim borrowed_wide_rational --features cartesian-recoil -- --nocapture
cargo test -p sim --lib --features cartesian-recoil
$objdump=(rustup which llvm-objdump)
$native=(Get-ChildItem 'target/debug/deps/sim-*.exe' | Sort-Object LastWriteTimeUtc | Select-Object -Last 1)
$native.FullName; $native.Length; (Get-FileHash -Algorithm SHA256 $native).Hash
& $objdump -d $native.FullName
$env:CARGO_TARGET_DIR='target/smart67-wasm-tests'
cargo test -p sim --lib --target wasm32-unknown-unknown --features cartesian-recoil --no-run
$wasm=(Get-ChildItem 'target/smart67-wasm-tests/wasm32-unknown-unknown/debug/deps/sim-*.wasm' | Sort-Object LastWriteTimeUtc | Select-Object -Last 1)
$wasm.FullName; $wasm.Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
& $objdump -d $wasm.FullName
Remove-Item Env:CARGO_TARGET_DIR
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

The implementation record must include the exact wasm test artifact selected rather
than trusting `Select-Object` silently: print its absolute path, length and full hash
before disassembly. No server or browser is needed.
