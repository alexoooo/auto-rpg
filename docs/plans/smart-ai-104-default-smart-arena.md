# Smart AI 104 -- make the validated tactical fighter the Arena default

**Status:** blocked and superseded as a roadmap premise. Smart115's post-mechanics
audit reached only `21/100` strict zero-refusal body decisions and `55/100`
outcome-only, so a generalized Tactical Arena default cannot honestly be claimed.
Smart117 instead owns a visibly named, controlled ordinal-3144 demonstration; it does
not make Tactical the default or reinterpret the failed competence gate.

## A -- change only the next-fight default

After Smart103 passes, edit the Arena mount in
[`client/src/arena/arena.ts`](../../client/src/arena/arena.ts#L826) from:

```ts
populatePolicies(container, "composed", "composed");
```

to:

```ts
populatePolicies(container, "tactical", "composed");
```

Keep Fighter A's shipped Fighter anatomy, left shield and right sword; keep Fighter B
as the shipped Brute with club, seed 3, spawns, dimensions and tick limit. This makes
the selected smart attacker visible while preserving a stable composed opponent.
Do not silently start a fight on mount: the Worker remains lazy and the user still
presses **Run selected fight**.

Do not rename or append a policy. [`POLICIES`](../../client/src/arena/picker.ts#L76)
keeps `{ code: "tactical", label: "tactical", live: true }`, and Rust policy code 5
remains append-only. `ARENA_CONFIG_LAYOUT_VERSION = 1`, `ARENA_CONFIG_BYTES = 120`,
the two fighter rows, worker messages, frame/pose/region/event layouts and trace schema
remain byte-for-byte unchanged.

The robust strike was certified under `cartesian-recoil`, so the Arena must run that
same authority rather than present a default-mechanics approximation as the selected
result. In `package.json`, add `--features cartesian-recoil` to both wasm builds in
`dev` and `build`; `view` remains build-free. Do not make this a runtime toggle and do
not build two authorities into one module.

## B -- exact client and Rust boundary tests

Extend [`client/test/studio-shell.test.mjs`](../../client/test/studio-shell.test.mjs#L590):

```js
test("the_plain_arena_offers_validated_tactical_against_composed", async () => {});
```

Mount a plain Arena, assert `#a-policy.value === "tactical"` and
`#b-policy.value === "composed"`, no fetch and no Worker before the button, review
copy with no refusal, then press the button and inspect the posted 120-byte config:
fighter policies must be `[5,1]`, with every non-policy byte equal to the previous
shipped config. The existing
`tactical_is_policy_code_five_in_rust_config_and_the_picker` remains green. Make the
new test red by restoring composed/composed and by swapping the two policy bytes;
restore both mutations.

Keep and run the native boundary test
[`a_live_tactical_fight_needs_no_checkpoint_fetch`](../../crates/web/src/lib.rs#L8319).
Add no wasm export. If a live seed-3 tactical/composed completion needs a Rust test,
place it beside that test and drive only the existing `arena_start`/`arena_step`/
publication path; assert policy codes `[5,1]`, no checkpoint request, no refusal,
nonempty pose/event/region publication and deterministic completion on a second run.

```powershell
npm run check
node --test client/test/studio-shell.test.mjs
npm run check:abi
cargo test -p web a_live_tactical_fight_needs_no_checkpoint_fetch -- --nocapture
cargo test -p web
npm run build
$env:ARPG_CARTESIAN_RECOIL='1'
node --test tools/wasm_check.js
Remove-Item Env:ARPG_CARTESIAN_RECOIL
```

`npm run build` must produce `dist/index.html` and `dist/web.wasm`; record their byte
lengths and SHA-256 as build receipts, not pins. Exercise the built worker/config path
with the existing worker and wasm-memory tests:

```powershell
npm run test:worker
npm run test:wasm-memory
node tools/check_docs.js
git diff --check
```

## C -- pin budget and stop conditions

The feature stream has already been measured on the Smart100 tree at native/wasm
`0xa6835666303601d2`; Smart103 cannot move it because the fixture calls no policy.
Before changing a checker, independently recapture that value from a fresh feature
native test and fresh feature wasm and require exact agreement. Then add a paired
feature-only constant in `crates/web/src/lib.rs` and `tools/wasm_check.js`, selected by
the explicit feature build/test mode above, and document it in the golden registry.
The legacy default constant remains `0xdbbd86fedd61c4c7`; do not replace it.

Predicted movement is therefore zero existing pins and one newly registered shipped
feature witness `EXACT_ARTICULATED_STREAM_DIGEST = 0xa6835666303601d2` (the final name
may follow the registry's house style). `COMBAT_GEOMETRY_HASH = 0x9d15344883cf6e9c`,
`CONTACT_BEHAVIOR_DIGEST = 0x587b0259e877105a`, its 3,548 bytes, learned inference,
legacy hashes and all ABI/layout versions remain unchanged. Generated JS chunk names
and bundle SHA may move and are build receipts, not pins. Any different feature
value, target disagreement, existing-pin movement, 120-byte difference outside the
two policy bytes, checkpoint fetch, eager Worker or trace-schema change stops
Smart104. Only a fully green production feature build authorizes Smart105.
