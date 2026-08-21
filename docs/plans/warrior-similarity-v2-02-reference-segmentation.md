# Session 02 -- reference registration and hierarchical segmentation

## Outcome

Produce a fixed, audited reference-space contract and detailed visible-region
annotations for all eight views without changing formula v1.

## Implementation

- Add `metric/reference/rigid-v2/registration.json` containing a fixed transform
  per view derived from stable body/equipment anchors. Record residuals rather
  than recomputing a transform from each candidate foreground box.
- Audit whether the cardinal and diagonal sheets can describe one rigid skeleton
  and equipment arrangement. Record contradictory or low-confidence regions in
  `metric/reference/rigid-v2/consistency.json`; do not hide them with weights.
- Add `metric/reference/rigid-v2/regions.json` and indexed mask PNGs for head,
  hair, collar, torso, left/right armour limbs, waist, leg sections, shield
  subparts, and sword subparts. Automatic/vision masks are proposals only; every
  boundary receives a human review.
- Extend `asset-src/build_warrior.py` with a distinct detailed region-ID review
  pass. Leave canonical `.parts.png` and `part_group()` unchanged.
- Reject unknown region IDs rather than assigning the nearest palette colour.

## Tests and verification

- Prove a deliberate target translation/scale error worsens fixed registration.
- Prove every visible annotation has a candidate ID or an explicit
  reference-only/occluded classification.
- Prove left/right IDs do not swap in rear views.
- Run `npm test`, `npm run similarity:test`, `npm run similarity`,
  `npm run asset:validate`, and `npm run build`.

