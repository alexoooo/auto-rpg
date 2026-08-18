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
- [concept-production World correctness frame, 2026-08-17](evidence/2026-08-concept-production-world.png)
- [v2 arena foreground matrix — frame times, visual judgements, and by-hand checks owed to a person](v2-arena-matrix.md)
- [v2 articulated actuator deterministic sweep](v2-actuator-sweep.md)
- [v2 articulated mechanical gate result and open ledger](v2-articulated-gate.md)
- [v2 learning probe held-out corpus, 2026-08-11](v2-learning-probe.md)
- [smart AI actuator calibration](smart-ai-actuator-calibration.md)
- [smart AI contact-energy rebilling](smart-ai-contact-energy.md)
- [smart AI tactical-policy outcome](smart-ai-tactical-policy.md)
- [smart AI matched tactical mechanics](smart-ai-matched-tactical.md)
- [articulated contact research and lifted-state handoff](v2-articulated-contact-research.md)
- [embodied corpus, its pin, and the high-ground measurement, 2026-08-17](embodied-corpus-and-high-ground.md)
- [embodied stance and elbow constants: what was measured, derived, or judged](embodied-stance-and-elbow-constants.md)

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
| v2 articulated mechanics | the original gate stopped before its worker artifact, 15-clip review and pin; a later controlled feature preset has separate visible evidence | [measured result and ledger](v2-articulated-gate.md#measured-outcome), [controlled strike](smart-ai-tactical-policy.md#controlled-strong-strike-reference), and [future gate contract](../reference/articulated-mechanical-gate.md) | failed/revise; the controlled demo is not generalized competence and `ARTICULATED_HASH` remains absent |
| v2 learning probe | trained checkpoint and paired held-out evaluation complete | [held-out corpus](v2-learning-probe.md) | `revise`; best condition on both boards, but the 5% bar was not cleared |
| smart articulated combat -- **paused** | controlled Robust Strike is visibly verified; Smart128 stopped structurally, Smart129 found nine controlled-arm count mismatches, Smart130 localized the first to tick 46, Smart131 found the pair-AABB branch, and Smart132 localized its first operand difference to the A-side segment-hilt start-point X coordinate | [tactical-policy outcome](smart-ai-tactical-policy.md) and [matched Tactical/control evidence](smart-ai-matched-tactical.md#frozen-ordinal-31-tick-46-pair-aabb-control-transcript) | diagnose only that frozen point-construction operand; generalized competence remains `21/100` strict and `55/100` outcome-only, with no causal claim, mechanics change, training, default promotion or `ARTICULATED_HASH` |
| articulated contact successor | exact trajectory/lifecycle and lifted-Coulomb solver are retained behind the opt-in feature; both native/wasm digests and authority references are complete | [contact research record](v2-articulated-contact-research.md#registered-exact-mechanics-receipts) and [solver contract](../reference/contact-solver.md#feature-gated-exact-trajectory-and-response-authority) | mechanics authority closed without default promotion, `ARTICULATED_HASH`, or existing-pin movement |

The current conclusion is architectural, and one half of it has since expired: the
Canvas reference renderer these rows were controlled against **was retired during the
embodied-combat work**, so where a row above says "legacy parity" or names Canvas as the
control, it is describing the comparison as it was run and not a comparison that can be
re-run. The GPU client is now the only renderer; it supplies both the procedural control
and the pinned representative-room route, and it owns no authoritative state. The v2-08
renderer decision is to proceed with Babylon under the recorded measured exception; the
representative-room automated implementation and minimum-parity visual decision are
complete, while its foreground-performance decision remains pending. See
[ADR 0003](../decisions/0003-renderer-outside-sim.md).

## Two topics whose plans were retired, and what their status was on the day

Recorded here because a plan set is deleted when its topic closes and a *paused* topic
leaves no other trace. Neither is authorized to resume without a separately approved
causal question.

**Smart articulated combat is paused, not finished.** Exact feature mechanics through
Smart120 and Smart127's body-wall lifecycle witness are committed and verified; Smart122
registered the trajectory transcript at `0x83051e8c6b4ef20f` and Smart123 the terminal
source-41 solver corpus at `0x83cd7bb2b73aeb9e`. The diagnostic chain then ran to a single
operand: Smart128 stopped with 688/900 structural failures, Smart129 found identical
held/reference solver-positive sets with unequal per-row rejection counts on nine mirrored
rows, Smart130 localized the first unequal count to a tick-46 segment/body scan-budget
boundary, Smart131 found the bounded path diverging earlier inside that pair, and Smart132
found the first swept-AABB operand difference at the A-side ordinal-0 segment-hilt start
point X coordinate. **Smart133 is the bounded provenance successor for that one operand.
It is committed as `32bef22` and was never reviewed, gated or production-run**, and it
carries no mechanics authority. Smart134 is complete and its durable outcome is in the four
records above.

The one lever Smart134 measured that moved wounding rows in the right direction was
doubling arm-bearing slew -- 6 wounding rows to 860 of 3,600 -- and it was parked because
"tunnelling" rose from 64 to 68. **That counter adds two unlike facts together**: hitting a
region other than the one the plan named, and making a contact the corpus's own swept test
cannot account for. Only the second is a defect. Smart134 split them and re-decided against
a predeclared rule, which is the part of this worth carrying forward regardless of whether
the topic resumes.

**Hierarchical combat learning never started.** It proposed a slower meta-policy selecting
among versioned `(loadout, strategy)` options, and its precondition -- demonstrated
context-dependent option advantage on a mechanically productive corpus -- was never met.
The durable half of it, the distinction between encounter-level and tactical selection and
why conflating them would break replay, is recorded in
[policy architecture](../architecture/policy.md).

This index supersedes `DESIGN.md#performance-notes`; the second evidence record
supersedes `DESIGN.md#what-the-isometric-conversion-cost`.
