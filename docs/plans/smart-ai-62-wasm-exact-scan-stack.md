# Smart AI 62 -- diagnose feature wasm exact-scan OOB

**Status:** complete on 2026-08-13 by independent wasm reproduction. The OOB is
shadow-stack exhaustion, not indexed heap corruption. Active frames total
`1,107,120` bytes: stream `352,160`, advance `3,568`, `World::step` `324,944`, solve
`183,200`, and scan `243,248`, exceeding the approximately 1 MiB default stack.
Linear memory grew normally. The principal removable frame cost is two inline
`WideSweptAabbPoints`, each holding `[WidePoint;20]` at about 62 KiB, about 124 KiB
together. Smart62 changed no code, behavior or pin; the default stream update remains
deferred. Smart63 owns retained scratch storage.

This measured result supersedes the alternatives below. Raising the global shadow
stack is rejected because it hides future frame growth. Moving the 289,280-byte
publication buffers to a growing heap is rejected because it can detach browser typed
arrays. The bounded repair is exactly two retained `Vec<WidePoint>` buffers, each
reserved to 20 in `ExactWideScratch`; no `Box` or per-call allocation.

## Non-interference and pin rules

Keep every registered constant unchanged, including the deferred default stream pin.
Do not add a feature command or feature stream pin. Do not add an export, frame word,
state column, replay field, runtime diagnostic, allocator call, or fallible scan
operation. Diagnostic builds live in separate target directories and must never be
copied over the normal `target/wasm32-unknown-unknown/release/web.wasm` artifact.

The current checker has no artifact mode. Its hardcoded
`ARTICULATED_COMMAND_HASH=0xd1da6a40df0480b2` is correct for default wasm; feature
Rust deliberately expects the unregistered `0x5fcaba34556b2737`. Therefore the
feature command mismatch is false red noise beside the real OOB. Correct tooling only
by an explicit opt-in feature-probe mode in
[`tools/wasm_check.js`](../../tools/wasm_check.js): default invocation remains byte
for byte strict; feature mode skips registered default command/stream equality and
accepts native feature actuals through environment variables for this run. Do not
hardcode those actuals or call them goldens.

```text
ARPG_WASM_FEATURE_PROBE=1
ARPG_NATIVE_FEATURE_COMMAND=0x5fcaba34556b2737
ARPG_NATIVE_FEATURE_STREAM=0x2d323ac56c901e88
```

Feature mode must still run ABI/layout, buffer bounds, deterministic repeat and all
unaffected registered checks. It compares the supplied transient native values to
wasm and labels them `unregistered feature probe`; missing/malformed variables refuse
the mode. Tests in [`tools/wasm_check.test.js`](../../tools/wasm_check.test.js) must
prove default mode still rejects `0x5fca...`, feature mode requires both inputs, and
no new constant appears in the checker or hash registry.

## A -- minimal deterministic reproduction

Build default and feature artifacts into distinct directories:

```powershell
$env:CARGO_TARGET_DIR='target/smart62-default'
cargo build --release --target wasm32-unknown-unknown -p web
$env:CARGO_TARGET_DIR='target/smart62-feature-1m'
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
Remove-Item Env:CARGO_TARGET_DIR
```

Run default normally. Run feature-probe mode first with a Node test-name filter that
executes command and stream checks, then the entire checker. Capture the full wasm
stack, export under test, first named wasm frame/function index and whether the module
remains callable after the trap. Required reproduction is the same OOB in
`scan_detector_into`; a different first trap stops before a stack hypothesis.

Add a tooling-only test seam that instantiates an explicitly supplied wasm path, so
these artifacts are never selected by renaming/copying. It must call existing exports
only. No simulation source is instrumented.

## B -- distinguish stack capacity from indexed OOB

The stack hypothesis is predeclared because `compute_articulated_stream_digest`
already owns 289,280 bytes of fixed publication arrays beneath the export, while the
feature exact detector adds wide arithmetic frames. Build otherwise identical feature
artifacts with only wasm-ld shadow-stack capacity changed:

```powershell
$env:CARGO_TARGET_DIR='target/smart62-feature-2m'
$env:RUSTFLAGS='-C link-arg=-zstack-size=2097152'
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
$env:CARGO_TARGET_DIR='target/smart62-feature-4m'
$env:RUSTFLAGS='-C link-arg=-zstack-size=4194304'
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
Remove-Item Env:RUSTFLAGS
Remove-Item Env:CARGO_TARGET_DIR
```

For 1, 2 and 4 MiB, run the same feature probe twice and record: trap/pass, command
actual, stream actual, wasm memory pages before/after, and repeat equality. Stack
exhaustion is proven only if increasing stack alone removes the trap and wasm then
equals native feature stream `0x2d323ac56c901e88` on both runs. If all sizes trap at
the same instruction, diagnose indexed memory instead. If the threshold is unstable
or output changes across runs, stop as corruption rather than choosing the largest
stack.

Use the toolchain's wasm disassembler if available (`rustup which llvm-objdump`, then
`-d`/symbol table) to record the stack-pointer subtraction in
`compute_articulated_stream_digest`, `World::resolve_articulated_contacts`, and
`scan_detector_into`. Lack of a disassembler does not authorize guessing: the
capacity experiment plus named stack must still identify a stable threshold.

Add native `#[cfg(test)]` size assertions in
[`crates/sim/src/combat/contact.rs`](../../crates/sim/src/combat/contact.rs) only for
the relevant scratch/value types (`ContactCollectionScratch`, detector input, wide
rational/point/closest and visit trace). These are explanatory controls, not wasm
frame measurements; do not infer wasm stack bytes from native `size_of` alone.

## C -- bounded mutation proof, then stop

If stack is proven, temporarily remove only the 289,280-byte publication arrays from
the stream export's stack in a diagnostic branch or temporarily prevent entry into
the exact detector, one at a time, and show which removal moves the threshold. Revert
both mutations immediately. The exact-detector bypass must change the stream and is
never a candidate fix; it exists only to prove call-depth ownership. Do not heap-box
the publication arrays in production: heap growth can detach browser typed arrays.

If indexed OOB is proven instead, reduce the existing fixture to the first detector
pair/iteration that traps and record the index, slice length and owning function using
test-only native bounds assertions. Do not clamp or skip the index.

Record the diagnosis, threshold/first bad index, stack frames, mutation results and
feature wasm actual if it completes in Smart62 and durable research, then stop. A
successor must predeclare the production fix, browser memory consequences and pin
ownership. Smart62 performs no default pin update and no 7,560-case corpus.

```powershell
node --test tools/wasm_check.test.js
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
cargo test -p sim --features cartesian-recoil
cargo test -p web --features cartesian-recoil
cargo test
git diff --check
```

No server or browser is needed. Remove only the three explicitly named Smart62 target
directories after evidence is recorded; ordinary target artifacts remain untouched.
