# Session 03 -- residual atlas and formula v2

## Outcome

Add a noncanonical diagnostic atlas and a versioned formula-v2 candidate. Keep
formula v1 runnable and byte-compatible with its archived inputs.

## Implementation

- Render a scoring beauty/ID pass with ignored cloth hidden so underlying armour
  exists; never clear cloth into background after rendering.
- For every visible view/region cell compute area, IoU, boundary F-score and
  symmetric distance, centroid, bounds, orientation, and fixed-space contact
  relationships.
- Compute DreamSim/LPIPS on union crops with fixed context padding and no local
  recentering. Retain a smaller whole-character perceptual term.
- Add overlapping material-class masks and compare eroded-region Lab grids,
  multiscale gradients/Laplacians, and a texture embedding. Exclude silhouette
  edges from texture statistics.
- Produce signed boundary heatmaps, masked beauty residuals, and one
  view-by-region HTML atlas.
- Introduce formula version 2 with provisional priors: 15% whole silhouette,
  25% hierarchical part shape, 10% landmarks, 15% global neural appearance,
  20% region-crop neural appearance, and 15% material-conditioned appearance.
  These are inputs to calibration, not validated final weights.
- Replace the hard worst view with a reported mean-of-two-worst statistic, while
  retaining affected-region and unaffected-spill vectors.

## Tests and verification

Show every new guard red before restoring it:

- material swaps worsen despite unchanged global palette;
- matched-mean high-frequency noise worsens;
- a local sleeve texture is detected with geometry diagnostics exactly fixed;
- a missing hand subpart worsens its region;
- ignored cloth changes neither registration nor underlying beauty;
- unknown IDs fail;
- identical target/candidate cells remain zero.

Run both formula versions plus all nested package gates.

