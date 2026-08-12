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
| [Smart articulated combat](smart-ai-00-overview.md) | closed `revise`; sessions 08 and 09 were not run | intentional crossings passed, but the tactical corpus produced 0 body decisions in 20 moving fights and failed its 95/100 by tick 1,800 gate | no training or promotion was authorized; `ARTICULATED_HASH` remains absent |
| [Matched tactical mechanics](smart-ai-10-matched-tactical-mechanics.md) | proposed evidence successor | bracket the tactical controller against the strongest legal fixed-tip sweep on identical cases before choosing one mechanics or controller hypothesis | instrumentation and evidence move no pins; any later authority edit requires its own predicted budget |
| [Effective articulated contact response](smart-ai-11-effective-contact-response.md) | planned mechanics decision | compare restitution-preserving generalized responses after session 10 exposed the upper energy-root defect | an accepted repair must move `CONTACT_BEHAVIOR_DIGEST`, expects `ARTICULATED_STREAM_DIGEST` to move, and keeps every other registered pin fixed |
| [Directional contact response](smart-ai-12-directional-contact-response.md) | test-only prototype planned | replace the rejected scalar owner mass with a bounded response matrix measured through the actual World projector | no production or pin move before planar, vertical, friction, joint, simultaneous and opening fixtures pass |
| [Bounded nonlinear contact response](smart-ai-13-bounded-nonlinear-contact-response.md) | test-only successor in progress | search the actual projected normal response after the captured strike rejected a fixed response column | no production or pin move; friction remains blocked on normal fixtures |
| [Bounded sliding friction](smart-ai-15-bounded-sliding-friction.md) | test-only successor | solve the actual circular Coulomb boundary after the box prototype validated but did not construct articulated sliding response | no production or pin move before static, sliding, zero-friction, energy-numerator and permutation fixtures pass |
| [Generalized joint contact response](smart-ai-18-generalized-joint-contact-response.md) | test-only successor | replace black-box inverse-hand projection with a forward Jacobian over authoritative body and arm coordinates | no production or pin move before retained restitution, joint-boundary, virtual-work, mass, and energy fixtures pass |
| [Cartesian contact response](smart-ai-20-cartesian-contact-response.md) | test-only successor | separate scalar command control from explicit Cartesian collision state after the generalized/interior fixture revisions | no production or pin move before reconciliation, damage, mirror, replay, and exact energy fixtures pass |
| [Post-contact Cartesian velocity](smart-ai-21-post-contact-velocity.md) | test-only successor | retain post-impact velocity separately from whole-tick endpoint displacement | no production or pin move before lifecycle, energy, reset, anatomy, replay, and Lab gates pass |
| [Equipment-COM recoil work](smart-ai-22-equipment-com-recoil-work.md) | test-only successor | account for body transport, held-row offset change, and Cartesian motor work without floored-energy blindness | no authority until a noncircular effort/fatigue permission law and every session-21 lifecycle gate pass |
| [Recoil fatigue ledger](smart-ai-23-recoil-fatigue-ledger.md) | test-only successor | derive COM acceleration from the existing effort/authority formula and aggregate realised COM work into its residue bill | no authority until the single real actuator call site and every lifecycle gate pass |
| [Feature-gated recoil lifecycle](smart-ai-24-feature-gated-recoil-lifecycle.md) | gated World successor | commit direct equipment endpoints/COM state and reconcile them on the next actuator tick | default stays off; named clearing energy, replay, anatomy, Lab, and same-feature wasm gates remain mandatory |
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
[smart AI session 11](smart-ai-11-effective-contact-response.md). Session 10 traced a
strong zero-restitution sword/body contact to a local-mass impulse followed by a
whole-entity projector that also accelerates target-held equipment; the existing
alpha search then returns at the far energy-conserving root and allocates no wound
energy. Session 11 compares restitution-preserving generalized responses before any
authority edit. It does not reopen `v2-18` or create `ARTICULATED_HASH` by existence.

## Verification

Documentation-only roadmap changes expect no hash movement and run:

```powershell
node tools/check_docs.js
git diff --check
```

An implementation session follows the repository checklist in `AGENTS.md`. Any Rust
change runs the workspace tests, rebuilds `-p web` for wasm, and checks native/wasm
equality. Do not run `cargo fmt`.
