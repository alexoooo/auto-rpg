# Warrior similarity v2 -- overview

**Status:** live. Session 01 completed on 2026-08-21. Phase 01 is closed at accepted experiment 0032 and distance
`0.6740783861`; experiments 0033--0073 established a 41-trial plateau. The
durable diagnosis is [the phase-01 debrief](../../warrior-prototype/docs/analysis/phase-01-similarity-debrief.md).

The objective is to begin a new experiment phase with a calibrated,
region-diagnostic similarity ruler and an asset representation capable of
authored anatomy, fitted armour, and export-parity PBR textures. This plan does
not promise the old `<= 0.10` threshold. Session 04 replaces that arbitrary goal
with a measured same-design acceptance band.

## Session order

| session | outcome |
| --- | --- |
| [01 -- archive and lifecycle](warrior-similarity-v2-01-archive-and-lifecycle.md) | **complete** -- compact phase-01 ledger/manifest/visual sheet; individual records and temporary evidence removed; protocol now defines phase closeout |
| [02 -- reference registration and segmentation](warrior-similarity-v2-02-reference-segmentation.md) | fixed transforms, audited reference consistency, hierarchical visible-region masks, candidate region-ID pass |
| [03 -- diagnostic atlas and formula v2](warrior-similarity-v2-03-diagnostic-atlas.md) | per-region structural/appearance/contact diagnostics, corrected ignored cloth, versioned formula-v2 report |
| [04 -- human calibration and historical rescore](warrior-similarity-v2-04-calibration.md) | blinded historical labels, held-out validation, reference floor, weights and stopping band |
| [05 -- authored asset and PBR foundation](warrior-similarity-v2-05-authored-asset-foundation.md) | production-capable humanoid/armour authoring boundary plus UV, tangent, texture, and GLB validation |
| [06 -- broad-form blockout](warrior-similarity-v2-06-broad-form-blockout.md) | human-screened full-body silhouette, pose, equipment, torso, and rear-volume candidates outside the formal counter |
| [07 -- material hierarchy](warrior-similarity-v2-07-material-hierarchy.md) | baked steel, mail, leather, shield, skin, and hair treatment on the accepted broad form |
| [08 -- phase-02 experiment launch](warrior-similarity-v2-08-phase-02-launch.md) | freeze ruler and baseline, preregister the first residual-led experiment, prove the complete lifecycle |

Sessions are ordered. Session 02 may begin only after session 01 leaves a clean
accepted checkpoint. Formula-v2 implementation in session 03 does not become an
acceptance ruler until session 04 validates it. Asset work in sessions 05--07
may use the atlas diagnostically but cannot silently train the ruler against its
own candidates.

## Fixed ownership and compatibility

- Formula v1, its model hashes, and the phase-01 numerical archive never move.
- The accepted phase-01 source remains the control until session 08 explicitly
  creates a phase-02 baseline.
- Reference edits are versioned. Corrections do not rewrite `rigid-v1` evidence.
- Region segmentation is visible-surface annotation, not inferred hidden
  geometry.
- Similarity and production coherence are independent decisions.
- The standalone package retains its browser, glTF, and eight-view review gates.
- No change under this plan reaches the root game crates or their deterministic
  hashes.

## Completion condition

Session 08 closes only when a fresh checkout can regenerate the phase-02
baseline, render beauty/semantic/region/material passes, produce both formula-v1
and formula-v2 reports, run the residual atlas, snapshot and decide a candidate,
and archive a synthetic completed phase without leaving generated evidence in
version control.
