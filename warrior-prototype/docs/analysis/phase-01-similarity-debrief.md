# Warrior similarity phase 01 -- debrief

Phase 01 ran 73 controlled asset experiments against the `rigid-v1` concept
turnaround. It improved the accepted distance from `0.8229677371` to
`0.6740783861`, but it also established that the original search space and
metric have reached their useful limit.

This document owns the durable interpretation. The compact full ledger and
machine-readable results are retained under
[`experiments/archive/phase-01`](../../experiments/archive/phase-01/README.md).

## Outcome

| checkpoint | accepted distance | share of retained improvement |
| --- | ---: | ---: |
| initial baseline | `0.822968` | -- |
| 0001 -- mirrored equipment | `0.731836` | 61% |
| 0008 -- sword blade angle | `0.703341` | 80% |
| 0014 -- compact belt | `0.691399` | 88% |
| 0032 -- pauldron-hoop ablation | `0.674078` | 100% |

Thirteen of 73 candidates were accepted. All thirteen occurred by experiment
0032: acceptance was 13/32 through that point and 0/41 afterward. The final 41
experiments did not merely slow down; they left the accepted source completely
unchanged.

The `<= 0.10` target was not calibrated against variation between acceptable
renders or against inconsistency between the two concept sheets. It is not a
credible stopping criterion for formula v1. A new threshold must follow a
reference-floor and human-ranking calibration rather than inherit the arbitrary
scale.

## What worked

Large, exposed, semantically legible corrections produced nearly all retained
progress:

- 0001 fixed the sword/shield handedness and gained `0.091131`.
- 0007 and 0008 corrected the shield and sword projections and gained
  `0.015971` and `0.007994`.
- 0014 removed the oversized waist puck and gained `0.011942`.
- Broad, isolated material hierarchy changes succeeded for steel, boots,
  cuirass ridges, and leather.
- Removing a repeated toy motif was more reliable than replacing it with more
  primitives: 0032's pauldron-hoop ablation gained `0.002279` after layered
  ellipsoid caps failed.

The immutable snapshots and all-eight-view production review also prevented
real metric exploits. Several candidates improved by more than the decision
margin while visibly becoming spikes, beads, plaques, tubes, or toy blocks.
Those rejections were correct.

## Why progress stopped

### The authoring vocabulary is exhausted

The accepted generator builds anatomy and armour primarily from UV spheres,
cylinders, cones, tori, boxes, and flat prisms. The target uses fitted anatomy,
layered plate, irregular overlaps, chainmail, wear, and deliberate contact.
Later experiments repeatedly changed literals without changing that vocabulary:

- spheres became hair beads, elbow beads, mittens, or button ears;
- cones became crowns and quills;
- prisms became pouches, paddles, badges, fins, and miniature shields;
- tori became donuts, inner tubes, and shelf-like belts;
- smooth lofts became eggs, rubber hoses, and painted sleeves;
- hard facets became gemstones and conspicuous low-poly balloons.

The same regions were reopened under nominally different hypotheses -- arms,
hands, rear hair, pauldrons, and waist armour in particular -- while retaining
the same representational family. More coordinate search cannot bridge the
remaining gap.

### The objective is too coarse to guide local work

Formula v1 scores each view as 20% silhouette, 25% parts, 15% landmarks,
20% DreamSim, 10% LPIPS, and 10% palette/texture, then combines 75% view mean
with 25% worst view. It remains useful as a broad regression signal, but several
properties make it a poor optimizer for the remaining work:

1. There are only five semantic classes. Cuirass, pauldron, arm, hand, belt,
   thigh, knee, and boot are all `body_armour`, so a wrong hand can trade against
   unrelated torso pixels.
2. Reference and candidate images derive independent foreground bounding boxes.
   An extremal hair, boot, shield, or sword edit can rescale every canonical
   pixel and landmark.
3. Ignored tabard pixels are cleared after rendering. They leave background
   holes rather than revealing the armour the cloth occluded, and the ignored
   class still occupies dead weight in the part average.
4. Whole-character DreamSim and LPIPS dilute small regions. LPIPS downsamples
   the complete image to 256 x 256, making hands, mail, trim, and facial detail
   tiny or subpixel.
5. The palette/texture term compares only whole-foreground Lab mean, spread, and
   one average Sobel magnitude. It does not know which material owns a pixel or
   whether the texture resembles mail, scratched steel, leather, skin, or hair.
