# Version 2 -- remaining work

**Status:** live roadmap. Completed sessions have been removed; durable contracts,
rationale, and evidence live under `docs/` rather than in retired plans.

Version 2 has shipped the worker-backed GPU client, articulated command and combat
model, pose/region/event publications, configurable browser arena, frozen learned
inference, and the native learning probe. The Canvas game remains the compatibility
control. None of the six legacy hashes moved while those tracks landed.

The visual slice was accepted with the measured exceptions recorded in the
[performance index](../performance/README.md). The articulated mechanical gate did
not pass, no `ARTICULATED_HASH` was created, and the learning probe closed `revise`
rather than `expand`. Those outcomes, not the old session sequence, define the work
that remains.

## Live work

| work | state | dependency | hash expectation |
|---|---|---|---|
| [Representative Fighter and Brute rigs](v2-18-combatant-integration.md) | not started | a passed articulated mechanical gate | presentation-only: every legacy and articulated pin unchanged |
| Mechanical successor | no implementation session authorized yet | revise the failed thresholds and choose a mechanics hypothesis from the [measured ledger](../performance/v2-articulated-gate.md#open-ledger) | must be predicted in its own plan; `ARTICULATED_HASH` remains absent until the gate passes |
| Learning successor | no implementation session authorized yet | finish the budget-stopped training run, then choose physics or action/observation work from the [probe decision](../performance/v2-learning-probe.md#what-the-numbers-say-that-the-verdict-lines-do-not) | no current golden is reachable from training; inference-layout or forward-pass changes own `LEARNED_INFERENCE_DIGEST` |
| Visible browser evidence | blocked on a person using a foreground tab | follow the [arena matrix](../performance/v2-arena-matrix.md) and remaining [room matrix](../performance/v2-room-matrix.md) slots | no hashes move |

`v2-18` stays blocked. Its rigs are presentation-only, but producing them around a
mechanical model whose representative gate still times out in nearly every fight
would turn an unresolved foundation into asset sunk cost.

The learning result authorizes revision only. It does not authorize scale, search,
catalogs, hierarchy, browser training, GPU evaluation, or a Lab workbench. Each of
those needs a new plan with its own baseline, threshold, and removal path.

## Current decisions and authorities

The old overview duplicated contracts that now have canonical homes:

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
- the still-unpassed mechanical contract and its measurements:
  [gate reference](../reference/articulated-mechanical-gate.md) and
  [gate evidence](../performance/v2-articulated-gate.md);
- learning boundary and result: [learning architecture](../architecture/learning.md)
  and [held-out corpus](../performance/v2-learning-probe.md).

These boundaries remain load-bearing: no float enters authoritative state; replay
stores submitted commands rather than policies; presentation owns no authority;
persistent browser consumers use full entity identity; layouts are append-only and
versioned; and legacy hashing emits its original byte stream exactly.

## Gate state

The proposed articulated gate remains the prerequisite for `v2-18`, but its old
thresholds cannot simply be rerun:

- the current composed corpus reaches the tick limit in 99.0% of trials;
- the arm/contact energy scale is roughly 35x short of the legacy impact scale;
- `contact_cap_hits == 0` is unreachable under the current workload;
- the side-advantage threshold has insufficient statistical margin;
- energy excess is meaningful only beside the solver-rejection count.

A successor must amend those criteria before recording fixtures or evidence. It must
not create `ARTICULATED_HASH` until native direct run, native replay, wasm replay, and
the visible review all pass the revised contract.

## Verification

Documentation-only roadmap changes expect no hash movement and run:

```powershell
node tools/check_docs.js
git diff --check
```

An implementation session follows the repository checklist in `AGENTS.md`. Any Rust
change runs the workspace tests, rebuilds `-p web` for wasm, and checks native/wasm
equality. Do not run `cargo fmt`.
