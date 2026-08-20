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
- [the tactical embodied policy's first outing, 2026-08-18](embodied-tactical-policy.md)

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
| v2 articulated mechanics | the original gate stopped before its worker artifact, 15-clip review and pin; a later controlled feature preset has separate visible evidence | [measured result and ledger](v2-articulated-gate.md#measured-outcome), [controlled strike](smart-ai-tactical-policy.md#controlled-strong-strike-reference), and the [retired gate contract](../reference/articulated-mechanical-gate.md) | failed/revise, and now **closed**: the model, its fixture and `lab articulated` were deleted on 2026-08-19, so the missing stages cannot be run and `ARTICULATED_HASH` can never exist. The controlled demo was not generalized competence either |
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

## Measuring in a browser, when the tab is automated

**Rendering performance cannot be measured from an automated browser tab, and this is a
block rather than a limitation to sharpen.** A Claude-in-Chrome tab is always
`visibilityState: "hidden"`. That line used to say the state *throttles*
`requestAnimationFrame`; measured on 2026-08-11 it is worse than throttling — it is a
stop. A probe waiting on seven consecutive `requestAnimationFrame` callbacks never
resolved in forty-five seconds, and `#/arena` playback sat on its starting tick
throughout. So a longer sampling window is not the fix. The tab also rasterises in
software, so it can time pure JavaScript honestly and can measure nothing the rasteriser
or the compositor does. In August 2026 this produced four confident wrong hypotheses in
a row.

**Only the things that need the loop are unreachable**, which is worth knowing before
giving up on a page: `#/arena` scrubs synchronously out of its input handler, so every
panel, label, contact marker and control on it was checked from an automated tab, and
the frame time is the one thing that was not. What is still owed to a person, and why,
is [the arena matrix](v2-arena-matrix.md).

When you do hand a probe to a person at a visible browser:

- **Remove work, do not hide it.** `visibility: hidden` still rasterises every fill.
  No-op the primitive (`ctx.fill = () => {}`) or stop the rAF loop outright.
- **Compare paired frames, not paired runs.** Wrap `render` to draw each frame twice,
  once as shipped and once with the feature's inputs emptied, and difference them on the
  identical scene. A moving scene changes too much for run-versus-run to survive.
- **End every run with the baseline repeated as a control.**
- **A large `idle` beside a small `render`** on the frame strip means the cost landed
  past the callback, in the rasteriser. That is the signal to switch to this method.
- **Count overdraw in pixels, not milliseconds.** Canvas2D commands are queued, so a
  microbenchmark that loops a draw call times the rasteriser's back-pressure rather than
  the call. The worst bug the page ever had — one translucent sight disc per body,
  13.4× the screen in alpha blending — was found by summing fill areas, and the same
  loop timed at 5, 20, 50, 150 and 300 iterations gave a non-monotonic 6.6, 4.7, 4.4,
  23.0 and 7.1 ms.

## Comparing native timings, when the machine drifts

**`lab bench` numbers swing 2–3× run to run, so best-of-N across runs is not a
comparison.** Machines warm inside a run: driving one fight nine times in each of three
processes, the control went from about 300 ms in rounds 1 and 2 to 370–500 ms from round
3 onward. A difference of two cells' *bests* takes one number from before that drift and
one from after and calls the gap a cost.

**Bracket instead.** Inside one round drive `control → subject → control` on the
identical input, and quote the **median of the per-round differences with its range**.
On the data that established this, the paired and unpaired statistics disagreed by up to
two points, and it is the unpaired one that cannot be defended, because its two inputs
sit on opposite sides of the drift. Then **quote the range across several processes
rather than the best of them, and name the pass**: one quantity on this machine has four
published readings falling into two clusters about 20% apart, and any single best quoted
from them would have hidden that. The worked example is
[what recording costs](../reference/articulated-abi.md#what-recording-costs).

**The pinning advice that used to accompany this is historical.** It prescribed pinning
to logical CPU 0 at high priority, because a single-threaded bench on a hybrid-core
laptop was migrated onto an E-core. Measured 2026-08-18, the host is the desktop these
records already name in their host lines — AMD Ryzen 9 3950X, 16 physical cores, 32
logical, uniform — so there is no slow core to be migrated onto and pinning buys nothing
against that. The migration numbers were real on the machine that produced them: an
unpinned process read up to 15% *faster* than a pinned one on a good run and about 1.8×
*slower* on a migrated one, and one review re-measured a control at 18,000–26,000
ticks/s and called it a refutation while reading exactly such a process. **The
correction is to the cause and not to the method** — the drift half above is about
thermal and scheduler behaviour, is independent of core topology, and still holds.

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