6. A hard maximum and a fixed `0.001` margin make sensitivity depend on affected
   view count and pixel area. They are not calibrated perceptual thresholds.

The accepted model's mean palette/texture distance is only about `0.199` even
though its smooth constant materials are plainly unlike the weathered target.
That is direct evidence that the texture term prices the most obvious remaining
gap too cheaply.

### The protocol mixed useful rigor with false precision

The one-theme boundary and immutable preregistration made results reproducible,
but the formal experiment became the first time many geometries were seen.
Predictable buttons, fins, pouches, and tubes consumed full neural renders before
failing production review.

Some gates also rejected useful evidence. Experiment 0057 is the clearest false
negative: its fitted belt was visually coherent, improved the aggregate by
`0.005238`, and improved all six component means. It was rejected because only
three views improved, even though the two exposed profiles improved by an order
of magnitude more than the small occluded-view regressions. Exposure-weighted
means and bounded spill would have represented the hypothesis better than a raw
sign count.

Conversely, seven post-0032 candidates cleared the aggregate margin while
failing obvious production vocabulary. A single scalar cannot replace a
separate production-coherence decision.

### The references may not describe one attainable object

Cardinal and diagonal views come from separate generated sheets. Pose,
perspective, equipment projection, and small construction details can disagree.
One rigid 3D asset cannot independently satisfy inconsistent 2D projections.
The nearly disjoint shield and sword masks in several rear/profile views must be
audited as registration and reference-consistency problems before another local
equipment edit is selected.

## Direction for phase 02

Phase 02 changes both measurement capacity and authoring capacity before it
resumes formal asset experiments.

### Hierarchical residual atlas

Create manually reviewed visible-region masks for all eight targets. Vision or
an automatic segmenter may propose boundaries, but a person must correct the AI
artwork's ambiguous overlaps. Regions should include head skin, hair/beard,
gorget, front/rear cuirass, left/right pauldron, upper-arm underlayer, vambrace,
gauntlet, belt/waist, thigh, knee, greave/boot, shield field/rim/boss, and sword
blade/hilt.

Render matching candidate region IDs from object names. For each view and
visible region, retain area, IoU, boundary distance, centroid, bounding box,
orientation, local DreamSim/LPIPS, material-conditioned colour/texture, and
contact relationships. Produce signed boundary and masked-beauty residuals plus
a view-by-region atlas.

Use the atlas diagnostically:

- boundary/centroid error in adjacent views means geometry, pose, or scale;
- one-view agreement with neighboring-view failure means depth/orientation;
- aligned masks with high low-frequency appearance error means material,
  normals, or lighting;
- aligned low-frequency appearance with high-frequency error means texture;
- incorrect hand/equipment or armour/joint contact means assembly work even if
  global IoU improves.

### Formula v2 calibration

Preserve formula v1 and its archive. Formula v2 should use fixed per-view
registration, visible hierarchical parts, corrected ignored-object rendering,
part-local perceptual crops, and material-conditioned multiscale texture terms.
It should report both a global score and the affected-region score with
unaffected-region spill.

Rescore the complete historical archive. Calibrate component scales, weights,
and the acceptance margin against blinded human A/B rankings, including
accepted improvements and numeric-but-visual failures. Keep held-out feature
families so the metric cannot merely memorize the candidates used to fit it.
Similarity and production coherence remain separate gates.

### Authored geometry and export-parity textures

The next asset should use a real humanoid base and authored continuous armour
subsystems rather than increasingly complicated primitive helpers. Broad regions
are screened through multiple unscored turntable variants before one candidate
is preregistered.

UVs, tangents, and baked image textures become first-class export requirements.
Target materials include scratched dark steel, polished edge wear, mail or
quilted under-armour, worn leather, restrained shield decoration, skin
variation, and hair treatment. Texture scoring uses eroded material masks and
statistics or embeddings; it must not demand identical scratches from
cross-view-inconsistent concept art.

## Rules carried forward

- Do not resume primitive parameter sweeps simply to reach experiment 0100.
- Select work from the largest coherent, attainable residual across multiple
  views, not from the preceding record's `Next question`.
- Screen production variants before assigning a formal experiment ID.
- After two failures for one `(region, representation family)` pair, another
  attempt requires a new representation.
- Use exposure-weighted primary cells with bounded unaffected spill; do not use
  raw improved-view counts.
- Preserve both favorable and unfavorable evidence. A rejected bundled
  candidate may establish direction without validating its failed construction.
- Calibrate the next stopping threshold before restarting the autonomous loop.

