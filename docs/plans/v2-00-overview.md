# Version 2 -- remaining work

**Status:** live roadmap. Completed sessions are retired; durable contracts,
rationale, and evidence live under `docs/` rather than in finished plans.

Version 2 has shipped the worker-backed GPU client, articulated commands and combat,
the native learning probe, configurable live arena recording, pose/region/event/
projectile publications, canonical Bow release mechanics, and representative authored
Fighter and Brute presentation. The Canvas game remains the compatibility control.

The articulated-bow and representative-rig implementation slices are complete. Their
old handoff and session plans have been retired. Start from the authorities below,
not a progress ledger. The one implementation closeout still blocking an
`ARTICULATED_HASH` is the exact-law native/wasm parity result recorded under
[Current blocker](#current-blocker).

## Live work

| work | state | dependency | hash expectation |
|---|---|---|---|
| Exact-law target parity | **blocked on diagnosis.** A fresh exact wasm build stops the configured Composed/Windmill arena at tick 278 while current native release stops at 164. An archived pre-Bow baseline built with the current toolchain reproduces wasm 278, so this is not Bow or projectile causality and must not be re-pinned away | isolate the toolchain/target boundary before any promotion or articulated fight golden | registered command, stream, exact-trajectory, lifted-solver and legacy pins already agree across targets; the fight-stop disagreement remains a failure |
| [Smart articulated combat](smart-ai-134-arm-slew-and-region-attribution.md) | Smart134 landed; [Smart133](smart-ai-133-ordinal-31-tick-46-segment-hilt-start-x.md) remains paused research, not a release prerequisite | any successor needs a separately approved causal question | no production pin moves without a fixture-owned prediction |
| [Hierarchical combat learning](hierarchical-ai-00-overview.md) | proposed research successor | first prove fixed `(loadout, strategy)` options have context-dependent headroom on a mechanically productive corpus | native research moves no pins; promotion is separately gated |
| Visible browser evidence | blocked on a person using a foreground tab | follow the [arena matrix](../performance/v2-arena-matrix.md) and [room matrix](../performance/v2-room-matrix.md) | no hashes move |

The learned exact duel now reaches its 300-tick limit in both current native and wasm.
The archived pre-Bow wasm baseline does the same, so its old wasm-only assertion at
259 is also not projectile causality. That stale expectation needs its own explained
test correction; it is not evidence that the 164/278 disagreement is safe.

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

## Current blocker

The exact artifact is not stale. The publication closeout rebuilt
`target/wasm32-unknown-unknown/release/web.wasm` from the current tree with
`--features cartesian-recoil`, recorded its timestamp and SHA-256, and reproduced the
configured fight's tick 278 in both a focused run and the complete wasm gate. Current
native release reproduces tick 164. Building archived commit `a03cdf3` with the same
current toolchain reproduces the wasm-side 278 and the learned 300 before any Bow
change existed.

That isolation closes one tempting explanation: neither projectile storage nor
projectile contact caused these two counter moves. It does not close the portability
failure. Do not change the exact configured-fight expectation from 164 to 278, create
`ARTICULATED_HASH`, or promote the feature build until the target/toolchain boundary
is explained and native and wasm run the same fight to the same stopping tick.

All registered equality witnesses do agree: the default and exact command hashes,
default and exact publication streams, exact-trajectory digest, lifted-solver digest,
combat geometry, contact corpus, learned inference digest, and every legacy browser
golden. That narrows the failure; it does not excuse it.

## Verification

Documentation-only roadmap changes run:

```powershell
node tools/check_docs.js
git diff --check
```

An implementation session follows the repository checklist in `AGENTS.md`. Any Rust
change runs the workspace tests, rebuilds `-p web` for wasm, and checks native/wasm
equality. Do not run `cargo fmt`.
