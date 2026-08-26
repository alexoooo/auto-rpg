# 0087: Hand-pivoted shield yaw

Status: rejected
## Pre-registration

- Observation: rigid-v5 makes shield field/rim ownership consistent enough for
  rigid-transform screening. Six unnumbered transforms were rendered around the
  fixed right-hand pivot. Negative yaw and compact/high variants regressed; 12°,
  20°, and 28° positive yaw improved progressively in the classical screen. The
  28° form exposed a detached edge-on shield in the front-right view. The 20°
  candidate retained visual contact and improved the full v5 score from
  `0.858136` to about `0.8556` after its three dependent shield landmarks were
  transformed with the geometry.
- Hypothesis: rotating the complete shield assembly 20° about world/local Z at
  the accepted right-hand pivot will improve its multi-view projected field and
  rim occupancy while preserving the physical hand purchase and all internal
  shield geometry.
- Change boundary: import `Matrix`; after the unchanged kite shield, field, and
  boss are built, create exactly
  `T((.50,-.19,.80)) @ Rz(radians(20)) @ T(-(.50,-.19,.80))` and left-multiply
  the local matrices of only `kite_shield`, `shield_field`, and `shield_boss`.
  Apply that same transform to only `shield_top`, `shield_outer`, and
  `shield_bottom` in `REVIEW_LANDMARKS`. Keep shield mesh points, depths,
  materials, boss, bevels, creation order, the hand anchor, every non-shield
  object/landmark/material, the accepted 0085 root transform, cameras, lights,
  renderer, exporter, and rigid-v5 ruler fixed. Geometry plus dependent landmark
  publication is one indivisible rigid transform.
- Expected movement: aggregate improvement is at least `.002`; mean structure
  and mean silhouette both improve; shield-region movement leads. At least five
  views improve, and front-three mean improves. The direct back may remain
  nearly invariant. Landmark movement is allowed only for the three transformed
  shield points and must be exactly explained by the registered matrix.
- Reject if: aggregate margin fails; structure or silhouette regresses; fewer
  than five views improve; front-three regresses; any view regresses by more than
  `.015`; the hand/shield purchase opens, the hand tunnels through the field, or
  the shield appears to float from the arm; the shield becomes implausibly
  edge-on, hides the torso excessively, reverses decorated-face order, intersects
  the head/pauldron/leg, or exposes a depth-layer split; field, rim, boss, and
  three landmarks do not share one exact transform; any non-shield source,
  anchor, geometry, or publication moves; export/validation fails; or the
  movement cannot be attributed solely to the complete hand-pivoted yaw.

## Result

- Baseline distance: `0.8581357420344911`
- Candidate distance: `0.8555808491543346`
- Absolute delta: `-0.002554892880156423`
- Relative delta: `-0.002977259604755787` (`-0.2977%`)
- Baseline report SHA-256: `1073cd52c174c9b82b6b24a22380cd3add86ad67fa7a43717ebd00aadc1b18bc`
- Candidate report SHA-256: `816ebeb09b4ff44b0ff190e94a7084f036147328de6d6f9c9ce1f1e65d488ca3`
- Progress frame: `experiments/progress/0087-hand-pivoted-shield-yaw.png`
- Decision: Reject. The aggregate and structure improve and front-three moves in
  the intended direction, but silhouette regresses, only four views improve,
  and front-left exceeds the preregistered `.015` regression bound.

## Diagnostics and visual review

Mean component deltas are structure `-0.0067074393`, global neural
`-0.0020027198`, region neural `-0.0011505038`, material appearance
`-0.0044317468`, silhouette `+0.0017870804`, and landmarks `+0.0058469854`.
The landmark movement is confined to the registered shield top/outer/bottom
points and exactly follows the same rigid matrix as the three shield objects.

Per-view deltas are back `+0.0008168978`, back-left `-0.0102108670`, back-right
`+0.0044697783`, front `-0.0226389562`, front-left `+0.0154621033`, front-right
`-0.0058975710`, left `-0.0022218387`, and right `+0.0040654938`. Front-three
improves by about `.00436`, but only back-left, front, front-right, and left
improve. The front-left miss is small numerically and still binding.

All eight formal candidate views and ID passes were inspected at full resolution.
Field, rim, boss, and bevel layers remain coherent; there is no internal split,
head/pauldron collision, or decorated-face inversion. The right hand stays at the
registered pivot, but the front-right and strict profile exposures make the
connection increasingly edge-on and visually ambiguous. The all-view trade is
real rather than an export or annotation artifact.

## Protocol reflection

Correcting dependent equipment landmarks before preregistration reduced the
screened gain and prevented stale metadata from flattering the candidate. The
remaining result confirms that a single rigid yaw cannot reconcile the two
independently generated sheets: it strongly helps direct front/back-left while
hurting front-left/back-right/right. Close nearby shield-yaw tuning; a future
shield change needs an authored contact/pose solution evaluated against explicit
view confidence rather than another angle sweep.

## Next question

Use the corrected v5 atlas to choose a broad non-shield subsystem with coherent
multi-view residuals; do not tune the rejected yaw angle nearby.
