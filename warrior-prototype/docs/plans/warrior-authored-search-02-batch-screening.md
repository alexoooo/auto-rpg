# Session 02 — batch-screen coherent broad solutions

## Outcome

Replace intuition-led scalar edits with a reproducible shortlist of coherent
broad-form and equipment candidates. This session consumes no formal experiment
IDs and cannot change the accepted asset.

**Status:** complete. The initial three-variant pauldron screen failed perceptual
separation even though its meshes were valid, so the family was closed without
using an ID. A second screen compared three visibly separated whole-body models.
It discovered and falsified the candidate-derived structural ruler, froze the
target-derived rigid-v4 replacement, and selected `tall_narrow` as the formal
0085 finalist. The durable measurements are in the
[rigid-v4 audit](../analysis/rigid-v4-target-segmentation-audit.md).

## Implementation

1. Add `scripts/screen-warrior-variants.mjs` and
   `asset-src/v3/variant-parameters.json`. Parameters are grouped causal systems:
   skeleton/proportion, shield rigid transform, sword rigid transform, and
   silhouette-only armour envelope. A variant records its complete parameter
   vector and source hash.
2. Render low-sample beauty plus structural IDs for at least 48 broad variants.
   Use silhouette, reviewed structural cells, landmark/contact error, and spill
   to retain a Pareto frontier. Do not use neural terms to search hundreds of
   near-identical candidates.
3. Render full eight-view neural reports for at most six finalists. Produce a
   contact sheet and a table containing global, affected-region, spill, contact,
   triangle, and bounds diagnostics.
4. Inspect all finalists at full resolution. Reject disconnected hands,
   exposed primitive caps, implausible stance, equipment intersections, and any
   candidate whose improvement comes from an ownership inconsistency.
5. Use randomized human A/B to choose among at least three materially distinct
   survivors. The chosen parameter vector is frozen before experiment 0085 is
   preregistered.

The broad solve may change several dimensions because it tests one indivisible
projection model. It must not also change materials, local detail, cameras, or
the ruler.

## Required tests

- `a_variant_digest_changes_with_every_owned_parameter`
- `screening_never_writes_the_accepted_source`
- `the_pareto_frontier_rejects_a_dominated_variant`
- `contacts_and_unaffected_spill_are_part_of_the_shortlist`
- `a_formal_snapshot_refuses_an_unfrozen_variant`

## Gates

Run `npm run similarity:test`, `npm test`, both asset validators, and the build.
Retain the finalist manifest and labelled contact sheet; remove nonfinal render
directories after their metrics and hashes are summarized.
