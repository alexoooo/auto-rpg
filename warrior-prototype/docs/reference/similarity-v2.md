# Similarity ruler v2

Rigid-v2 is the active phase-02 diagnostic ruler. Formula v1 remains frozen in
`metric/score.py` and the phase-01 archive; the two numerical scales must never
be compared as one continuous score history.

## Contract

- Registration is frozen per view in
  `metric/reference/rigid-v2/registration.json`. A candidate extremity cannot
  recenter or rescale unrelated pixels.
- Structural IDs distinguish 24 visible regions, including left/right limbs,
  hands, equipment subparts, torso, waist, head, and hair. Unknown opaque ID
  colours are errors.
- Material IDs overlap structural identity and distinguish plate, bright edge,
  underlayer, leather, cloth, skin, hair, shield, and blade.
- The scoring beauty hides ignored cloth before rendering; ignored pixels do
  not become foreground-box holes.
- Every view reports silhouette, structural shape, landmarks, global neural
  appearance, fixed-context region neural appearance, and material-conditioned
  colour/texture. The aggregate is 80% view mean plus 20% mean of the two worst
  views.
- The residual atlas is a hypothesis-selection diagnostic. It never overrides
  the all-eight-view production review.

The current weights and margins are in `metric/calibration/profile.json`.
Calibration is explicitly provisional until digest-pinned target-similarity and
production-coherence A/B labels clear the published sample and held-out gates.
There is no absolute target score.

## Interpretation limits

Large atlas cells are work candidates only after visible ownership is checked.
The reference and candidate must assign the same semantic meaning to the same
surface. The current shield split is a known caution: most `kite_shield`
geometry publishes as `shield_rim_boss`, while the reference contains a large
`shield_field` region. Optimizing that residual without correcting or explicitly
accepting the ontology would fit mask naming rather than shape.

Small or heavily occluded cells can also produce extreme ratios from a handful
of pixels. Rank work by reviewed visibility, cross-view consistency, contact
correctness, and representation readiness—not distance alone.

Rigid-v2 does not make the two generated concept sheets one consistent rigid
turnaround. A diagnostic image-space oracle and a visible cross-sheet audit must
bound what one 3D object can attain before a future stopping band is declared.

## Commands

```powershell
npm run similarity:v1
npm run similarity:v2
npm run similarity:atlas
npm run similarity:v2:calibrate
npm run similarity:test
```

`npm run similarity:v2:prepare` rebuilds the immutable starting annotation
proposal and must not be run casually after phase-02 evidence exists. Reference
changes require a new named profile.
