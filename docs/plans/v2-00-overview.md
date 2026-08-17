# Version 2 -- remaining work

**Status:** live roadmap. Completed sessions are retired; durable contracts,
rationale, and evidence live under `docs/` rather than in finished plans.

Version 2 has shipped the worker-backed GPU client, articulated commands and combat,
the native learning probe, configurable live arena recording, pose/region/event/
projectile publications, canonical Bow release mechanics, and representative authored
Fighter and Brute presentation. The Canvas game remains the compatibility control.

Completed implementation history is retired from this roadmap. Start from the
authorities below, not a progress ledger.

## Live work

| work | state | dependency | hash expectation |
|---|---|---|---|
| [Concept production](concept-production-00-overview.md) | active after the owner rejected the visual-recovery result | controls/cameras, filled architecture, production assets, physical objects, then foreground acceptance | session 05 moves only the four generated-dungeon browser hashes; asset sessions move declared asset pins |
| [Smart articulated combat](smart-ai-00-overview.md) | Smart134 is durable history; [Smart133](smart-ai-133-ordinal-31-tick-46-segment-hilt-start-x.md) remains paused research, not a release prerequisite | any successor needs a separately approved causal question | no production pin moves without a fixture-owned prediction |
| [Hierarchical combat learning](hierarchical-ai-00-overview.md) | proposed research successor | first prove fixed `(loadout, strategy)` options have context-dependent headroom on a mechanically productive corpus | native research moves no pins; promotion is separately gated |
| Visible browser evidence | blocked on a person using a foreground tab | follow the [arena matrix](../performance/v2-arena-matrix.md) and [room matrix](../performance/v2-room-matrix.md) | no hashes move |

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

## Verification

Documentation-only roadmap changes run:

```powershell
node tools/check_docs.js
git diff --check
```

An implementation session follows the repository checklist in `AGENTS.md`. Any Rust
change runs the workspace tests, rebuilds `-p web` for wasm, and checks native/wasm
equality. Do not run `cargo fmt`.
