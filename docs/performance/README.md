# Performance evidence

**Purpose:** Index reproducible performance findings without turning hardware-specific observations into universal budgets.
**Status:** current
**Canonical source:** the linked evidence records below, the [v2 reference matrix](v2-reference-matrix.md#measurement-record), and the [renderer contract](../reference/renderer-contract.md#backend-selection-and-loss)
**Update when:** A performance conclusion, measurement method, reference baseline, or renderer role changes.

Performance claims are evidence, not design constants. Preserve the setup, controls,
wrong hypotheses, and limitations with the result. Do not quote a queued Canvas call
as raster duration, do not use a hidden automated tab for compositor work, and do not
compare moving scenes as independent runs.

- [Canvas rendering and browser bottleneck evidence, 2026-08](evidence/2026-08-canvas-rendering.md)
- [Isometric conversion and backing-store evidence, 2026-08](evidence/2026-08-isometric-conversion.md)
- [Combat-mechanics sweeps and rejected alternatives, migrated 2026-08](evidence/2026-08-combat-mechanics.md)

The [v2 renderer reference matrix](v2-reference-matrix.md#measurement-record)
predeclares the visible-foreground environment, automated and manual correctness
matrices, fixed stress fixture, metrics, and thresholds. Its automated gates are
recorded; machine, manual-observation, and capture fields remain blank until accepted
user-run evidence exists.

| Phase | Status | Accepted evidence | Decision |
|---|---|---|---|
| v2 procedural greybox | pending | none | pending |

The current conclusion is architectural: Canvas is the playable reference/debug
renderer and a separate procedural GPU greybox exercises the production-facing
presentation seam. Neither owns authoritative state. Performance and art-production
decisions remain pending. See [ADR 0003](../decisions/0003-renderer-outside-sim.md).

This index supersedes `DESIGN.md#performance-notes`; the second evidence record
supersedes `DESIGN.md#what-the-isometric-conversion-cost`.
