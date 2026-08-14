# Smart AI 69 -- prove borrowed exact-wide frames

**Status:** complete. `checked_div_into` now borrows slot 7's reciprocal directly,
the borrowed helper audit found no remaining aggregate local/return, canonical zero
is written by fields, and canonicalization failure propagates before commit. The
focused rational and division tests passed. Restoring the reciprocal aggregate-local
shape made the frame gate red and was reverted. No contact or World code, behavior,
rejection, ABI, hash grammar, pin, policy, corpus or Arena path changed.

## A -- remove every aggregate local from the borrowed path

Edit `crates/sim/src/combat/wide.rs`. Split `checked_div_into`'s work array at slot 7:
slot 7 remains the reciprocal; slots `0..7` are multiplication work. Change
`multiply_rational_parts_into` to accept exactly a borrowed seven-slot array/view so
it can receive `&work[7].numerator` and `&work[7].denominator` directly while mutating
only disjoint slots `0..7`. Delete these two locals and do not replace them with a
tuple, copied wrapper or returned aggregate:

```rust
let reciprocal_num = work[7].numerator;
let reciprocal_den = work[7].denominator;
```

Audit every function added by Smart67:

```text
unsigned_add_into       unsigned_sub_into       unsigned_mul_into
unsigned_shr_into       unsigned_shl_into       unsigned_div_rem_into
signed_from_parts_into  signed_neg_into         signed_add_into
signed_mul_into         canonicalize_rational_slot
unsigned_to_u128_ref    multiply_rational_parts_into
checked_neg_into        checked_add_divisible_into
checked_mul_into        checked_div_into         checked_cmp_into
trunc_i128_into
```

Wide operands must enter by reference; wide results and intermediate signed/unsigned
words must be written into caller slots. Scalar locals (`bool`, indexes, shifts,
`u64`, `u128`, `i128`, `Ordering` and references) are allowed. Wide aggregate locals,
tuples/arrays returned by value, destructuring a wide field by value, and calling the
old by-value methods are forbidden. Replace `result[0] = WideRational4096::zero()` in
the borrowed canonicalization path with direct zero numerator/one denominator field
writes so the constructor cannot reintroduce an aggregate return. Direct field-to-slot
copies and final stage-to-`out` commits are allowed only if the wasm frame measurement
shows memory copies without a wide stack temporary.

Also repair the ignored `canonicalize_rational_slot(result, tail)` boolean in
`checked_add_divisible_into`: return `false` before committing `out` when
canonicalization fails. This is required refusal propagation, not permission to alter
which input reaches canonicalization or to add a new refusal.

Keep eight public work slots, all old by-value oracle methods, limb order,
cross-cancellation, divisibility order, toward-zero truncation, envelope refusal and
atomic unchanged output exactly. Smart69 does not tune arithmetic or enlarge storage.

## B -- equivalence, atomicity and mutations

Retain Smart67's four tests and add a division fixture whose reciprocal occupies slot
7 while slots `0..7` contain nonzero stale high limbs. Compare old/new exact words and
refusal, run twice, and assert input, reciprocal and sentinel output ownership. Cover
zero divisor, positive/negative denominator reciprocal sign, maximum successful
cross-cancellation and adjacent overflow.

```rust
#[test] fn borrowed_division_keeps_reciprocal_in_slot_seven_without_aggregate_copies() {}
#[test] fn every_borrowed_wide_primitive_preserves_atomic_outputs_and_reusable_work() {}
```

Mutation proof: restore either old reciprocal local, route multiply through a by-value
oracle method, replace direct canonical zero writes with `WideRational4096::zero()`,
and alias slot 7 with multiplication work. The value mutations must make the focused
tests red where semantics change; the value-neutral aggregate-local mutations must
make the wasm frame gate red. Restore every mutation.

## C -- dependency-free wasm opcode/prologue parser

Add `tools/wasm_stack_frames.js` and `tools/wasm_stack_frames.test.js`; add no package.
The parser first constructs `WebAssembly.Module(bytes)` and requires exactly one
`WebAssembly.Module.customSections(module, "name")` payload for the function-name
subsection. It separately decodes the raw wasm bytes' signed/unsigned LEB128 section
lengths and import/function/code sections. It maps imported-function offsets to code
bodies, skips raw-code local declarations, and recognizes only the initial
`global.get`, signed `i32.const`, `i32.sub`, `global.set` stack-pointer adjustment.
For requested name regexes it prints `function<TAB>frame_bytes<TAB>body_offset` in
function-index order. It refuses truncated LEBs, section overruns, duplicate or
missing names, ambiguous prologues and unmatched requests.

