# Smart AI 75 -- canonicalize borrowed exact-wide addition

**Status:** complete. `checked_add_divisible_into` now canonicalizes equal-denominator
and both divisibility fast branches before atomic commit. The two new branch/word
tests and the existing borrowed rational suite passed. Removing the fast-branch
canonicalization made the named `0/1`/nonzero rows red and was restored. No contact
code, mathematical value, rejection, ABI, hash, pin or corpus changed.

## A -- canonicalize every successful fast branch

In `WideRational4096::checked_add_divisible_into`, canonicalize the staged result
before committing `out` in all success branches:

```text
equal denominator
self.denominator divisible by rhs.denominator
rhs.denominator divisible by self.denominator
general cross-product fallback (already canonicalized)
```

For equal denominators, write the signed sum and denominator into slot 0, call
`canonicalize_rational_slot` with a disjoint scratch slot, propagate `false`, then
copy slot 0 to `out`. For each divisibility direction, do the same to the quotient/
sum stage before commit. Do not special-case only cancellation: the old path calls
`from_words`, which also removes shared binary factors from every nonzero sum.
Preserve branch order, divisibility-only scaling, limb operations, envelope refusal
and unchanged-output atomicity.

Canonical zero is exactly a nonnegative zero numerator with denominator
`UnsignedWide4096::ONE`; write those fields directly inside
`canonicalize_rational_slot`, as Smart69 requires. Do not call a by-value zero
constructor, add a GCD, enlarge eight-slot work, or alter old oracle methods.

## B -- branch-complete word equivalence and mutations

Extend the borrowed rational tests with this named table:

```text
equal:       -7/3 + 7/3 = 0/1; 1/3 + 1/3 = 2/3; 1/4 + 1/4 = 1/2
left scale:  -21/9 + 7/3 = 0/1; 1/9 + 1/3 = 4/9
right scale: 7/3 + -21/9 = 0/1; 1/3 + 1/9 = 4/9
fallback:    1/3 + 1/5 = 8/15; -1/3 + 1/5 = -2/15
```

Add adjacent 31/32/33 and 4094/4095 limb fixtures, maximum successful nonzero sums,
the exact old-path envelope refusals, nonzero binary-factor reductions, dirty scratch
on a second call, and sentinel output unchanged on failure. Compare numerator sign,
all numerator/denominator limbs, used counts and boolean/result, not merely value.

```rust
#[test] fn borrowed_add_canonicalizes_zero_and_nonzero_in_every_branch() {}
#[test] fn borrowed_add_matches_old_words_refusals_and_atomic_output() {}
```

Mutation proof: omit canonicalization separately from equal, left-divisible and
right-divisible branches; each makes its named row red. Preserve a cancelled
denominator instead of writing canonical `0/1` and require the zero rows red. Restore
all mutations. Do not resurrect Smart71's removed invalid overflow fixture; a refusal
row must first be shown to refuse on the old method.

## C -- parser/frame gate and Smart71 handoff

Run all borrowed rational tests, compile a fresh wasm lib-test artifact, print path,
size and full SHA-256, then run Smart74's parser. `borrowed_add_driver`,
`checked_add_divisible_into` if retained as a name, `canonicalize_rational_slot`, and
the lower signed/unsigned helpers must each measure frame zero. The other five
borrowed drivers and previously matched lower helpers remain frame zero. Any nonzero
frame, word/refusal difference or pin movement stops and reverts Smart75.

```powershell
cargo test -p sim borrowed_add --features cartesian-recoil -- --nocapture
cargo test -p sim borrowed_wide_rational --features cartesian-recoil -- --nocapture
$env:CARGO_TARGET_DIR='target/smart75-wasm-tests'
cargo test -p sim --lib --target wasm32-unknown-unknown --features cartesian-recoil --no-run
$wasm=(Get-ChildItem 'target/smart75-wasm-tests/wasm32-unknown-unknown/debug/deps/sim-*.wasm' | Sort-Object LastWriteTimeUtc | Select-Object -Last 1)
$wasm.FullName; $wasm.Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
node tools/wasm_stack_frames.js $wasm 'borrowed_(neg|add|mul|div|cmp|trunc)_driver|checked_add_divisible_into|canonicalize_rational_slot|unsigned_.*_into|signed_.*_into|multiply_rational_parts_into'
Remove-Item Env:CARGO_TARGET_DIR
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

On green, record exact words, mutations, artifact and frames, then stop. Smart71 may
resume from its unchanged `wide_vector_sub=9328` baseline. No release feature digest,
pin work or corpus is authorized.

## Completed artifact and frame result

The wasm lib-test artifact was:

```text
C:\Users\ostro\IdeaProjects\auto-rpg\target\smart75-wasm-tests\wasm32-unknown-unknown\debug\deps\sim-401f47b6d6a19617.wasm
bytes 29968552
sha256 6A53736B360F13BF76D7C28A95341A7929DB925CBB75E9E63F13652425702C5A
```

Every requested borrowed primitive remained frame `0`: multiply-parts,
`checked_add_divisible_into`, unsigned divide/subtract/multiply/shift, signed add,
`canonicalize_rational_slot`, and all six borrowed drivers. The production oracle
baseline `contact::wide_vector_sub` remained frame `9328` (body offset `2196213`).
Smart71 must use this Smart75 artifact and exact row as its new before-value.
