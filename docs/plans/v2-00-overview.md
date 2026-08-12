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
| [Smart articulated combat](smart-ai-00-overview.md) | mechanics blocked; arithmetic research consolidated | exact contact research rejected scalar/local response repairs and reached a passing test-only lifted XYZ state | no production authority, training, promotion, or `ARTICULATED_HASH` |
| [Exact lifted trajectories](smart-ai-36-exact-lifted-trajectories.md) | next implementation checkpoint | preserve rotating motor endpoints plus exact owner/held response translation in one scan/recompute/commit evaluator, then carry it through lifecycle accounting, hashing, replay, and native/wasm equality | feature/test-only; no existing pin moves and at most one new feature-only diagnostic digest |
| [Articulated contact research record](../performance/v2-articulated-contact-research.md) | durable evidence | exact retained-contact findings and rejected response/state hypotheses formerly spread across Smart AI sessions 01--34 | evidence only; no authority |
| [Hierarchical combat learning](hierarchical-ai-00-overview.md) | proposed research successor | first prove that fixed `(loadout, strategy)` options have context-dependent headroom on a mechanically productive corpus | native research moves no pins; promotion is separately gated |
| Visible browser evidence | blocked on a person using a foreground tab | follow the [arena matrix](../performance/v2-arena-matrix.md) and remaining [room matrix](../performance/v2-room-matrix.md) slots | no hashes move |

`v2-18` stays blocked. Its rigs are presentation-only, but producing them around a
mechanical model whose representative gate still times out in nearly every fight
would turn an unresolved foundation into asset sunk cost.

The smart-combat successor narrowed the failure without clearing it. Faster actuator
candidates and contact-floor rebilling were both rejected by measurement. The
tactical controller deliberately names and crosses opponent regions, but its 20-fight
moving diagnostic produced zero body decisions before every run reached tick 3,600.
The V2 learning contract exists only as an opt-in native seam; that contract did not
authorize training a target whose behavioral gate failed. Sessions 08 and 09 therefore
closed without training, checkpoint installation, final-gate implementation, or a new
golden.

The learning result authorizes revision only. It does not authorize scale, search,
browser training, GPU evaluation, or a Lab workbench. Hierarchy now has a separate
[research plan](hierarchical-ai-00-overview.md) with its own fixed-option baseline,
thresholds, and stop paths; the plan does not itself authorize training or promotion.

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

The current mechanics successor is
[exact lifted trajectories](smart-ai-36-exact-lifted-trajectories.md). The completed
[contact research record](../performance/v2-articulated-contact-research.md) traces
why local impulse tuning, scalar/projector searches, and an integer affine Cartesian
model were rejected, and what the test-only lifted XYZ arithmetic now proves. The
first World adapter was also rejected: a carried position remainder can cross an
integer contact boundary at half tick while the current integer endpoint sweep cannot
see it. Smart36 must make the rotating motor trajectory plus exact response
translation the single geometry consumed by scan, recomputation, and commit, and land
hash/replay/native-wasm proof with its first authoritative field. It does not reopen
`v2-18` or create `ARTICULATED_HASH` by existence.

## Verification

Documentation-only roadmap changes expect no hash movement and run:

```powershell
node tools/check_docs.js
git diff --check
```

An implementation session follows the repository checklist in `AGENTS.md`. Any Rust
change runs the workspace tests, rebuilds `-p web` for wasm, and checks native/wasm
equality. Do not run `cargo fmt`.
