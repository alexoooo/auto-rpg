# Performance evidence

**Purpose:** Index reproducible performance findings without turning hardware-specific observations into universal budgets.
**Status:** current
**Canonical source:** the linked evidence records below; current renderer behavior remains in [`web/main.js`](../../web/main.js#L11245)
**Update when:** A performance conclusion, measurement method, reference baseline, or renderer role changes.

Performance claims are evidence, not design constants. Preserve the setup, controls,
wrong hypotheses, and limitations with the result. Do not quote a queued Canvas call
as raster duration, do not use a hidden automated tab for compositor work, and do not
compare moving scenes as independent runs.

- [Canvas rendering and browser bottleneck evidence, 2026-08](evidence/2026-08-canvas-rendering.md)
- [Isometric conversion and backing-store evidence, 2026-08](evidence/2026-08-isometric-conversion.md)
- [Combat-mechanics sweeps and rejected alternatives, migrated 2026-08](evidence/2026-08-combat-mechanics.md)

The current conclusion is architectural: Canvas is the reference/debug renderer and
a separate GPU client is the production bet. Neither owns authoritative state. See
[ADR 0003](../decisions/0003-renderer-outside-sim.md).

This index supersedes `DESIGN.md#performance-notes`; the second evidence record
supersedes `DESIGN.md#what-the-isometric-conversion-cost`.
