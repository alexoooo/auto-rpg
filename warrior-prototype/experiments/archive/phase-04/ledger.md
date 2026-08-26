# phase-04 full experiment ledger

This file preserves the complete text of the individual phase-01 records after
their consolidation. Headings are separated by horizontal rules; original source
and evidence hashes remain in each record and in `manifest.json`.

---

# 0085: Tall narrow proportion model

Status: accepted
## Pre-registration

- Observation: the accepted model is visibly squat relative to the target. A
  three-way unscored screen separated tall/narrow, heroic, and broad/compact
  whole-body forms. Under the reviewed target-derived rigid-v4 ruler, only the
  tall/narrow model improved both the classical aggregate (`-0.021209`) and the
  full aggregate (`-0.008590`); broad/compact regressed strongly. The screen did
  not change materials, local meshes, cameras, or contacts.
- Hypothesis: scaling the complete warrior root to `.91` in X and `1.10` in Z
  about a floor pivot at Z `.05` will correct the broad projection mismatch and
  improve the target-derived structure and silhouette across the turntable while
  preserving every local armour and equipment contact.
- Change boundary: after the unchanged `make_warrior()` call, set only
  `root.scale.x = .91`, `root.scale.z = 1.10`, and
  `root.location.z = .05 * (1.0 - 1.10)`. Keep every child mesh, local transform,
  material, region/material publication, camera, light, target, formula, and
  landmark declaration unchanged. The three root-transform literals are one
  indivisible whole-body projection model.
- Expected movement: the rigid-v4 aggregate improves by at least `.004`, and
  mean structure improves by at least `.02`. Back, back-right, front, and left
  should lead. Silhouette and material appearance may improve modestly. Global
  and region neural appearance may regress because the same surface detail is
  stretched; their combined mean regression must remain below `.025`. Every
  local contact remains visually closed because all children share one root.
- Reject if: aggregate improvement is less than `.004`; mean structure improves
  less than `.02`; combined global/region neural mean regresses by more than
  `.025`; fewer than four views improve; any view regresses by more than `.020`;
  the warrior reads stretched, spindly, pin-headed, or unnaturally narrow; shield,
  sword, hand, shoulder, wrist, belt, thigh, boot, or floor contact separates;
  equipment proportions become implausible; any local mesh/material/publication
  changes; source/export validation fails; or the measured change cannot be
  attributed solely to the complete floor-pivoted root transform.

## Result

- Baseline distance: `0.8728686848085476`
- Candidate distance: `0.8642787573879791`
- Absolute delta: `-0.008589927420568522`
- Relative delta: `-0.009841030581195166` (`-0.9841%`)
- Baseline report SHA-256: `d437cf6ca9b4524866343ba309c14db8c06260db8664c81efcf57f0d8f0180ea`
- Candidate report SHA-256: `0298c1dac6aa763a31fc97c06c029f6b344f137245d350f47afc6ca8f08255f1`
- Progress frame: `experiments/progress/0085-tall-narrow-proportion-model.png`
- Decision: Accept. The candidate clears the aggregate and structure margins,
  five views improve, the largest view regression remains below the registered
  bound, and the combined neural regression remains within its explicit budget.
  The visual review finds no stretch or contact failure.

## Diagnostics and visual review

Mean component deltas are: structure `-0.0441638050`, silhouette
`-0.0041969084`, material appearance `-0.0040773335`, landmarks `0`, global
neural `+0.0256071948`, and region neural `+0.0130424649`. The mean of the two
neural regressions is `+0.0193248298`, below the preregistered `.025` ceiling.

Per-view deltas are back `-0.0315016190`, back-left `-0.0077375323`,
back-right `-0.0141463816`, front `-0.0097569288`, front-left
`+0.0156488735`, front-right `+0.0060819962`, left `-0.0067109933`, and right
`+0.0014624624`. Five of eight improve. The largest regression is front-left at
`+.01565`, below the `.020` bound.

All eight beauty views were inspected at full resolution. Front is visibly less
squat while the breastplate, belt, tabard, sword, and shield remain ordered.
Front-left and front-right retain hand/equipment overlap and show no stretched
surface artifact despite their numeric regressions. Both profiles keep shoulder,
elbow, wrist, belt, knee, boot, sword, and shield contacts closed. Back-left,
back, and back-right show the clearest production improvement: the torso and legs
read taller without becoming narrow tubes, and the feet remain on the floor.
No mesh, material, ID-mask, lighting, or camera anomaly is visible.

## Protocol reflection

The experiment confirms the target-derived ruler's directional value and the
screening funnel: one formal ID confirmed a candidate already separated and
reviewed outside the ledger. It does not validate uniform scaling as the final
representation. Neural appearance worsened because every existing primitive
and highlight was stretched, so the next geometry work should preserve the
accepted proportion envelope while authoring real torso and limb forms.

## Next question

If accepted, replace uniform scaling with an authored torso/limb proportion
system that retains the broad gain without stretching surface language.

---

# 0086: Longline torso shell

Status: rejected
## Pre-registration

