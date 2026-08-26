# Rigid-v3 ownership and oracle audit

## Decision

Phase 03 uses `rigid-v3`, a versioned successor to `rigid-v2`. The only target
mask change is shield ownership: the reviewed shield silhouette is divided into
its inner field and its rim/boss instead of assigning the entire coarse polygon
to `shield_field`. Formula weights, fixed registration, materials, landmarks,
beauties, cameras, and every non-shield structural pixel remain unchanged.

The accepted control rescored from `0.621632684510433` under `rigid-v2` to
`0.617250904098065` under `rigid-v3`. The `-0.004381780412368` movement is a
ruler correction, not an asset improvement. It starts a new phase baseline and
must never be compared as though experiment 0032 changed geometry.

## Why the correction was necessary

The candidate renderer has separate stable ownership for `shield_field` and
`shield_rim_boss`. The target bootstrap subsequently painted the coarse
hand-authored shield polygon as `shield_field`, erasing that distinction over
most of the target. A candidate could therefore be penalized for publishing the
very hierarchy the ruler requested elsewhere.

`metric/prepare_v3_reference.py` corrects only pixels inside the existing target
shield aggregate. It aligns the accepted field ID into that aggregate, expands
it by two pixels to avoid a sampling crack, and assigns the remainder to
rim/boss. It does not change the aggregate shield silhouette. The source
`metric/reference/rigid-v2/` remains immutable.

## Oracle result and limit

`metric/oracle_v3.py` passes every target structural mask through the same
per-region IoU/boundary calculation against itself. All eight identity distances
are exactly zero. Its report is marked `acceptanceEligible: false`: a
view-specific 2D cutout proves the ruler floor, not that one rigid 3D asset can
realize eight inconsistent concept projections.

The current oracle does not yet quantify cardinal-versus-diagonal inconsistency
because the sheets have no trustworthy dense correspondences. That remains a
human-reviewed annotation task, not something to fabricate from the accepted
asset.

## Remaining ownership cautions

- Most rigid-v2 target subregions were bootstrapped from accepted object IDs
  clipped by coarse reference polygons. They are diagnostic ownership proposals,
  not independent ground truth.
- Tiny hand, hilt, and occluded limb cells remain too small for literal scalar
  thresholds. Production review and contact diagnostics remain mandatory.
- No asset experiment may modify `rigid-v3`; a further ontology correction must
  create another named profile and phase boundary.

## Reproduction

```powershell
npm run similarity:v3:prepare
npm run similarity:v3
npm run similarity:test
npm run similarity:experiment:audit
```

The frozen phase-03 report SHA-256 is
`94245d621b8555c4e8e5b389dccf277db82837202ef5b2c486c7e82e13624022`.
