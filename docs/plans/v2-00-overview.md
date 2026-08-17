# Version 2 -- remaining work

**Status:** live roadmap. Completed sessions are retired; durable contracts,
rationale, and evidence live under `docs/` rather than in finished plans.

Version 2 has shipped the worker-backed GPU client, articulated commands and combat,
the native learning probe, configurable live arena recording, pose/region/event/
projectile publications, canonical Bow release mechanics, and representative authored
Fighter and Brute presentation. The Canvas game remains the compatibility control.

The articulated-bow and representative-rig implementation slices are complete. Their
old handoff and session plans have been retired. Start from the authorities below,
not a progress ledger. The last exact-law native/wasm closeout is recorded under
[Resolved parity audit](#resolved-parity-audit). It moved no registered hash and did
not create an `ARTICULATED_HASH` or authorize exact-law promotion.

## Live work

| work | state | dependency | hash expectation |
|---|---|---|---|
| Exact-law target parity | **complete.** The apparent native 164 / wasm 278 split compared different equipment words; the same configured fixture stops at 278 on both targets, and its learned counterpart reaches 300 on both | permanent native and JavaScript raw-word mirrors plus same-input stopping-tick assertions | no registered hash moved; no articulated fight golden or promotion was authorized |
| [Smart articulated combat](smart-ai-134-arm-slew-and-region-attribution.md) | Smart134 landed; [Smart133](smart-ai-133-ordinal-31-tick-46-segment-hilt-start-x.md) remains paused research, not a release prerequisite | any successor needs a separately approved causal question | no production pin moves without a fixture-owned prediction |
| [Hierarchical combat learning](hierarchical-ai-00-overview.md) | proposed research successor | first prove fixed `(loadout, strategy)` options have context-dependent headroom on a mechanically productive corpus | native research moves no pins; promotion is separately gated |
| Visible browser evidence | blocked on a person using a foreground tab | follow the [arena matrix](../performance/v2-arena-matrix.md) and [room matrix](../performance/v2-room-matrix.md) | no hashes move |

The JavaScript fixture's learned exact duel reaches its 300-tick limit in both native
and wasm; the same fixture under the default law still decides at 259. The permanent
native twin asserts the configured hand words and both exact stopping ticks, so a
future test cannot silently substitute the shipped equipment table again.

## Completed implementation slices

The articulated-bow slice now owns the whole path rather than only a release verb:
the command layout carries per-arm release requests; the canonical Bow grip is
validated; live arrows are separate generational entities resolved through the
contact solver; the authoritative store is hashed; and the browser publishes,
records, parses, traces, interpolates and disposes projectile rows. The durable
contracts are [articulated command V1](../reference/articulated-command-v1.md),
[articulated publications](../reference/articulated-abi.md),
[contact solver](../reference/contact-solver.md), the
[projectile decision](../decisions/0005-articulated-projectiles-use-the-contact-solver.md),
and the [golden registry](../reference/hashes.md#golden-registry).

The representative Fighter and Brute slice is also complete. Authored skinned
archetypes cross a pinned sibling asset contract, clone into independent dresses,
follow published joints and equipment sockets, and react or detach only from
published events. Procedural figures remain the fallback rather than the shipped
look. The durable authority is [asset architecture](../architecture/assets.md),
with runtime ownership in [browser architecture](../architecture/browser-runtime.md)
and visual measurements in the [arena matrix](../performance/v2-arena-matrix.md).

Neither completion authorizes exact-law promotion, browser training, a larger roster,
or a new authoritative animation channel. Presentation still consumes snapshots and
never feeds authority back into simulation.

## Current decisions and authorities

- crate direction and host ownership: [architecture overview](../architecture/overview.md);
- deterministic authority: [determinism contract](../reference/determinism.md#contract);
- submitted commands and policy inputs: [commands](../reference/commands.md) and
  [articulated command V1](../reference/articulated-command-v1.md);
- replay and hash domains: [replay architecture](../architecture/replay-hashing.md),
  [codec references](../reference/replay-codec-v1.md), and the
  [golden registry](../reference/hashes.md#golden-registry);
- geometry, actuators, contact, specs, and anatomy: [combat geometry](../reference/combat-geometry.md),
  [articulated actuators](../reference/articulated-actuators.md),
  [contact solver](../reference/contact-solver.md), [combat specs](../reference/combat-specs.md),
  and [anatomy/health](../reference/anatomy-health.md);
- browser transport and ownership: [worker protocol](../reference/worker-protocol.md),
  [frame ABI](../reference/frame-abi.md), [articulated publications](../reference/articulated-abi.md),
  and [browser runtime](../architecture/browser-runtime.md);
- articulated gate and measurements: [gate reference](../reference/articulated-mechanical-gate.md)
  and [gate evidence](../performance/v2-articulated-gate.md);
- learning boundary and result: [learning architecture](../architecture/learning.md)
  and [held-out corpus](../performance/v2-learning-probe.md).

These boundaries remain load-bearing: no float enters authoritative state; replay
stores submitted commands rather than policies; presentation owns no authority;
persistent browser consumers use slot plus generation identity; layouts are
append-only and versioned; and legacy hashing emits its original byte stream exactly.

## Resolved parity audit

The exact artifact was fresh, but the compared inputs were not equal.
`tools/wasm_check.js` deliberately stages round legal equipment values while
`DuelConfigV1::shipped()` uses the shipped table. The four JavaScript hand rows are:

- Shield: `[4, 32768, 32768, 16384, 32768, 3277]`;
- Sword: `[2, 81920, 32768, 65536, 2621, 0]`;
- empty: `[255, 0, 0, 0, 0, 0]`;
- Club: `[3, 131072, 32768, 81920, 3277, 0]`.

Each row is `[item, mass, balance, dimension 0, dimension 1, dimension 2]` in
authoritative raw fixed-point words. Once native staged those same rows, constructor,
swept-AABB and segment/shield diagnostic words matched wasm byte for byte. The full
configured Composed/Windmill fight stopped at 278 on both targets, and the configured
Learned/Windmill fight reached 300 on both.

`exact_wasm_check_fights_match_the_same_native_configuration` permanently asserts the
four raw rows and both native stopping ticks; `tools/wasm_check.js` independently
asserts the same rows and target results. All registered equality witnesses remain
unchanged: the default and exact command hashes, default and exact publication
streams, exact-trajectory digest, lifted-solver digest, combat geometry, contact
corpus, learned inference digest, and every legacy browser golden. This audit closes
the false portability blocker. It does not create `ARTICULATED_HASH` or authorize
promotion of the feature law.

## Verification

Documentation-only roadmap changes run:

```powershell
node tools/check_docs.js
git diff --check
```

An implementation session follows the repository checklist in `AGENTS.md`. Any Rust
change runs the workspace tests, rebuilds `-p web` for wasm, and checks native/wasm
equality. Do not run `cargo fmt`.