- Observation: the accepted torso is three overlapping primitive forms: a padded
  ellipsoid, a second cuirass ellipsoid, and a flat breastplate with five applied
  bars. A three-way unscored readiness screen compared a forged shell, a
  lobstered shell, and a longline shell while retaining the accepted 0085 root
  proportions. The lobstered system failed production review as a horizontal
  shelf, and the forged system regressed the full rigid-v4 score. The longline
  shell was continuous and mechanically coherent and improved the screening
  score by about `.00130`, led by structural and rear-diagonal movement.
- Hypothesis: replacing the complete padded-torso/cuirass/breastplate stack with
  one six-ring, mildly keeled longline shell will improve the target torso
  proportion and rear transition without reintroducing countable bands, applied
  plaques, or detached layers.
- Change boundary: add one `torso_shell` helper that constructs a closed
  28-segment ring mesh, recalculates its normals, applies the established `.008`
  bevel and smooth shading, and publishes the existing `cuirass_mass` name.
  Remove only `padded_torso`, `cuirass_mass`, `breastplate`,
  `breastplate_shadow`, and `cuirass_ridge_0..3`; replace them with the exact ring
  tuples `(.88,.300,.165,.015)`, `(.98,.275,.165,.005)`,
  `(1.12,.305,.188,-.005)`, `(1.30,.365,.205,-.010)`,
  `(1.45,.345,.185,.000)`, and `(1.50,.285,.155,.010)`, a front keel of `.025`,
  and shoulder cut of `.018`. Keep the accepted 0085 root transform, strap,
  rivets, gorget, belt, tabards, limbs, equipment, landmarks, materials, lights,
  cameras, renderer, exporter, and rigid-v4 ruler fixed. The complete replacement
  is indivisible; do not retain a screened hybrid.
- Expected movement: aggregate improvement is at least `.001`; mean structure
  improves by at least `.010`; global neural and material appearance improve;
  rear-three mean does not regress; at least four views improve. Region-neural
  and silhouette may regress modestly because a single continuous surface
  replaces target-like painted subdivisions, but neither may regress by more
  than `.015`. The known cardinal-mask leg/material inconsistency is held fixed
  and must not be cited as evidence for this torso-only change.
- Reject if: the aggregate or structure margin fails; fewer than four views
  improve; rear-three regresses; any view regresses by more than `.016`; the
  result reads as another featureless egg, smooth rubber tunic, dress, barrel,
  bell, funnel, corset, or inflated torso; the shoulder, collar, strap, belt, or
  rear-tabard contact opens or tunnels; the long lower shell swallows the belt or
  hip articulation; the shell shows ring bands, faceting, a pinched waist,
  inverted normals, open caps, bevel defects, or asymmetric highlights; any
  unchanged object, landmark, publication, camera, or material moves; export or
  validation fails; or the movement cannot be attributed to the complete
  one-shell replacement.

## Result

- Baseline distance: `0.8642787827972389`
- Candidate distance: `0.8629897332507488`
- Absolute delta: `-0.0012890495464901`
- Relative delta: `-0.0014914724276474` (`-0.1491%`)
- Baseline report SHA-256: `76011f5940dede0265793290b3f4a041c4caaa3301e661b25bb7b15ff109e794`
- Candidate report SHA-256: `be46619b0d09fc3ea2ef6e67718d27cc1ca5d0262bc3ea4a6d84d61567406687`
- Progress frame: `experiments/progress/0086-longline-torso-shell.png`
- Decision: Reject. The aggregate, structure, rear, improved-view count, and
  per-view bounds pass, but the shell triggers the registered featureless egg
  and rubber-tunic visual gates. A neural/structural gain cannot retain a less
  articulated production form.

## Diagnostics and visual review

Mean component deltas are global neural `-0.0039658174`, material appearance
`-0.0031124159`, structure `-0.0157585110`, region neural `+0.0125798881`,
silhouette `+0.0085955710`, and landmarks `0`. The intended structural movement
is real, but the loss of local torso segmentation is also visible in the
region-neural and silhouette regressions.

Per-view deltas are back `-0.0000409119`, back-left `-0.0032811878`, back-right
`-0.0001799574`, front `+0.0051747930`, front-left `-0.0090264942`, front-right
`-0.0063099370`, left `+0.0131775079`, and right `-0.0090822086`. Six views
improve and rear-three improves, while the strict left profile remains within
the registered `.016` bound.

All eight candidate beauties and ID passes were reviewed at full resolution.
The mesh is closed, seated beneath the gorget, overlaps the belt, preserves the
strap/equipment order, and has no visible normal, bevel, or export defect.
Nevertheless, front and both diagonals replace a readable breastplate with one
uninterrupted smooth value field. Back and both profiles are even clearer: the
body becomes a long featureless egg/tunic with no forged plate construction.
The candidate is mechanically clean but semantically worse armour.

## Protocol reflection

The readiness funnel saved two formal failures, but a candidate that barely
clears the scalar can still pass screening while violating surface-language
requirements. Future broad torso work must be authored with plate-specific
topology and deliberate large-scale breaks, not another smooth ring loft. The
cardinal target proposal also uses coarse height-based repairs absent from the
cleaner diagonal proposal; that fixed annotation noise cancels in this paired
torso comparison, but fine cardinal limb/material deltas are not trustworthy and
must not drive later local experiments.

## Next question

Build a versioned consistency repair for cardinal target ownership before any
fine limb/material experiment; meanwhile, rank a different broad subsystem whose
target segmentation is coherent across the diagonal views.
