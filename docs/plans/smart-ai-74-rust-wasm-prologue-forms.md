# Smart AI 74 -- decode Rust wasm stack prologues

**Status:** complete. The parser now accepts and validates direct, `local.tee`, and
`local.set/local.get` Rust stack prologues and proves zero only through a decoded
bounded prefix. All five parser tests passed; the declared malformed, mismatched,
hidden and truncated mutations/refusals were red and restored. Smart74 changed only
the parser and its tests--no Rust, mechanics, stack size, artifact, behavior, pin or
corpus.

## A -- exact accepted forms

Edit `tools/wasm_stack_frames.js`. After raw local declarations, decode exactly one
of these initial forms, where `SP` is the same mutable i32 global and `L` the same
local index where repeated:

```text
global.get SP; i32.const N; i32.sub; global.set SP
global.get SP; i32.const N; i32.sub; local.tee L; global.set SP
global.get SP; i32.const N; i32.sub; local.set L; local.get L; global.set SP
```

Opcodes are `0x23`, `0x41`, `0x6b`, direct `0x24`, `local.tee 0x22`, `local.set
0x21`, and `local.get 0x20`. Decode every index as ULEB and `N` as signed LEB. Require
`N >= 0`; return `N` as frame bytes. The tee value remains on the operand stack, so
the tee form intentionally has no inserted `local.get` before `global.set`.

A body not beginning with `global.get` is frame zero only after a bounded decoded
prefix scan (through the first control-flow, call, return, memory write or 32
instructions) proves it contains no stack-global adjustment. If a stack adjustment
appears later, a second one appears, the same-global/same-local laws fail, or an
unknown opcode prevents reaching the boundary, refuse as ambiguous rather than
reporting zero. Do not byte-search: immediates may contain opcode bytes.

Keep the custom `name` section, imported-function offset, section-bound and missing/
duplicate-name checks. Add an optional `--show-prefix` diagnostic which prints the
decoded opcode/index/value sequence for a requested function; it must not weaken
normal refusal.

## B -- fixtures and mutation proof

Extend `tools/wasm_stack_frames.test.js` with valid wasm modules containing all three
forms at `N = 0, 16, 516, 1032, 7248, 88960, 139904, 352176`, including multibyte SP
and local indexes and one imported function before the defined body. Add true-zero
bodies whose bounded prefix reaches a call/control boundary without an SP write.

Refuse these fixtures by name: tee to one local then get another, set/get mismatch,
different get/set globals, negative frame, add instead of subtract, later hidden SP
adjustment, two adjustments, truncated immediate, unknown prefix opcode, absent name
section and imported-index mismatch.

```javascript
test("Rust direct tee and set-get stack prologues decode exact frame bytes", () => {});
test("zero frames require a decoded prefix with no stack adjustment", () => {});
test("mismatched or hidden stack prologues refuse as ambiguous", () => {});
```

Mutate tee handling to skip its local index, decode `N` as unsigned, permit unequal
globals, and restore the old direct-only parser. Each mutation makes a named test red
and is restored.

## C -- real-artifact gate and Smart71 handoff

Run the parser against the unchanged Smart69 artifact. It must decode
`contact::wide_vector_sub` without ambiguity and report its exact nonnegative frame;
it must continue reporting frame zero for the 12 Smart69 borrowed helpers/drivers.
Print artifact path, length and full SHA before both commands. No rebuilt artifact is
accepted as the baseline.

```powershell
node --test tools/wasm_stack_frames.test.js
$wasm=(Resolve-Path 'target/smart69-wasm-tests/wasm32-unknown-unknown/debug/deps/sim-401f47b6d6a19617.wasm')
$wasm.Path; (Get-Item $wasm).Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
node tools/wasm_stack_frames.js $wasm 'contact.*wide_vector_sub'
node tools/wasm_stack_frames.js $wasm 'borrowed_(neg|add|mul|div|cmp|trunc)_driver|unsigned_.*_into|signed_.*_into|multiply_rational_parts_into'
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

Record the exact `wide_vector_sub` frame and all mutations, then stop. Smart71 may
resume against that frozen baseline; Smart74 authorizes no contact conversion.

## Completed frozen-artifact result

The unchanged baseline was:

```text
C:\Users\ostro\IdeaProjects\auto-rpg\target\smart69-wasm-tests\wasm32-unknown-unknown\debug\deps\sim-401f47b6d6a19617.wasm
bytes 29949694
sha256 23DCCA1790316BA7AD73C8A8DCE91084ADF2BA2B8C90DEE208042D449B43C49E
```

`contact::wide_vector_sub` decoded as frame `9328`, body offset `2191458`. The
following 12 Smart69 names remained frame `0`, at their measured offsets:

```text
multiply_rational_parts_into 1697298
unsigned_mul_into            1700268
signed_add_into              1701025
unsigned_div_rem_into        1702176
unsigned_sub_into            1704849
unsigned_shr_into            1705355
borrowed_add_driver          1705751
borrowed_cmp_driver          1705771
borrowed_div_driver          1705996
borrowed_mul_driver          1706085
borrowed_neg_driver          1706114
borrowed_trunc_driver        1706194
```

The exact `9328` frame is Smart71's mandatory before-value; a later artifact-size
change or merely nontrapping run cannot replace it.
