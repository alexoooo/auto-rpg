# v2-ui-06 — publishing the capsules the contact phase sweeps

**Goal:** put the five anatomy capsules on the wire, so a live fight can be drawn from
published geometry rather than from a reconstruction of it.

**Depends on:** `v2-ui-05` (an articulated fight that actually runs in wasm).

**Golden expectation:** **`ARTICULATED_STREAM_DIGEST` moves.** Predicted here, in
writing, before the run. Nothing else moves.

## The gap

`POSE_STRIDE = 66` carries the body point and yaw, both hands with their velocities and
commanded targets, both weapon segments, the shield face, integrity, wound, blood,
shock, the severed and equipment masks, intent and hints. It carries **no regional
capsules**.

The trace has them.
[`crates/lab/src/trace.rs:161`](../../../crates/lab/src/trace.rs#L161) calls
`sim::body_region_volumes` — the same function the contact phase sweeps — and the module
header says why in as many words: a viewer that rebuilt a shoulder from an anatomy row
would be a second answer to a question the simulation has already answered.

So `[Geometry]` mode, which *is* the capsules, works on a trace and has nothing to draw
on a live fight. There are three ways out and only one of them is consistent with the
rule above.

| | approach | verdict |
|---|---|---|
| a | publish anatomy once, port `body_region_volumes` to TypeScript | **rejected** — it is exactly the mirror `trace.rs` refuses, and it would drift silently |
| b | publish the capsules as a third fixed section | **taken** |
| c | draw hands, weapons and shield only, no body | rejected — a fight with no bodies in it |

(a) is the cheap one and worth naming so it is refused on the record rather than
rediscovered as an idea. The function is not trivial — the head is a degenerate capsule
whose extent comes from `radius` while `AnatomyRegionSpec::half_height` is dead for that
region — and a TypeScript copy would be right on the day it was written and wrong the
first time the anatomy changed, with nothing to catch it.

## The shape

A third publication written by `publish()` from `sim::body_region_volumes`, beside the
pose and combat-event sections and following their conventions exactly: fixed capacity,
`REGION_*` field offsets emitted by `crates/web/src/bin/emit_abi.rs`, its own
`REGION_LAYOUT_VERSION`, its own dropped counter.

Seven words per region — lower point, upper point, radius — five regions per body, and
`MAX_POSES` bodies to match the pose section: `64 x 5 x 7 x 4` = 8,960 bytes reserved,
of which a two-body fight fills about 280.

**Present-ness must be published, not inferred.** `body_region_volumes` takes a
`present` argument and a severed limb stops existing; a reader that inferred absence
from a zero capsule would drop a region that legitimately has coincident endpoints — the
head, on every body, on every tick.

## The pin, and why this is its own session

[`docs/reference/hashes.md`](../../reference/hashes.md) on
`ARTICULATED_STREAM_DIGEST 0x54c0762b3dfb7a05`: it is *"owned by whoever owns the row
layouts, and a layout change moves it and must say so"*, and it is FNV-1a-64 over the
published pose and combat-event words of a twenty-tick scripted fight. A third published
stream is a change to the published set. **It moves.**

That is the entire reason this is a session and not a paragraph inside `v2-ui-05` or
`v2-ui-07`. The registry's rule is that a pin may move only when predicted in writing
first and explained afterwards, and a move budgeted alone is one whose cause is not in
doubt. Bundled with the driver port, a moved digest would have two candidate
explanations and no way to separate them.

What must **not** move, and what says so:

- `FRAME_LAYOUT_VERSION` stays at 7. `docs/reference/frame-abi.md` states that the pose
  and combat-event publications are not sections of the frame and that the handshake
  applies to each ABI separately. A third such publication is the same kind of thing.
- `POSE_LAYOUT_VERSION` and `COMBAT_EVENT_LAYOUT_VERSION` stay at 1. This session adds a
  section; it does not touch a row. **Do not** be tempted to fold the capsules into the
  pose row instead — that would move `POSE_LAYOUT_VERSION` as well, for no gain, and
  would make every pose row 62% wider for data that is constant across most of a fight.
- The combat spec-table digest and the `articulated-duel-v1` fingerprint. Nothing in
  `sim` changes.

`SNAPSHOT_BUFFER_BYTES` and every new `emit_abi` constant are **regenerated with
`npm run generate:abi`, never hand-edited**;
`snapshot_offsets_are_aligned_non_overlapping_and_cover_every_fixed_buffer` in the
client tests exists to catch a region reserved without an offset.

## The handshake, and a stale sentence to fix

`AGENTS.md` calls the frame ABI a four-file handshake. Its own canonical
`docs/reference/frame-abi.md` lists five obligations across six files: `crates/web/src/
lib.rs`, `web/main.js`, `tools/wasm_check.js`, `crates/web/src/bin/emit_abi.rs` →
`client/src/protocol/abi.generated.ts` plus `client/src/state/snapshot.ts`, and
`frame-abi.md` itself. The "four" predates the v2 client split. Correct it here, since
this is the session that follows the handshake.

## Verification

```powershell
npm run generate:abi
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_abi.js
node tools/check_docs.js
cargo run --release -p lab -- hash
```

- **The digest moves once, to one value, and native and wasm agree on it.** A one-sided
  move means target disagreement, not a layout change, and must be investigated rather
  than re-pinned.
- `the_published_capsules_are_the_swept_capsules` — for a fight run both ways, every
  published region equals `sim::body_region_volumes`' output for that tick, exactly. Not
  approximately: these are raw fixed-point words copied from one call.
- `a_severed_region_is_published_absent`.
- `the_head_capsule_is_published_degenerate_and_present` — the specific case a reader
  inferring absence from geometry would get wrong.
- Re-pin `ARTICULATED_STREAM_DIGEST` in both owners — `crates/web/src/lib.rs` and
  `tools/wasm_check.js` — and add a registry row in `docs/reference/hashes.md` recording
  the old value, the new value, and that the cause was a third published section.

## Decision

Record `pass`, `revise` or `stop`. State the old and new digest, both targets agreeing,
and confirm `FRAME_LAYOUT_VERSION`, `POSE_LAYOUT_VERSION` and
`COMBAT_EVENT_LAYOUT_VERSION` are unmoved.
