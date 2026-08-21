# 0001: Mirror the equipment sides

Status: accepted

## Pre-registration

- Observation: in the front reference the sword is on image-left and the shield
  is on image-right; the baseline render reverses both. The reversal persists in
  the rear reference, where the baseline is the worst-scoring view.
- Hypothesis: mirroring the complete sword and shield assemblies across the
  character's centre line will reduce the aggregate distance, principally
  through weapon landmarks and semantic part overlap.
- Change boundary: negate only the authored X coordinates for shield geometry,
  sword geometry, and their five published landmarks. Body, hands, proportions,
  materials, lighting, cameras, references, annotations, and metric stay fixed.
- Expected movement: landmarks and parts improve; front and back improve most;
  palette/texture should remain effectively unchanged.
- Reject if: aggregate improvement is less than `0.001`, equipment is visibly
  incoherent from any review angle, the expected diagnostic components do not
  explain the movement, or the score is won through an annotation defect.

## Result

- Baseline distance: `0.8229677371`
- Candidate distance: `0.7318364544`
- Absolute delta: `-0.0911312828`
- Relative delta: `-11.0735%`
- Baseline report SHA-256:
  `17ca76a42f64b14dc63d0da149a27da5f924087b012aa3127568bd2dcb5a0ed9`
- Candidate report SHA-256:
  `290311ec09e4743c2aa180fd92a21ae4c10a3818ed845cfed4183ac44c2316eb`
- Candidate asset-source SHA-256:
  `b98d1bd3b9fa765746f68d8b2647ee23829774efa0d2fef177db5e3217d20c2c`
- Progress frame: [`progress/0001-mirror-equipment.png`](progress/0001-mirror-equipment.png)
- Decision: accept. The improvement is large, causally legible, and corrects an
  obvious target mismatch rather than merely exploiting the metric.

## Diagnostics and visual review

Mean component movement (candidate minus baseline):

| Component | Baseline | Candidate | Delta |
| --- | ---: | ---: | ---: |
| landmarks | 1.166894 | 0.744061 | -0.422832 |
| parts | 0.693942 | 0.652331 | -0.041611 |
| silhouette | 0.543589 | 0.526200 | -0.017388 |
| LPIPS | 1.019244 | 1.011809 | -0.007436 |
| palette/texture | 0.237484 | 0.236091 | -0.001393 |
| DreamSim | 1.011626 | 1.016794 | +0.005168 |

Per-view movement:

| View | Baseline | Candidate | Delta |
| --- | ---: | ---: | ---: |
| back_right | 0.890911 | 0.744951 | -0.145960 |
| front | 0.836885 | 0.694777 | -0.142109 |
| back | 0.936165 | 0.801081 | -0.135084 |
| front_left | 0.755034 | 0.647994 | -0.107040 |
| front_right | 0.727053 | 0.650379 | -0.076674 |
| left | 0.663634 | 0.651031 | -0.012603 |
| back_left | 0.807035 | 0.803103 | -0.003932 |
| right | 0.665165 | 0.671332 | +0.006166 |

All eight beauty renders were inspected. The equipment now agrees with the
reference handedness and remains coherent around the turntable. The small
DreamSim and right-view regressions do not outweigh the strong, expected landmark
gain, the improvements in five other components, and the visible correction.
A human A/B was unnecessary because the target-side error is unambiguous.

The hypothesis was directionally right but incomplete: landmarks produced most
of the gain, while part overlap improved only modestly. Correct side assignment
does not fix the current shield shape, weapon pose, hand contact, or the body's
large proportion mismatch.

## Protocol reflection

The score command overwrites `.review`, so a baseline can be lost precisely when
the candidate is produced. This iteration added the snapshot command and the
ignored evidence layout before closing the record. Repeating the neural score on
unchanged renders produced a byte-identical report. A fresh Blender baseline
rerender differed from the preceding aggregate by less than `0.0000001`, but the
protocol still uses a conservative `0.001` inconclusive band until render noise
is measured across more iterations.

The first experiment also shows why the aggregate cannot be the only acceptance
test: DreamSim moved slightly in the wrong direction even though the semantic
correction was visually certain. Future decisions retain the component table,
all-view review, and causal explanation rather than optimizing the headline in
isolation.

## Next question

The highest-value next hypothesis is that replacing the toy-like cylindrical
body proportions -- especially the oversized spherical pauldrons, short legs,
and round torso -- with the reference's taller human silhouette will reduce the
remaining silhouette, body-part, and perceptual distances across all views.