Unit fixtures construct minimal wasm bytes with a real custom `name` section for zero,
single-byte and multi-byte frame constants `516`, `1032`, `7248`, `88960` and
`139904`, with an imported function that shifts defined indexes. Mutations decoding
signed LEB as unsigned, ignoring imported indexes, scanning an arbitrary later
`i32.const/sub` pair, or removing the name section must make tests red.

Build a fresh release feature web artifact so the borrowed unit drivers are retained
only if reachable; also compile the wasm lib-test artifact containing all six
`#[inline(never)]` Smart67 drivers. Print absolute paths, sizes and full SHA-256.
Parse the six drivers and all lower helpers above. Acceptance requires no roughly
516/1032-byte operand/result local in any borrowed helper, no by-value sret edge, and
a strictly smaller `checked_div_into`/multiply chain than the pre-correction artifact.
Record every frame; a successful compile or smaller file is not evidence.

If names are optimized out of release web, the named wasm lib-test artifact is the
primitive gate; release web remains only a compile control until Smart68 makes the
helpers reachable from production geometry. If the parser cannot prove a helper,
any frame still owns a wide aggregate local, a value differs, or any pin moves, revert
and stop. On green, stop before Smart68 contact edits or any corpus.

```powershell
cargo test -p sim borrowed_wide_rational --features cartesian-recoil -- --nocapture
cargo test -p sim borrowed_division_keeps_reciprocal --features cartesian-recoil -- --nocapture
node --test tools/wasm_stack_frames.test.js
$env:CARGO_TARGET_DIR='target/smart69-wasm-tests'
cargo test -p sim --lib --target wasm32-unknown-unknown --features cartesian-recoil --no-run
$testWasm=(Get-ChildItem 'target/smart69-wasm-tests/wasm32-unknown-unknown/debug/deps/sim-*.wasm' | Sort-Object LastWriteTimeUtc | Select-Object -Last 1)
$testWasm.FullName; $testWasm.Length; (Get-FileHash -Algorithm SHA256 $testWasm).Hash
node tools/wasm_stack_frames.js $testWasm 'borrowed_(neg|add|mul|div|cmp|trunc)_driver|unsigned_.*_into|signed_.*_into|multiply_rational_parts_into'
Remove-Item Env:CARGO_TARGET_DIR
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
$webWasm=(Resolve-Path 'target/wasm32-unknown-unknown/release/web.wasm')
$webWasm.Path; (Get-Item $webWasm).Length; (Get-FileHash -Algorithm SHA256 $webWasm).Hash
cargo build --release --target wasm32-unknown-unknown -p web
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

No server or browser is needed. The ordinary non-feature build restores the artifact
after the feature compile control and is not a Smart69 behavior measurement.

## Completed evidence

The two dependency-free parser tests passed, including declared signed/unsigned LEB
frames and truncated input refusal. The wasm lib-test artifact was:

```text
C:\Users\ostro\IdeaProjects\auto-rpg\target\smart69-wasm-tests\wasm32-unknown-unknown\debug\deps\sim-401f47b6d6a19617.wasm
bytes 29949694
sha256 23DCCA1790316BA7AD73C8A8DCE91084ADF2BA2B8C90DEE208042D449B43C49E
```

The parser measured frame `0` for every matched retained primitive and driver:

```text
multiply_rational_parts_into
unsigned_mul_into
signed_add_into
unsigned_div_rem_into
unsigned_sub_into
unsigned_shr_into
borrowed_add_driver
borrowed_cmp_driver
borrowed_div_driver
borrowed_mul_driver
borrowed_neg_driver
borrowed_trunc_driver
```

The release feature web compile also passed and produced the ordinary artifact-path
file `target/wasm32-unknown-unknown/release/web.wasm`, `965792` bytes, SHA-256
`F2995D778AD5E7EC229B0F0CE9683850A7A2F186F89C793DCFB7F5472E906957`.
This was a compile control, not a feature digest run or a default-artifact claim.
Smart69 therefore stops green at its boundary and hands the proven API/parser to
Smart70.
