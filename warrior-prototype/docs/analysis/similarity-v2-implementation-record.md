# Similarity-v2 implementation record

The completed `warrior-similarity-v2` plan established the measurement,
archival, and export infrastructure used by phase 02. This document retains the
facts that remain useful after deleting the completed plan files.

## Phase lifecycle and evidence

Phase 01 was compacted after experiment 0073 into a complete ledger, manifest,
front contact sheet, and checkpoint under
[`experiments/archive/phase-01`](../../experiments/archive/phase-01/README.md).
The archive-aware audit seeds later phases from the archived accepted source
without requiring hundreds of live records or ignored render files. Global
experiment numbering remains continuous and the archive command refuses an
open proposal, missing evidence, noncontiguous range, or checkpoint mismatch.

Phase 02 began at rigid-v2 distance `0.621632684510433`, source SHA-256
`e8f29c02b81763acd97aba33cd7f7c6d534054ac99b899f8191a2c3fbcad2488`,
and formula version 2. The accepted source remained unchanged through 0084.

## What rigid-v2 added

- fixed per-view registration, so an edited extremity cannot recenter the body;
- 24 visible structural IDs and nine overlapping material IDs;
- a cloth-free scoring beauty pass rather than cleared foreground holes;
- whole-image and fixed-context regional neural comparisons;
- material-conditioned appearance diagnostics;
- a view-by-region residual atlas with bounds, centroids, orientation,
  boundaries, and declared contacts;
- an aggregate using 80% view mean and 20% mean of the two worst views;
- immutable formula identity and complete tensors in comparison evidence.

The provisional component weights are engineering priors. Human calibration
infrastructure records separate target-similarity and production-coherence
choices, but the required digest-pinned label set has not yet been collected.
Rigid-v2 therefore remains a diagnostic ruler with an explicit all-eight-view
production gate, not a learned substitute for judgment.

## Export and material infrastructure

The parallel v2 asset path supplies stable semantic extras, UVs, tangents,
embedded base-colour/normal/ORM maps, deterministic rebuilding, and a strict GLB
validator. The browser can select it with `?asset=v2` without replacing the
canonical control.

This is infrastructure, not yet a new character representation. The current
`asset-src/v2/build_warrior_v2.py` calls the phase-01 primitive builder and then
publishes/triangulates/textures its output. The generated `.blend` is inspectable,
but its broad form, joints, hands, hair, and armour topology remain the primitive
model. Calling it an authored replacement would overstate what session 05
delivered. The next asset phase must edit or replace complete meshes in the
Blender source rather than add another wrapper around `sphere`, `cylinder`,
`torus`, or `prism`.

## Known limitations carried forward

The reference region proposal and candidate publication require a visible
ownership audit before their largest cells drive geometry. In particular,
`kite_shield` currently publishes as `shield_rim_boss`, while much of the target
shield is annotated as `shield_field`. The accepted atlas consequently reports
large field/rim errors that may describe ontology disagreement rather than a
wrong shield. Very small or heavily occluded regions have similar unstable area
ratios. These cells are diagnostics to inspect, not automatic work orders.

The two concept sheets also remain separately generated views rather than one
verified rigid turnaround. Fixed registration prevents a candidate from gaming
that inconsistency; it cannot make contradictory projections attainable.

## Durable commands

```powershell
npm run similarity:v1
npm run similarity:v2
npm run similarity:atlas
npm run similarity:v2:calibrate
npm run similarity:experiment:audit
npm run asset:v2:build
npm run asset:v2:validate
```

The detailed ruler and asset contracts are
[similarity v2](../reference/similarity-v2.md) and
[authored asset v2](../reference/authored-asset-v2.md).

