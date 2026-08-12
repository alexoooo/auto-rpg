# Performance evidence

**Purpose:** Index reproducible performance findings without turning hardware-specific observations into universal budgets.
**Status:** current
**Canonical source:** the linked evidence records below, the [v2 reference matrix](v2-reference-matrix.md#measurement-record), and the [renderer contract](../reference/renderer-contract.md#backend-selection-and-loss)
**Update when:** A performance conclusion, measurement method, reference baseline, or renderer role changes.

Performance claims are evidence, not design constants. Preserve the setup, controls,
wrong hypotheses, and limitations with the result. Do not quote a queued Canvas call
as raster duration, do not use a hidden automated tab for compositor work — on this
machine such a tab receives no animation frames at all, so the loop never runs there,
which is a blocked measurement rather than a pessimistic one to be sharpened by a
longer sample — and do not compare moving scenes as independent runs.

- [Canvas rendering and browser bottleneck evidence, 2026-08](evidence/2026-08-canvas-rendering.md)
- [Isometric conversion and backing-store evidence, 2026-08](evidence/2026-08-isometric-conversion.md)
- [Combat-mechanics sweeps and rejected alternatives, migrated 2026-08](evidence/2026-08-combat-mechanics.md)
- [v2 procedural greybox Canvas2D, WebGPU, and WebGL2 diagnostic evidence, 2026-08-08](evidence/2026-08-08-v2-greybox.md)
- [v2 representative room automated record and pending manual evidence](evidence/2026-08-room-slice.md)
- [v2 arena foreground matrix — frame times, visual judgements, and by-hand checks owed to a person](v2-arena-matrix.md)
- [v2 articulated actuator deterministic sweep](v2-actuator-sweep.md)
- [v2 articulated mechanical gate result and open ledger](v2-articulated-gate.md)
- [v2 learning probe held-out corpus, 2026-08-11](v2-learning-probe.md)
- [smart AI actuator calibration](smart-ai-actuator-calibration.md)
- [smart AI contact-energy rebilling](smart-ai-contact-energy.md)
- [smart AI tactical-policy outcome](smart-ai-tactical-policy.md)

The [v2 renderer reference matrix](v2-reference-matrix.md#measurement-record)
predeclares the visible-foreground environment, automated and manual correctness
matrices, fixed stress fixture, metrics, and thresholds. Its automated and manual
correctness gates are recorded. The initial Canvas2D control and WebGPU run are
accepted as ordered slots 1 and 2 of 4. WebGPU p95 16.80 ms fails its 16.67 ms
threshold by 0.13 ms. A complete earlier forced-WebGL2 diagnostic does not fill slot
3, and an early Canvas repeat does not fill slot 4. The project owner explicitly
waived those two missing ordered artifacts after every renderer had been measured at
least once and directed the project to proceed with Babylon.

| Phase | Status | Accepted evidence | Decision |
|---|---|---|---|
| v2 procedural greybox | complete by owner waiver; 2 of 4 original ordered captures accepted | [evidence and waiver](evidence/2026-08-08-v2-greybox.md#owner-decision-and-protocol-waiver) and [reference matrix](v2-reference-matrix.md#measurement-record) | proceed/pass with measured exception; keep Babylon; WebGPU threshold failed |
| v2 representative room | automated implementation and minimum-parity visual review complete; foreground performance evidence pending | [room matrix](v2-room-matrix.md#artifact-and-environment-record) and [automated record](evidence/2026-08-room-slice.md#automated-result) | `pass/proceed` at legacy parity; `CONCEPT.png` direction and performance remain open |
| v2 arena presentation | automated agreement, severance, missing-asset degradation and silhouette-arithmetic gates complete; foreground frame time and visual judgements pending a person at a visible browser | [arena matrix](v2-arena-matrix.md#foreground-performance-record) and [why these are blocked](v2-arena-matrix.md#why-these-are-blocked-rather-than-skipped) | pending; a blocked criterion is not a pass |
| v2 articulated mechanics | checkpoints A/B complete; worker fixtures, visible review, and pin not started | [measured result and ledger](v2-articulated-gate.md#measured-outcome) and [future gate contract](../reference/articulated-mechanical-gate.md) | failed/revise; `ARTICULATED_HASH` remains absent |
| v2 learning probe | trained checkpoint and paired held-out evaluation complete | [held-out corpus](v2-learning-probe.md) | `revise`; best condition on both boards, but the 5% bar was not cleared |
| smart articulated combat | sessions 04--05 and 06 closed `revise`; V2 learning contract present but no training or promotion authorized | [actuator calibration](smart-ai-actuator-calibration.md), [contact-energy rebilling](smart-ai-contact-energy.md), and [tactical-policy outcome](smart-ai-tactical-policy.md) | intentional crossings pass, but 0 of 20 moving fights were body-decided; sessions 08--09 did not run and `ARTICULATED_HASH` remains absent |

The current conclusion is architectural: Canvas is the playable reference/debug
renderer, while the GPU client supplies both a procedural control and the pinned
representative-room route. Neither owns authoritative state. The v2-08 renderer
decision is to proceed with Babylon under the recorded measured exception; the
representative-room automated implementation and minimum-parity visual decision are
complete, while its foreground-performance decision remains pending. See
[ADR 0003](../decisions/0003-renderer-outside-sim.md).

This index supersedes `DESIGN.md#performance-notes`; the second evidence record
supersedes `DESIGN.md#what-the-isometric-conversion-cost`.
