# Phase 01 full experiment ledger

This file preserves the complete text of the individual phase-01 records after
their consolidation. Headings are separated by horizontal rules; original source
and evidence hashes remain in each record and in `manifest.json`.

---

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
- Progress frame: [phase contact sheet](front-contact-sheet.png)
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

---

# 0002: Correct the global vertical aspect

Status: rejected

## Pre-registration

- Observation: the candidate is too squat in seven of eight fixed views. The
  reference silhouette height/width divided by the candidate ratio is `1.632`
  front, `1.296` front-left, `1.151` left, `1.785` back-left, `1.712` back,
  `1.420` back-right, `0.941` right, and `1.427` front-right. The median is
  `1.423`; the two worst-scoring views, back-left and back, are also the most
  vertically compressed.
- Hypothesis: applying the preregistered median factor as one floor-anchored
  Z-only transform to the complete authored assembly will reduce aggregate
  distance, principally through silhouette and landmark improvements.
- Change boundary: multiply every generated warrior object's world Z location
  and Z mesh coordinate by `1.423`, preserving the floor at `Z = 0`, and apply
  the identical factor to every published landmark Z coordinate. Do not change
  X/Y coordinates, local feature shapes relative to this transform, materials,
  lighting, cameras, references, annotations, or the metric.
- Expected movement: mean silhouette, landmarks, and body-armour parts improve;
  back-left, back, front, and front-right improve most; palette/texture remains
  effectively unchanged; the already-tall right view may regress.
- Reject if: aggregate improvement is less than `0.001`; mean silhouette fails
  to improve; fewer than six of eight silhouette components improve; back-left
  or back fails to improve; right regresses by more than `0.03`; both mean
  DreamSim and LPIPS regress by more than `0.02`; or the warrior looks
  implausibly stretched from any review angle.

## Result

- Baseline distance: `0.7318364544`
- Candidate distance: `0.7774841041`
- Absolute delta: `+0.0456476497`
- Relative delta: `+6.2374%`
- Baseline report SHA-256:
  `56e8384dfd6f2336c40f230772fab2ad801cd92e1153874f7f48d643333f47e7`
- Candidate report SHA-256:
  `d8a863a226d6f194efcfb9f178d3046ba6db6846a10d626e58c89de37e404aec`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: reject and revert. The score worsened well beyond the decision
  margin, every view regressed, and the fixed cameras visibly cropped the head.

## Diagnostics and visual review

Mean component movement (candidate minus baseline):

| Component | Baseline | Candidate | Delta |
| --- | ---: | ---: | ---: |
| DreamSim | 1.016794 | 1.140838 | +0.124044 |
| landmarks | 0.744061 | 0.790753 | +0.046692 |
| parts | 0.652331 | 0.689464 | +0.037133 |
| silhouette | 0.526200 | 0.562187 | +0.035986 |
| palette/texture | 0.236091 | 0.238557 | +0.002466 |
| LPIPS | 1.011809 | 1.005622 | -0.006186 |

Every view regressed: back `+0.040850`, back-left `+0.026739`, back-right
`+0.037886`, front `+0.051347`, front-left `+0.040630`, front-right `+0.073462`,
left `+0.051247`, and right `+0.061206`.

All eight beauty renders were inspected. The transform preserved attachment,
but pushed the crown beyond every fixed camera frame; the retained front image
therefore starts below the face. The visible result also stretched the head,
shield, belt, and plate details rather than producing human anatomy. Five of six
component means regressed, including the silhouette signal that motivated the
hypothesis. LPIPS's small isolated improvement is not a plausible reason to keep
the candidate.

## Protocol reflection

The height/width residual was real but did not identify a safe transform. A
global object transform changes the complete subject's camera occupancy before
metric canonicalization, so the fixed camera crop confounded the intended aspect
probe. More importantly, equal scaling of anatomy and rigid equipment cannot
correct internal human proportions. Future proportion experiments must remain
inside the accepted camera envelope and move one anatomical region while
keeping attached equipment coherent. The protocol correctly retained the
failed image: it makes this failure much more obvious than the aggregate alone.

## Next question

Test the visually dominant local cause without moving anchors: compact the
complete pauldron assemblies while leaving arms, torso, and landmarks fixed.

---

# 0003: Compact the pauldrons

Status: accepted

## Pre-registration

- Observation: the accepted render's spherical pauldrons and three bright rings
  dominate the upper-body silhouette, producing a toy-like shoulder width and
  circular profile. The reference uses lower, tighter layered shoulder plates.
- Hypothesis: shrinking the complete pauldron assemblies around their existing
  shoulder anchors will reduce aggregate distance by improving the body-armour
  silhouette and perceptual match without relying on landmark movement.
- Change boundary: change only each pauldron sphere from `(0.20, 0.17, 0.145)`
  to `(0.16, 0.145, 0.12)`; move and shrink its three decorative rings from a
  `0.15 - ridge * 0.012` major radius and `0.012` minor radius to
  `0.12 - ridge * 0.010` and `0.010`, with matching tighter offsets; move and
  shrink the two pauldron rivets to remain attached. Shoulder anchors, arms,
  torso, head, equipment, landmarks, materials, lighting, cameras, references,
  annotations, and metric remain fixed.
- Expected movement: silhouette, body-armour parts, LPIPS, and DreamSim improve;
  front, back, and diagonal views improve more than side views; landmarks and
  palette/texture remain effectively unchanged.
- Reject if: aggregate improvement is less than `0.001`, any ring or rivet is
  visibly detached, shoulders become implausibly under-armoured, or the score
  movement is dominated by an unexplained landmark or view regression.

## Result

- Baseline distance: `0.7318364556`
- Candidate distance: `0.7273066156`
- Absolute delta: `-0.0045298399`
- Relative delta: `-0.6190%`
- Baseline report SHA-256:
  `9a22ab5f8e08beb00b30b98a8c64185fddb745576a7810fe6b20fa34ac94ff1c`
- Candidate report SHA-256:
  `244d2a13c9806377bc50ebda9a24dd9a5d66d717b8adfd0ecfcde3c85c824064`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: accept. The perceptual improvement exceeds the decision margin,
  matches the intended visual change, and introduces no attachment defect.

## Diagnostics and visual review

Mean component movement (candidate minus baseline):

| Component | Baseline | Candidate | Delta |
| --- | ---: | ---: | ---: |
| DreamSim | 1.016794 | 0.981938 | -0.034856 |
| LPIPS | 1.011809 | 0.991587 | -0.020222 |
| parts | 0.652331 | 0.652391 | +0.000060 |
| landmarks | 0.744061 | 0.744762 | +0.000701 |
| silhouette | 0.526200 | 0.528411 | +0.002210 |
| palette/texture | 0.236091 | 0.239005 | +0.002914 |

Per-view movement:

| View | Baseline | Candidate | Delta |
| --- | ---: | ---: | ---: |
| front-left | 0.647994 | 0.621753 | -0.026241 |
| front-right | 0.650379 | 0.630471 | -0.019907 |
| back | 0.801081 | 0.787183 | -0.013898 |
| back-right | 0.744951 | 0.733891 | -0.011060 |
| front | 0.694777 | 0.690356 | -0.004421 |
| left | 0.651031 | 0.648863 | -0.002168 |
| right | 0.671332 | 0.677607 | +0.006275 |
| back-left | 0.803103 | 0.809404 | +0.006300 |

All eight beauty renders were inspected. The rings and rivets remain attached,
the arms still meet the shoulder volumes, and the upper body reads less like two
large spheres. Six views improve, led by both front diagonals; the two opposite
diagonals regress only modestly. The original expectation that mask silhouette
and part overlap would lead the gain was wrong: both are essentially flat to
slightly worse. DreamSim and LPIPS instead account for the accepted movement,
which is causally plausible because the change replaces a visually dominant
toy-like feature while preserving all semantic anchors.

## Protocol reflection

This experiment refines the meaning of a successful local shape change. A
semantically correct feature can improve neural perceptual components without
improving coarse polygon masks; preregistration should name both possibilities
instead of treating silhouette as a necessary proxy for visual quality. The
opposite diagonal regressions also show that symmetric geometry does not imply
symmetric image-space effects when shield and sword occlusion are asymmetric.
Future experiments should predict occluded and exposed sides separately.

## Next question

The shield remains thick, boss-heavy, and displaced outward. Test the complete
shield outline and rigid pose as one assembly, with separate expectations for
exposed front/diagonal views and occluded rear/side views.

---

# 0004: Correct the shield profile

Status: rejected
## Pre-registration

- Observation: the accepted shield remains short, thick, boss-heavy, and offset
  outward. In the exposed front view its landmark errors are `1.009` top,
  `1.090` outer, and `0.738` bottom, with shield-part distance `0.780`;
  front-left is similarly poor. Side and rear projections are less compatible
  with a single rigid planar shield, so exposed and occluded views need separate
  expectations.
- Hypothesis: translating the complete shield `0.10` inward and `0.20` up,
  scaling its outline `1.05` horizontally about `x = 0.63` and `1.10`
  vertically about `z = 0.92`, and reducing its slab depth will improve the
  exposed shield overlap and perceptual match enough to lower aggregate distance.
- Change boundary: replace only the outer shield points with
  `[(0.6875,1.560),(0.3830,1.604),(0.2780,1.395),(0.3200,0.966),`
  `(0.5090,0.636),(0.7295,0.966),(0.7925,1.340)]` and depth `0.045`;
  replace the inner points with
  `[(0.6560,1.516),(0.4145,1.549),(0.3305,1.362),(0.3725,0.999),`
  `(0.5090,0.735),(0.6770,0.999),(0.7295,1.318)]` and depth `0.022`;
  move the boss to `(0.530,-0.39,1.230)` with scale
  `(0.110,0.030,0.116)`; move the six rivets to the registered transformed
  centres and scale `(0.019,0.008,0.020)`; and transform the three published
  shield landmarks to top `(0.5405,-0.39,1.604)`, outer
  `(0.7925,-0.34,1.296)`, and bottom `(0.509,-0.34,0.636)`. Shield Y pose,
  arms, body, sword, materials, cameras, references, annotations, and metric
  remain fixed.
- Expected movement: shield parts, shield landmarks, silhouette, LPIPS, and
  DreamSim improve most in front and front-left; front-right and right improve
  less; back, back-left, back-right, and left may be flat or modestly worse due
  to rigid-shield occlusion.
- Reject if: aggregate improvement is less than `0.001`; exposed front or
  front-left shield-part or shield-landmark means regress; the shield intersects
  torso or ground; a rivet detaches; or an occluded-view regression overwhelms
  the exposed-view gain without a plausible projection explanation.

## Result

- Baseline distance: `0.7273066104`
- Candidate distance: `0.7122740257`
- Absolute delta: `-0.0150325848`
- Relative delta: `-2.0669%`
- Baseline report SHA-256:
  `00d899245d2188f5609f888b61fe61d39c9d07bf91f3ab5cc1cd608a671bd596`
- Candidate report SHA-256:
  `b0bf70b7df767d977bd13201dd48e970e44d24f0cdf3e771baf2e733a4a22eb6`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: reject and revert. The strong measured gain does not override the
  preregistered rejection condition: several rivets visibly detached from the
  newly thinned shield face.

## Diagnostics and visual review

Mean component movement (candidate minus baseline): landmarks `-0.019386`,
parts `-0.030396`, silhouette `-0.014850`, DreamSim `-0.001876`, LPIPS
`+0.004403`, and palette/texture `+0.001394`. The front improved `-0.064679`
and front-left improved `-0.053585`, while back-left and left also improved.
Back, back-right, front-right, and right regressed, led by back-right
`+0.018792` and right `+0.016013`; that exposed/occluded split matches the
preregistration.

All eight beauty views and their mask overlays were reviewed. The taller,
inboard shield is visibly closer in the exposed front views and the gains in
shield parts, landmarks, and silhouette causally explain the aggregate drop.
However, the thinner slab increased the Y gap between the shield face and its
rivets. Multiple studs visibly float at front-left, front-right, and the side
views. That is a registered geometric defect, so this otherwise promising
candidate cannot become the accepted state.

## Protocol reflection

The experiment bundled outline, placement, thickness, and attached hardware as
one assembly, but the failure came from the depth sub-change while the image
evidence strongly supports the X/Z profile. The next shield trial should reuse
the successful X/Z transform while preserving enough slab depth and placing
boss and rivets directly against the actual front face. This is a concrete case
where a lower aggregate is correctly rejected by the visual gate.

## Next question

Repeat the registered shield X/Z profile with baseline slab depths and attach
boss and rivets to the transformed face instead of preserving their old Y plane.

---

# 0005: Keep the shield profile with attached hardware

Status: rejected
## Pre-registration

- Observation: rejected experiment 0004 improved the aggregate by `0.015033`
  and strongly improved exposed shield parts, landmarks, and silhouette, but its
  reduced depth left several rivets visibly floating. The X/Z profile was
  promising; the Y attachment failed.
- Hypothesis: repeating 0004's registered X/Z shield profile while retaining
  the accepted slab depths and seating boss and rivets directly against the
  field face will preserve most of the measured gain without the visual defect.
- Change boundary: use 0004's exact outer and inner X/Z points and three shield
  landmarks; retain accepted outer depth `0.070`, inner depth `0.035`, and their
  Y locations; move the boss to `(0.530,-0.388,1.230)` with scale
  `(0.110,0.030,0.116)`; move rivets to 0004's six registered X/Z centres at
  `y = -0.370` with accepted scale `(0.018,0.012,0.018)`. Arms, body, sword,
  materials, cameras, references, annotations, and metric remain fixed.
- Expected movement: retain 0004's large front and front-left shield-part,
  landmark, and silhouette gains; score near or below `0.712274`; occluded views
  may regress modestly; attached hardware should improve oblique perceptual
  components relative to 0004.
- Reject if: aggregate improvement from the accepted baseline is less than
  `0.001`; any boss or rivet remains visibly detached; front or front-left
  shield diagnostics regress relative to the accepted baseline; the shield
  intersects the torso; or unexplained occluded-view damage overwhelms the
  exposed-view gain.

## Result

- Baseline distance: `0.7273066102`
- Candidate distance: `0.7130326888`
- Absolute delta: `-0.0142739214`
- Relative delta: `-1.9626%`
- Baseline report SHA-256:
  `bba9f678b85fa878b8fc61fa746a5aed6a53d3dc7b3ee79f5d97a51629ca8882`
- Candidate report SHA-256:
  `14afa1152fe4af73cbcb161eeccb3cd76e9a81957d857a3fca89a38cb3b44127`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: reject and revert. The profile again produced a strong metric gain,
  but inset depth alone did not fix the preregistered detached-hardware defect.

## Diagnostics and visual review

Parts improved `-0.030250`, landmarks `-0.019394`, and silhouette
`-0.014708`; DreamSim was nearly flat `+0.000513`, LPIPS regressed `+0.006592`,
and palette/texture regressed `+0.002255`. Front improved `-0.063220` and
front-left `-0.052187`. Back-left and left also improved, while back,
back-right, front-right, and right regressed as predicted for occluded views.

All eight beauty views and mask overlays were reviewed. Boss depth is coherent
and the shield remains clear of torso and ground. However, the lower-tip and
upper-edge rivets are still visibly separated from the beveled X/Z field in
front, front-left, front-right, and side views. The failure is therefore not
primarily Y seating: transformed vertex placement leaves the hardware beyond
the visible field boundary. The explicit no-detachment rule requires rejection.

## Protocol reflection

Changing one attachment axis was a useful refinement but insufficient. The next
trial must inset rivet X/Z positions toward the field centre as well as seat them
against the front face. The repeated score gain now provides strong evidence
for preserving the shield profile while isolating hardware attachment.

## Next question

Repeat the shield profile with seven rivets inset from every outer vertex toward
the field centre, preserving the accepted slab depths and proven boss seating.

---

# 0006: Inset the shield rivets

Status: rejected
## Pre-registration

- Observation: experiments 0004 and 0005 repeatedly showed that the taller,
  inboard shield profile lowers distance by about `0.014` to `0.015`, but both
  were rejected because edge-derived rivet positions visibly floated beyond the
  beveled field. Experiment 0005 established that Y seating alone is insufficient.
- Hypothesis: retaining the proven shield profile while placing one rivet for
  every outer vertex `15%` toward field centre `(0.53,1.20)` will keep all
  hardware visibly on the shield and preserve the profile's metric gain.
- Change boundary: apply 0005's exact outer/inner X/Z points, landmarks, accepted
  slab depths, and boss `(0.530,-0.388,1.230)` scale `(0.110,0.030,0.116)`;
  replace the rivets with seven centres
  `[(0.6639,1.5060),(0.40505,1.5434),(0.3158,1.36575),`
  `(0.3515,1.0011),(0.51215,0.7206),(0.699575,1.0011),`
  `(0.753125,1.3190)]` at `y = -0.370`, each scale
  `(0.018,0.012,0.018)`. No other geometry, material, camera, reference,
  annotation, or metric changes.
- Expected movement: front and front-left retain approximately `0.05` to `0.06`
  view gains through shield parts, landmarks, and silhouette; aggregate falls
  below `0.715`; perceptual components improve slightly over 0005 because studs
  no longer float; occluded views may regress as before.
- Reject if: aggregate improvement is less than `0.001`; any rivet or boss is
  visibly detached in any of all eight views; exposed shield diagnostics regress
  from the accepted baseline; the shield intersects torso/ground; or occluded
  regressions lack the projection explanation established by 0004 and 0005.

## Result

- Baseline distance: `0.7273066156`
- Candidate distance: `0.7138886920`
- Absolute delta: `-0.0134179237`
- Relative delta: `-1.8449%`
- Baseline report SHA-256:
  `bc6f4319c38796ced422c812afa92c125c4dfdd58a0be6c9b7ebcd3e17ec2bc6`
- Candidate report SHA-256:
  `5b3d7ebfe52fd5b07825c18c2f2aff26ca0badb43564ec0db6e7827a59be620a`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: reject and revert. X/Z inset reduced the visible separation but did
  not satisfy the preregistered requirement that every rivet read as attached.

## Diagnostics and visual review

Parts improved `-0.029957`, landmarks `-0.018131`, silhouette `-0.010668`,
and DreamSim `-0.000952`; LPIPS regressed `+0.002482` and palette/texture
regressed `+0.002271`. Front improved `-0.063912`, front-left `-0.048649`,
back-left `-0.017498`, and left `-0.003102`. Back-right and right again carried
the largest occluded-view regressions.

All eight beauty views and mask overlays were reviewed. The seven studs now
follow the shield outline more evenly and the bottom stud no longer hangs below
the tip. Nevertheless, the upper-right and outer-side studs remain visibly
separate from the field in front-right and right views because their shallow Y
offset projects beyond the planar edge. The profile remains visibly better, but
the explicit all-view attachment condition is not met.

## Protocol reflection

Three trials establish that bright perimeter hardware is a fragile detail on a
single planar shield: thickness, Y seating, and modest X/Z inset each leave an
oblique-view artifact. The highest-value next test is removal, not further
micro-tuning. If the profile without studs keeps the gain, later surface detail
can be reintroduced as field-embedded geometry rather than edge spheres.

## Next question

Retain the proven shield profile and boss but remove all perimeter rivets as one
decorative-hardware ablation.

---

# 0007: Remove perimeter rivets from the shield profile

Status: accepted
## Pre-registration

- Observation: experiments 0004 through 0006 consistently improved distance
  by `0.0134` to `0.0150` with the same shield profile, but every edge-sphere
  placement produced visible oblique detachment. The reference's shield border
  is dark and its fasteners are subtle compared with the candidate's bright studs.
- Hypothesis: retaining the proven shield profile and seated boss while omitting
  perimeter rivets will preserve the large shape/landmark gain, remove the
  attachment artifact, and improve perceptual/palette components relative to
  the three rejected candidates.
- Change boundary: apply 0005's exact outer and inner points, accepted slab
  depths, three transformed landmarks, and boss `(0.530,-0.388,1.230)` scale
  `(0.110,0.030,0.116)`; create no `shield_rivet_*` geometry. Every other body,
  weapon, material, camera, reference, annotation, and metric input remains fixed.
- Expected movement: aggregate falls below `0.715`; front/front-left retain the
  proven shield parts, landmarks, and silhouette gains; DreamSim, LPIPS, and
  palette/texture improve relative to 0005/0006 because bright floating studs
  disappear; occluded-view regressions remain bounded and explicable.
- Reject if: aggregate improvement is less than `0.001`; the rivetless border
  looks unfinished or materially less like the reference; shield/body geometry
  intersects; front or front-left diagnostics regress from accepted baseline;
  or an unmeasured visual defect outweighs the causally explained score gain.

## Result

- Baseline distance: `0.7273066197`
- Candidate distance: `0.7113352111`
- Absolute delta: `-0.0159714087`
- Relative delta: `-2.1960%`
- Baseline report SHA-256:
  `ccd89b942d7081002845fa19fd32437cad75b1c996edf76270bde7571979f102`
- Candidate report SHA-256:
  `dfd581e5504e55cb6ed562ee3a357c55d714acff67af235d893a2dfc34583af0`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: accept. This is the largest shield-profile improvement, every
  visible attachment defect is gone, and the component/view movement matches
  the repeated causal evidence from 0004 through 0006.

## Diagnostics and visual review

Parts improved `-0.030748`, landmarks `-0.019466`, silhouette `-0.018642`,
and LPIPS `-0.005987`. DreamSim regressed slightly `+0.001436` and
palette/texture regressed `+0.003527`. Front improved `-0.066611`, front-left
`-0.050402`, back-left `-0.023261`, left `-0.007686`, and front-right was flat
to slightly better. Back-right and right retained the known rigid-projection
regressions, while back was effectively flat.

All eight beauty views and mask overlays were reviewed. The shield remains
clear of torso, arm, and ground; the boss is seated; the border reads as a clean
dark reinforced rim rather than unfinished geometry. Removing the bright studs
eliminates every floating artifact seen in 0004 through 0006. The strong exposed
parts/landmark/silhouette improvements are visually obvious and causally explain
the aggregate gain. The modest occluded-view regressions were preregistered and
do not damage geometric coherence.

## Protocol reflection

The three rejected precursors were productive rather than wasted: they isolated
the accepted feature into a stable profile plus boss and disproved edge spheres
as suitable planar-shield hardware. Repeating a promising rejected geometry
with one narrower correction preserved causal attribution and ultimately found
a valid state. Future records should distinguish structural profile from
surface decoration earlier when oblique projection can separate them.

## Next question

The sword remains almost vertical while the front and diagonal references show
a strong inward/downward blade angle; test the complete blade endpoint and
published sword-tip landmark without moving the hilt or hand.

---

# 0008: Angle the sword blade inward

Status: accepted
## Pre-registration

- Observation: the accepted sword blade descends nearly vertically and slightly
  outward from its hilt. In the front reference the blade instead descends
  strongly inward: the annotated tip is about `99` crop pixels to the right of
  the hilt. Sword part distance remains `1.0` in most views and the front tip
  landmark error is about `1.5`.
- Hypothesis: moving only the blade endpoint from `x = -0.66` to `x = -0.20`
  at the same height will reproduce the target front angle and reduce sword
  landmark, part, silhouette, and perceptual distances.
- Change boundary: change `sword_blade` endpoint from `(-0.66,0.08)` to
  `(-0.20,0.08)` and published `sword_tip` from `(-0.66,-0.31,0.08)` to
  `(-0.20,-0.31,0.08)`. Hilt, guard, grip, pommel, hand, body, shield,
  materials, cameras, references, annotations, and metric remain fixed.
- Expected movement: largest improvements in front, front-left, front-right,
  and right through sword parts and tip landmark; back projections may be mixed
  because the reference often occludes the blade; canonical subject bounds may
  shift slightly when the endpoint moves inward.
- Reject if: aggregate improvement is less than `0.001`; the blade crosses a
  leg or tabard implausibly; hilt/blade contact breaks; exposed front sword parts
  or tip landmark regress; or occluded-view regressions overwhelm the directly
  explained front gain.

## Result

- Baseline distance: `0.7113352094`
- Candidate distance: `0.7033412780`
- Absolute delta: `-0.0079939314`
- Relative delta: `-1.1238%`
- Baseline report SHA-256: `62c3f674cb87de2ac1ff60ee2aca88f4a3c02b31af310d557215d78df8a3edeb`
- Candidate report SHA-256: `0c5842b663c71f4dbab8a77725e406f92977cbb3b469a1159f152cee4805c27f`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: accepted. The candidate clears the numeric threshold and the
  complete blade remains connected to the guard and clear of the legs and
  tabard in all eight fixed views.

## Diagnostics and visual review

All eight fixed views were reviewed. Seven improved: front `-0.018623`,
front-left `-0.020392`, left `-0.003983`, back-left `-0.007610`, back
`-0.005331`, back-right `-0.020624`, and right `-0.008232`. Front-right
regressed `+0.013744`, but the registered exposed-front and aggregate gains
outweigh it. Landmarks improved `-0.040513` and silhouette `-0.017252`;
parts improved slightly `-0.000507`. LPIPS (`+0.004237`), DreamSim
(`+0.001282`), and palette/texture (`+0.000924`) moved slightly against the
candidate, consistent with a simple low-detail blade moving through the
canonical crop.

## Protocol reflection

The large landmark and silhouette response confirms that equipment pose is a
high-leverage early variable, but the nearly flat part score shows that angle
alone does not make the blade resemble the reference mesh. Future sword work
should change blade proportions or cross-section separately. The front-right
regression also confirms that every rigid endpoint edit must retain the
all-view gate even when its motivating view is strongly positive.

## Next question

Can a single rear crossed-harness assembly reduce the two worst rear-view
perceptual residuals without changing the already improved silhouette or
landmarks?

---

# 0009: Add the rear crossed harness

Status: rejected
## Pre-registration

- Observation: the accepted candidate has a blank rounded back in back,
  back-left, and back-right, while both rigid reference sheets show two broad
  leather straps crossing over the rear cuirass. Back and back-left remain the
  two highest accepted view distances at `0.783069` and `0.778533`.
- Hypothesis: adding one surface-following crossed leather harness will reduce
  rear perceptual, palette/texture, and body-armour part distances without
  changing the established silhouette or landmarks.
- Change boundary: add four leather segments of radius `0.026`: two from
  `(-0.24,0.10,1.43)` and `(0.24,0.10,1.43)` to `(0,0.20,1.22)`, then from
  that crossing to `(0.22,0.13,1.02)` and `(-0.22,0.13,1.02)` respectively.
  Do not add rivets or change the torso, front strap, equipment, anatomy,
  materials, cameras, references, annotations, or metric.
- Expected movement: strongest improvement in back, back-left, and back-right
  through LPIPS, DreamSim, palette/texture, and body-armour parts; front should
  be effectively flat and side views may move slightly where strap edges become
  visible. Silhouette and landmarks should be effectively unchanged.
- Reject if: aggregate improvement is less than `0.001`; either strap visibly
  floats above or sinks into the cuirass; the crossing is not legible in all
  three rear views; front changes materially; or unexplained view/component
  regressions outweigh the registered rear gain.

## Result

- Baseline distance: `0.7033412780`
- Candidate distance: `0.7010389871`
- Absolute delta: `-0.0023022909`
- Relative delta: `-0.3273%`
- Baseline report SHA-256: `f780be3f7dda507c10e9d967eebf4a3e7dc8e50d1414a8caddb1970ec9224fce`
- Candidate report SHA-256: `d8228107043ec1630517090b772e4066e8612ad73285e39936a35a30d8fd4f02`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: rejected. The numeric improvement cleared the margin, but the
  curved cuirass buried most of each straight strap and left disconnected
  leather fragments rather than a legible crossed harness.

## Diagnostics and visual review

All eight fixed views were reviewed. Back (`-0.005394`) and back-left
(`-0.005746`) improved as registered; back-right was flat (`-0.000031`), left
improved slightly (`-0.000313`), right regressed `+0.001312`, and the four
front-facing views were effectively unchanged. LPIPS improved `-0.009274` and
DreamSim `-0.001894`; landmarks were identical and parts/silhouette were flat.
Despite the plausible diagnostic movement, back, back-left, and back-right all
show only isolated strap tips and a small four-lobed crossing because the
straight cylinders pass through the rounded torso volume.

## Protocol reflection

The metric rewarded the added rear leather colour and local edges even though
the intended object was not visually coherent, demonstrating why the visual
gate cannot be replaced by the numeric margin. A constant- or piecewise-depth
line is insufficient for a strongly curved ellipsoid. Future rear surface
details should be seated on a planar rear plate or authored as conforming mesh
strips; endpoint sampling alone does not keep the middle of a straight segment
above the surface.

## Next question

Can reducing only the torso's sagittal depth improve the side and rear-diagonal
silhouettes while providing a less spherical foundation for a later rear plate?

---

# 0010: Reduce torso depth

Status: rejected
## Pre-registration

- Observation: the accepted torso reads as a near-spherical barrel in both side
  and rear-diagonal views, unlike the flatter layered plate profile in the
  references. Right still has DreamSim near `1.17`, and back/back-left remain
  the worst aggregate views.
- Hypothesis: reducing only sagittal depth of the two torso support volumes will
  make the body read as human plate armour and improve side and diagonal
  silhouette and perceptual distances without changing frontal width or
  anatomical anchors.
- Change boundary: change `padded_torso` scale from `(0.34,0.20,0.40)` to
  `(0.34,0.155,0.40)` and `cuirass_mass` scale from `(0.36,0.205,0.39)` to
  `(0.36,0.165,0.39)`. Keep their centres and every plate, belt, limb,
  equipment item, material, landmark, camera, reference, annotation, and metric
  fixed.
- Expected movement: largest improvements in left, right, back-left, and
  back-right through silhouette, body-armour parts, LPIPS, and DreamSim;
  front/back should be modest or flat because width and height are fixed.
  Landmarks and palette/texture should be unchanged.
- Reject if: aggregate improvement is less than `0.001`; a gap opens behind the
  breastplate, gorget, shoulders, belt, or faulds; either back or back-left
  materially regresses; the body appears implausibly thin; or component/view
  movement is inconsistent with a depth-only change.

## Result

- Baseline distance: `0.7033412780`
- Candidate distance: `0.7050134711`
- Absolute delta: `+0.0016721930`
- Relative delta: `+0.2377%`
- Baseline report SHA-256: `9c1c083778a16539c06d3d877308948b1c860100fe2a8e1d863ef575014606d1`
- Candidate report SHA-256: `2c458bbd884a4420933fdba1a1b2664c6093979ef078551b5bb89f5d0a0a98c2`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: rejected. The candidate remained mechanically coherent, but the
  aggregate regressed and the predicted side and rear-diagonal improvements did
  not occur.

## Diagnostics and visual review

All eight fixed views were reviewed. Back improved slightly (`-0.000844`) and
front was nearly flat (`-0.000347`), but back-left (`+0.001411`), back-right
(`+0.002140`), front-left (`+0.001644`), front-right (`+0.001950`), left
(`+0.005907`), and right (`+0.008226`) all regressed. DreamSim worsened
`+0.005876`, silhouette `+0.003510`, parts `+0.002323`, and LPIPS `+0.001057`;
only palette/texture improved slightly. No gaps opened at the breastplate,
gorget, shoulders, belt, or faulds, but the side profiles became less similar
to the reference under the fixed cameras.

## Protocol reflection

The subjective barrel impression was not a safe isolated lever. The current
depth evidently compensates for the candidate's broad, short anatomy and fixed
equipment occlusion, so a depth reduction exposed more background without
matching the target silhouette. A later torso proportion experiment must change
width/height or plate shape under a separately registered hypothesis rather
than assuming a thinner side profile is intrinsically closer.

## Next question

Can a planar rear cuirass plate improve the blank rear surface while remaining
fully seated on the accepted torso and leaving its compensating silhouette
unchanged?

---

# 0011: Add a planar rear cuirass plate

Status: rejected
## Pre-registration

- Observation: the accepted back and rear diagonals show a large uninterrupted
  spherical cuirass, while the references show an angular, panelled rear plate.
  Back and back-left remain the two worst accepted views at `0.783069` and
  `0.778533`; experiment 0009 also showed that straight surface details cannot
  remain legible directly on the curved mass.
- Hypothesis: adding one thin angular rear plate seated tangentially on the
  accepted cuirass will improve rear body-armour and perceptual distances while
  retaining the compensating torso silhouette established by experiment 0010.
- Change boundary: add one steel prism named `rear_cuirass` with points
  `[(-0.29,1.43),(0,1.49),(0.29,1.43),(0.27,1.08),(0.14,0.98),
  (-0.14,0.98),(-0.27,1.08)]`, depth `0.050`, bevel `0.025`, and location
  `y = 0.215`. Do not change the torso volumes, existing front plate/strap,
  limbs, equipment, materials, landmarks, cameras, references, annotations, or
  metric; do not add seams, straps, or rivets in this experiment.
- Expected movement: strongest improvements in back, back-left, and back-right
  through DreamSim, LPIPS, and body-armour parts; palette/texture may move
  slightly and front views should remain flat. Silhouette and landmarks should
  be effectively unchanged because the plate is inside the existing outline.
- Reject if: aggregate improvement is less than `0.001`; the plate floats,
  clips the gorget or belt, or peeks around the torso in side/front views; back
  or back-left regresses; mean silhouette changes more than `0.003`; or the
  diagnostic movement cannot be explained by the registered rear plate.

## Result

- Baseline distance: `0.7033413305`
- Candidate distance: `0.7022929608`
- Absolute delta: `-0.0010483697`
- Relative delta: `-0.1491%`
- Baseline report SHA-256: `cce03515d092c5a66be8934df5546f0acbac21cb1c019be400051db163fc3cfb`
- Candidate report SHA-256: `a908d0c454ac3f78caff95c5a194755a511d3e4096338aed43051ab727bb4369`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: rejected. The score narrowly cleared the numeric margin, but the
  plate visibly separates from the curved torso and reads as a backpack or a
  second shield in the rear diagonals and sides.

## Diagnostics and visual review

All eight fixed views were reviewed. Back improved `-0.002817`, back-left
`-0.000613`, right `-0.003476`, and front `-0.001011`; back-right regressed
`+0.002096`, front-right `+0.001582`, left `+0.000606`, and front-left was flat.
LPIPS (`-0.006741`), silhouette (`-0.002907`), parts (`-0.001426`), and
palette/texture (`-0.000746`) improved, while DreamSim regressed `+0.006139`
and landmarks were unchanged. The plate is clean from front, but its straight
plane visibly bridges the rounded back and leaves detached side edges in every
rear-oblique view.

## Protocol reflection

The metric can reward a large angular patch even when its attachment is
physically implausible, again validating the visual rejection gate. Tangency at
the torso apex does not seat a wide plane on an ellipsoid. A future rear plate
must curve around the torso, or the rear torso itself must be replaced by a
coherent angular shell rather than covered with a plane.

## Next question

Can breaking up the smooth rear hair mass with a small set of attached irregular
tufts improve the very high rear head/hair residual without altering the face?

---

# 0012: Break up the rear hair mass

Status: rejected
## Pre-registration

- Observation: the accepted rear hair is a single smooth sphere, while the
  references show shaggy, irregular hair. The rear head/hair part residual is
  especially high and the smooth head dominates the two worst rear views.
- Hypothesis: six small attached rear hair tufts will break up the spherical
  surface and improve rear head/hair masks and perceptual similarity without
  changing the face or crown height.
- Change boundary: add six `hair` spheres named `hair_tuft_rear_0` through
  `hair_tuft_rear_5`, with centres/scales
  `(-0.105,0.150,1.735)/(0.050,0.024,0.060)`,
  `(-0.055,0.160,1.775)/(0.045,0.022,0.052)`,
  `(0.005,0.165,1.790)/(0.050,0.022,0.050)`,
  `(0.065,0.158,1.770)/(0.047,0.023,0.057)`,
  `(0.115,0.145,1.720)/(0.046,0.024,0.060)`, and
  `(0.000,0.163,1.655)/(0.060,0.020,0.050)`, each with 20 segments. The naming
  intentionally uses the existing `hair_tuft_` semantic rule. Keep existing
  head, hair, face, crown/chin landmarks, body, equipment, materials, cameras,
  references, annotations, and metric fixed.
- Expected movement: strongest improvements in back, back-left, and back-right
  through head/hair parts, DreamSim, and LPIPS; side views may improve modestly
  and front should remain flat. Crown/chin landmarks and palette should be
  effectively unchanged.
- Reject if: aggregate improvement is less than `0.001`; the additions look
  like detached beads or cauliflower rather than hair; any tuft detaches,
  changes the crown, intrudes on the face, or is misclassified; either back or
  back-left materially regresses; or diagnostic movement is not attributable
  to rear hair breakup.

## Result

- Baseline distance: `0.7033412820`
- Candidate distance: `0.7005270916`
- Absolute delta: `-0.0028141904`
- Relative delta: `-0.4001%`
- Baseline report SHA-256: `bc983aa9bd472c41ddb7eda9d2e0f37a27255380a42af36a9ff130aa1cf3720e`
- Candidate report SHA-256: `573aabd117fb9b95875eeec738d954c2dd8acdee56ac29ff6d1e4563a5b476be`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: rejected. The numeric improvement was real, but the six smooth
  ellipsoids read as detached beads or a cauliflower/paw-print cluster rather
  than shaggy hair, explicitly failing the visual rejection gate.

## Diagnostics and visual review

All eight fixed views were reviewed. Back improved strongly (`-0.009617`), as
did back-right (`-0.001951`), front (`-0.004159`), front-right (`-0.005774`),
and left (`-0.001094`). Back-left (`+0.000792`), front-left (`+0.000875`), and
right (`+0.000897`) regressed slightly. DreamSim improved `-0.016409`, LPIPS
`-0.002642`, and palette/texture `-0.001227`; parts (`+0.002317`), silhouette
(`+0.002274`), and landmarks (`+0.000872`) regressed. Every tuft was correctly
classified and attached, but their individual smooth outlines remain plainly
visible in rear and diagonal views.

## Protocol reflection

The neural metric strongly rewards breaking up the featureless hair mass, so
the underlying hypothesis is useful even though this geometry is not. Smooth
overlapping spheres introduce the wrong visual vocabulary. A later attempt
should use tapered cones, a merged low-poly shell, or sculpted mesh patches and
must explicitly check the silhouette for individually countable primitives.

## Next question

Can reducing only arm and gauntlet radii improve the oversized cylindrical limb
silhouette without opening joint gaps or moving any anatomical anchor?

---

# 0013: Slim the arm armour

Status: rejected
## Pre-registration

- Observation: the accepted upper arms and vambraces read as very thick smooth
  cylinders, especially in the rear and side silhouettes, while the references
  show slimmer articulated arms. The hand and shoulder landmark residuals are
  not safe pose targets because their labels conflict across rotated views, so
  this experiment keeps every anchor fixed.
- Hypothesis: reducing only the radii of the arm volumes will improve body-armour
  masks, silhouettes, and perceptual similarity without destabilizing the
  accepted equipment poses.
- Change boundary: inside the existing two-arm loop, change upper-arm segment
  radius from `0.115` to `0.095`, vambrace radius from `0.120` to `0.100`, and
  gauntlet scale from `(0.11,0.10,0.13)` to `(0.095,0.085,0.115)`. Keep arm
  points, shoulder/hand landmarks, pauldrons and their details, sword, shield,
  torso, legs, materials, cameras, references, annotations, and metric fixed.
- Expected movement: strongest improvements in back, back-left, back-right,
  left, and right through silhouette, body-armour parts, LPIPS, and DreamSim;
  front views should improve modestly. Landmarks and palette/texture should be
  effectively unchanged.
- Reject if: aggregate improvement is less than `0.001`; gaps open at shoulder,
  elbow, or gauntlet joints; either hand detaches from its equipment; the arms
  look implausibly thin or under-armoured; both back and back-left fail to
  improve; or diagnostic movement contradicts a radius-only change.

## Result

- Baseline distance: `0.7033412780`
- Candidate distance: `0.7052058225`
- Absolute delta: `+0.0018645445`
- Relative delta: `+0.2651%`
- Baseline report SHA-256: `2177b5d8e50975f6bde2f038c0f1ac148e1f2eef5b808f0ada08e8e2762219cd`
- Candidate report SHA-256: `60c558c13a442a29009561b4b45b2bbbcad8eeb0febc4c9e0ef385279980e9cd`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: rejected. The slimmer assemblies remained mechanically coherent,
  but the aggregate and the predicted rear/side diagnostics regressed.

## Diagnostics and visual review

All eight fixed views were reviewed. Back-left (`-0.001829`), front-right
(`-0.002622`), and right (`-0.004290`) improved, but back (`+0.002805`),
back-right (`+0.006897`), front (`+0.001988`), front-left (`+0.006791`), and
left (`+0.002669`) regressed. LPIPS improved `-0.003426`, parts `-0.001288`,
and palette/texture was nearly flat; DreamSim worsened `+0.007696`, silhouette
`+0.002388`, and landmarks `+0.001409` despite fixed authored anchors because
canonical foreground bounds shifted. No shoulder, elbow, gauntlet, sword, or
shield contacts opened, and the arms remained visually plausible.

## Protocol reflection

Radius-only slimming improves some classical overlap but makes the global
character read less like the reference to the neural metric. As with torso
depth, the accepted bulk compensates for incorrect overall proportions and
camera-normalized occupancy. Future limb work should first address length or
articulation as its own registered theme; shrinking widths alone is not a
reliable step.

## Next question

Can reducing the oversized belt's radius and depth improve the dominant orange
waist ring without opening a torso-to-fauld gap?

---

# 0014: Compact the belt assembly

Status: accepted
## Pre-registration

- Observation: the accepted waist is dominated in every view by a thick,
  saturated orange-brown ring, while the references use narrower layered belts
  that do not widen the torso. The ring contributes to the candidate's toy-like
  hourglass break between torso and legs.
- Hypothesis: reducing only the belt and buckle volumes will improve waist
  silhouette and perceptual similarity, especially in rear views, without
  changing torso, fauld, or tabard geometry.
- Change boundary: change belt radius/depth from `0.34/0.105` to `0.300/0.072`
  at its existing centre; change belt buckle scale from `(0.075,0.025,0.065)`
  to `(0.065,0.020,0.050)` at its existing centre. Keep materials, torso,
  faulds, tabards, limbs, equipment, landmarks, cameras, references,
  annotations, and metric fixed.
- Expected movement: strongest improvements in back, back-left, and back-right,
  followed by front and diagonals, through silhouette, LPIPS, and DreamSim;
  palette/texture may improve slightly while parts and landmarks should be
  nearly flat.
- Reject if: aggregate improvement is less than `0.001`; a visible gap opens
  between torso, belt, and faulds; the buckle detaches; the waist loses its
  structural read; either back or back-left materially regresses; or movement
  cannot be explained by the compact belt assembly.

## Result

- Baseline distance: `0.7033412780`
- Candidate distance: `0.6913992558`
- Absolute delta: `-0.0119420223`
- Relative delta: `-1.6979%`
- Baseline report SHA-256: `047f26f6a1f944d68bf24832aefe980d6267377ab4b3ec1e7ebc14ef3a4ed2b5`
- Candidate report SHA-256: `49c2137b0033ad69b5ed40b9a1956a438a27c8681e7d41e1f75017d9479f35dc`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: accepted. The compact belt remains connected to the torso, faulds,
  and buckle, reads less like an oversized toy ring, and improves every metric
  component with a substantial aggregate margin.

## Diagnostics and visual review

All eight fixed views were reviewed. Back (`-0.013771`), back-left
(`-0.010334`), back-right (`-0.004231`), front (`-0.004025`), front-left
(`-0.001062`), left (`-0.026579`), and right (`-0.031158`) improved;
front-right regressed only `+0.000503`. DreamSim improved `-0.025535`, LPIPS
`-0.020256`, palette/texture `-0.014782`, silhouette `-0.009111`, landmarks
`-0.004923`, and parts `-0.000644`. The buckle remains seated and there is no
structural waist gap. A thin strip of the ignored rear tabard becomes visible
above the smaller belt in rear and side views, but the overall assembly remains
coherent and materially closer.

## Protocol reflection

The belt was a genuine high-leverage local feature: unlike torso and arm
shrinking, compacting it improved neural, classical, and palette components
together. The exposed rear-tabard edge also reveals an evaluation blind spot:
ignored cloth can become visually worse without affecting the canonical score.
Continue to inspect the full beauty renders, and treat cloth removal or reseating
as a product cleanup rather than a metric experiment because the canonical mask
cannot measure it.

## Next question

Can replacing the crown-like front hair spikes with shorter irregular tapered
tufts improve the head silhouette without using the bead-like sphere geometry
rejected in experiment 0012?

---

# 0015: Shorten and vary the front hair tufts

Status: rejected
## Pre-registration

- Observation: the accepted seven identical tall cones read as a crown, while
  the references show uneven, swept, messy hair. Experiment 0012 showed that
  smooth added spheres are not a visually valid substitute even when the neural
  metric rewards them.
- Hypothesis: reshaping the existing seven cones into shorter, narrower,
  differently sized and tilted tufts will retain a tapered hair vocabulary while
  reducing the crown-like repetition and improving head/hair and perceptual
  distance.
- Change boundary: keep all seven tuft centres fixed, but replace their common
  `(radius1,radius2,depth) = (0.038,0.006,0.11)` and existing tilts with per-tuft
  values `(0.032,0.005,0.080,-0.78)`, `(0.029,0.005,0.090,-0.42)`,
  `(0.031,0.004,0.075,-0.10)`, `(0.028,0.004,0.085,0.34)`,
  `(0.033,0.005,0.078,0.66)`, `(0.030,0.004,0.072,-0.92)`, and
  `(0.031,0.005,0.082,0.88)` in tuple order. Keep the hair-back sphere, head,
  face, crown/chin landmarks, body, equipment, materials, cameras, references,
  annotations, and metric fixed; add no new hair primitives.
- Expected movement: strongest improvement in front, front-left, and
  front-right through head/hair parts, DreamSim, LPIPS, and silhouette; sides
  may improve modestly and rear should be nearly flat. Landmark movement should
  be limited to canonical-bound effects and palette/texture should be flat.
- Reject if: aggregate improvement is less than `0.001`; the tufts still read
  as a crown or become sparse antennae; visible gaps expose an implausibly bald
  scalp; the authored crown landmark becomes visibly inaccurate; either front
  or front-left materially regresses; or movement cannot be explained by the
  reshaped tuft assembly.

## Result

- Baseline distance: `0.6913992558`
- Candidate distance: `0.6975419300`
- Absolute delta: `+0.0061426742`
- Relative delta: `+0.8884%`
- Baseline report SHA-256: `3a3affbcbfa12c69d10dfaecaa9a6fcc0522856fc8d90bf33a319342fb3d0523`
- Candidate report SHA-256: `16144832c3d4f3fd6a0e70d56fc39125f4e07737dfaae60d66dbcff2055eec18`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: rejected. The shorter cones remain visibly crown-like, expose more
  smooth scalp, and regress the aggregate and every fixed view.

## Diagnostics and visual review

All eight fixed views were reviewed. Back (`+0.000485`), back-left
(`+0.012274`), back-right (`+0.004715`), front (`+0.000466`), front-left
(`+0.002215`), front-right (`+0.009321`), left (`+0.002493`), and right
(`+0.003757`) all regressed. DreamSim worsened `+0.015237`, LPIPS `+0.006690`,
silhouette `+0.003123`, landmarks `+0.001818`, and palette/texture `+0.001668`;
only parts improved `-0.001260`. The tufts stay attached and tapered, but their
shortened row reads as sparse spikes around a bald sphere rather than messy
hair, so the motivating visual problem is not solved.

## Protocol reflection

The crown-like read comes from the primitive arrangement and smooth underlying
hair shell, not merely common height or tilt. Both added spheres (0012) and
rescaled cones (0015) fail visual review. Further hair experiments should wait
for a merged or explicitly strand-like mesh representation instead of tuning
these primitives.

## Next question

Can darkening only the bright steel palette reduce the candidate's clean silver
toy highlights and improve neural and palette/texture distance in all views?

---

# 0016: Darken the steel palette

Status: accepted
## Pre-registration

- Observation: the accepted steel and especially polished edge material produce
  clean silver highlights, while both references use blackened, worn plate with
  subdued edge reflections. Palette/texture remains a directly measured
  component, and the mismatch appears across all eight views.
- Hypothesis: darkening the two steel-family base colours while preserving their
  metallic/roughness relationship will improve palette/texture and neural
  similarity without changing any geometry, masks, or landmarks.
- Change boundary: change `worn_dark_steel` base colour from
  `(0.16,0.17,0.17)` to `(0.075,0.080,0.080)` and `polished_steel_edges` from
  `(0.42,0.43,0.40)` to `(0.22,0.23,0.22)`. Keep their metallic and roughness
  values and every other material, light, geometry item, landmark, camera,
  reference, annotation, and metric fixed.
- Expected movement: palette/texture, LPIPS, and DreamSim should improve across
  all views, with largest gains where bright pauldrons, greave bands, and shield
  edges are exposed. Parts, silhouette, and landmarks should remain exactly or
  effectively unchanged.
- Reject if: aggregate improvement is less than `0.001`; both palette/texture
  and the mean neural components fail to improve; armour loses readable plate
  separation or becomes featureless black; highlights clip unnaturally; any
  mask/landmark movement is material; or a large view regression lacks a clear
  lighting explanation.

## Result

- Baseline distance: `0.6913992558`
- Candidate distance: `0.6880753720`
- Absolute delta: `-0.0033238838`
- Relative delta: `-0.4807%`
- Baseline report SHA-256: `4dba430a210eb4093763d0303ee5cba6347d38b41679479855b748ef8669c6ad`
- Candidate report SHA-256: `d3e6f019001210b89c1496e7e9a0e0a9ef0da73594144d00cf9e8286df341ed1`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: accepted. The darker steel remains readable under the fixed lights,
  preserves material separation, and improves all measured appearance
  components without moving masks or landmarks.

## Diagnostics and visual review

All eight fixed views were reviewed. Back (`-0.001512`), back-left
(`-0.009628`), front (`-0.003370`), front-left (`-0.009712`), front-right
(`-0.003800`), left (`-0.004104`), and right (`-0.001627`) improved;
back-right regressed `+0.002329`. Palette/texture improved `-0.019864`, LPIPS
`-0.013783`, and DreamSim `-0.002816`; parts, silhouette, and landmarks were
exactly unchanged. Armour volumes, seams, and polished edges remain legible and
no highlights clip or collapse into featureless black.

## Protocol reflection

This clean material-only result validates the component decomposition: all
classical geometry diagnostics stayed fixed while appearance measures moved in
the registered direction. Back-right's small regression shows the fixed warm
light can still make one projection prefer the brighter metal, so future
palette steps should continue to require broad view agreement rather than
tuning a single angle.

## Next question

Can darkening and desaturating only the aged-brass material reduce the remaining
orange toy accents without losing the target's restrained warm hardware?

---

# 0017: Subdue the brass palette

Status: rejected
## Pre-registration

- Observation: after experiment 0016 darkened the steel, the brass boss,
  pauldron rivets, ridges, buckle, and sword furniture remain saturated orange
  and glossy. The references use sparse, aged, subdued bronze-brown hardware.
- Hypothesis: darkening, desaturating, roughening, and slightly reducing the
  metallic response of the single brass material will improve palette/texture
  and neural similarity while retaining readable warm accents.
- Change boundary: change only `aged_brass` from colour `(0.34,0.21,0.075)`,
  metallic `0.72`, roughness `0.32` to colour `(0.16,0.09,0.025)`, metallic
  `0.60`, roughness `0.45`. Keep every other material, light, geometry item,
  landmark, camera, reference, annotation, and metric fixed.
- Expected movement: palette/texture, LPIPS, and DreamSim should improve broadly,
  strongest in front and diagonals where the boss, chest ridges, and sword
  furniture are exposed. Parts, silhouette, and landmarks should remain exactly
  unchanged.
- Reject if: aggregate improvement is less than `0.001`; the warm hardware
  becomes unreadable or visually merges into leather/steel; both palette/texture
  and neural means fail to improve; any mask/landmark movement is material; or
  large unexplained view regressions outweigh the registered appearance gain.

## Result

- Baseline distance: `0.6880753767`
- Candidate distance: `0.6876286079`
- Absolute delta: `-0.0004467687`
- Relative delta: `-0.0649%`
- Baseline report SHA-256: `32277f0d5503384d0d2d4d3e32e639d330edf0784683de6328aae05a31d0ed88`
- Candidate report SHA-256: `55e3507529e40447d2bce6b1d6f8082db497e5d33ab5b09c952a89d1b22665dc`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: rejected as inconclusive. The appearance remained coherent, but the
  aggregate improvement did not reach the protocol's `0.001` decision margin
  and the palette/texture component moved in the wrong direction.

## Diagnostics and visual review

All eight fixed views were reviewed. Front (`-0.001671`), front-left
(`-0.001130`), front-right (`-0.003003`), and right (`-0.000438`) improved;
back-left was flat, while back (`+0.000155`), back-right (`+0.000633`), and left
(`+0.000275`) regressed slightly. DreamSim improved `-0.002178` and LPIPS
`-0.003289`, but palette/texture worsened `+0.001171`; parts, silhouette, and
landmarks were exactly unchanged. The hardware remains readable and does not
merge into steel or leather, so the rejection is evidential rather than a
visual-defect rejection.

## Protocol reflection

Darkening all brass properties at once was directionally useful to the neural
metrics but too small and contradictory to retain. The palette component
suggests the reference still benefits from some of the accepted brass warmth.
If brass is revisited, change colour alone toward an intermediate value while
holding metallic and roughness fixed, so the source of the conflict is
identifiable.

## Next question

Can changing only the leather boots to the accepted dark steel material improve
the reference's metal-sabaton appearance without altering geometry or ground
contact?

---

# 0018: Change boots from leather to steel

Status: accepted
## Pre-registration

- Observation: the accepted boots are brown leather blocks, while the
  references show dark articulated metal sabatons continuous with the greaves.
  This mismatch is visible in front, rear, and diagonal lower-body views.
- Hypothesis: assigning the already accepted dark steel material to both boots
  will improve palette/texture and neural similarity without changing ground
  contact, boot masks, silhouette, or landmarks.
- Change boundary: inside the leg loop, change only the material passed to
  `left_boot` and `right_boot` from `leather` to `steel`. Keep boot geometry,
  centres, bevels, boot landmarks, greaves, every other material and geometry
  item, lighting, cameras, references, annotations, and metric fixed.
- Expected movement: palette/texture, LPIPS, and DreamSim should improve in
  front, back, and diagonal views; side views may move less. Parts, silhouette,
  and landmarks should be exactly unchanged.
- Reject if: aggregate improvement is less than `0.001`; the boots lose readable
  separation from the greaves or ground; both palette/texture and neural means
  fail to improve; any mask/landmark movement is material; or view regressions
  outweigh the registered lower-body appearance gain.

## Result

- Baseline distance: `0.6880753767`
- Candidate distance: `0.6852487012`
- Absolute delta: `-0.0028266754`
- Relative delta: `-0.4108%`
- Baseline report SHA-256: `14a10cbc325e9ed519391c997cf9a7ca1c6658a1a711c1f43855a585796d75c7`
- Candidate report SHA-256: `3463959bf31662b568f3f05992c7e49996e4e8f934431ceb56269fe434ee4b24`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: accepted. Both boots remain grounded and distinct from the greaves,
  read as metal sabatons, and improve every view and measured appearance
  component without moving any geometry diagnostic.

## Diagnostics and visual review

All eight fixed views were reviewed. Back (`-0.002545`), back-left
(`-0.001084`), back-right (`-0.001852`), front (`-0.006093`), front-left
(`-0.002151`), front-right (`-0.003859`), left (`-0.002153`), and right
(`-0.003629`) all improved. LPIPS improved `-0.016143`, palette/texture
`-0.007780`, and DreamSim `-0.002642`; parts, silhouette, and landmarks were
exactly unchanged. The boots remain visibly separate from the greaves and floor
and retain their bevel highlights.

## Protocol reflection

This is a second strong material-only result and confirms that broad semantic
material mismatches are safer early improvements than isolated body shrinking.
Because all views agree and geometry diagnostics are fixed, the causal claim is
unusually clean. Boot shape remains blocky, so geometry can now be tested
separately against this accepted material baseline.

## Next question

Can lowering and lengthening only the boot boxes produce a sabaton-like profile
without moving their ground-contact landmarks or opening a greave gap?

---

# 0019: Lower and lengthen the boot profile

Status: rejected
## Pre-registration

- Observation: experiment 0018 fixed the boot material, but the accepted boots
  remain tall, blunt rectangular blocks. The references show lower, longer
  sabatons extending forward beneath the greaves.
- Hypothesis: changing only the boot boxes to a lower, narrower, longer profile
  will improve lower-body silhouette and perceptual similarity while preserving
  the accepted steel material and approximate ground contact.
- Change boundary: inside the leg loop, change each boot centre from
  `(x + lean * 1.4,-0.055,0.105)` to `(x + lean * 1.4,-0.075,0.085)` and scale
  from `(0.14,0.22,0.105)` to `(0.13,0.24,0.085)`. Keep steel material, bevel,
  leg/greave geometry, authored boot landmarks, every other geometry/material,
  lights, cameras, references, annotations, and metric fixed.
- Expected movement: strongest improvements in left, right, and diagonal views
  through silhouette, body-armour parts, LPIPS, and DreamSim; front/back should
  improve modestly. Palette/texture and landmarks should be nearly unchanged.
- Reject if: aggregate improvement is less than `0.001`; a boot floats, clips
  below the floor, or opens a visible greave gap; the toes point implausibly or
  the stance loses balance; either side view materially regresses; or diagnostic
  movement cannot be explained by the boot-profile change.

## Result

- Baseline distance: `0.6852487012`
- Candidate distance: `0.6858221674`
- Absolute delta: `+0.0005734662`
- Relative delta: `+0.0837%`
- Baseline report SHA-256: `cfc0f3a7a83b6b96609ce1b935293235cc2c2b09b05d998b72fbadc68b3c93de`
- Candidate report SHA-256: `ead6f7e952d98d1fbb5fe351b255fb87fd7593771a7d36161608b10d4aecda88`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: rejected. The aggregate regressed and the lowered boxes visibly
  floated above the floor in multiple views despite the intended lower profile.

## Diagnostics and visual review

All eight fixed views were reviewed. Back (`-0.000326`), back-left
(`-0.000562`), front-right (`-0.001178`), left (`-0.000750`), and right
(`-0.001941`) improved slightly; back-right (`+0.003902`), front
(`+0.002123`), and front-left (`+0.005719`) regressed. Landmarks improved
`-0.002456`, silhouette `-0.001321`, parts `-0.000813`, and palette/texture
`-0.000734`, but DreamSim worsened `+0.007171` and LPIPS `+0.003482`. The long
boxes stay attached to the leg axis but have a visible shadow gap under them and
read as flat blocks rather than articulated sabatons.

## Protocol reflection

Changing centre and box proportions together did not preserve actual floor
contact because the rounded-box scale is a full Blender cube dimension rather
than a half-extent. Future boot geometry should derive centre height from the
mesh's measured lower bound and use a tapered prism or layered plates instead of
another rectangular scale change.

## Next question

Can adding rigid layered tassets at the hips improve the no-cloth reference's
segmented skirt armour without changing the ignored cloth or widening the lower
silhouette excessively?

---

# 0020: Add layered rigid hip tassets

Status: rejected
## Pre-registration

- Observation: the accepted waist transitions from three broad horizontal
  faulds to smooth cylindrical thighs, while the no-cloth references show
  multiple rigid vertical skirt plates hanging from the belt over both hips.
  Ignored cloth cannot contribute to the canonical body-armour mask.
- Hypothesis: adding one symmetric six-plate tasset assembly will reproduce the
  segmented rigid skirt read and improve body-armour parts and perceptual
  similarity without changing the ignored tabards.
- Change boundary: add three dark-steel rounded boxes per side at
  `x = side * 0.12`, `side * 0.23`, and `side * 0.32`, each at
  `(x,-0.225,0.70)`, scale `(0.070,0.028,0.180)`, bevel `0.018`, and rotation
  `(0,side * 0.08,0)`, named `{left|right}_tasset_{0|1|2}`. Keep belt, faulds,
  thighs, ignored tabards, every other geometry/material, landmarks, lights,
  cameras, references, annotations, and metric fixed.
- Expected movement: strongest improvements in front, front-left, and
  front-right through body-armour parts, LPIPS, DreamSim, and local silhouette;
  sides may improve modestly and rear views should be nearly flat. Landmarks and
  palette/texture should be effectively unchanged.
- Reject if: aggregate improvement is less than `0.001`; plates float, merge
  into one slab, clip thighs/faulds/tabards, or widen the hips implausibly; the
  assembly fails to read as layered armour; either front or front-left
  materially regresses; or diagnostic movement cannot be attributed to the
  tassets.

## Result

- Baseline distance: `0.6852487012`
- Candidate distance: `0.6863796936`
- Absolute delta: `+0.0011309924`
- Relative delta: `+0.1650%`
- Baseline report SHA-256: `378aa0d852d18e5d61830b3b8e35edb8165ae641e3e9f1eee5d7a4f83e145f50`
- Candidate report SHA-256: `ad437ec9710d1e5b7c53ef01a83b8f1c8f82561c98fa2452495826406c973d59`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: rejected. The boxes read as separated belt pouches rather than
  overlapping skirt armour, and the aggregate and motivating front views
  regressed.

## Diagnostics and visual review

All eight fixed views were reviewed. Back (`-0.001163`), back-left
(`-0.000319`), and back-right (`-0.002081`) improved; front (`+0.012004`),
front-left (`+0.003153`), front-right (`+0.002523`), left (`+0.000372`), and
right (`+0.000676`) regressed. Silhouette improved `-0.003642`, parts
`-0.002421`, LPIPS `-0.002652`, and palette/texture `-0.001112`, but DreamSim
worsened `+0.018029`; landmarks were unchanged. The six pieces remain attached
and symmetric, but their gaps and small rectangular faces make them read as
pouches rather than a layered tasset assembly.

## Protocol reflection

Adding nominally correct semantic parts is not enough when their primitive
language is wrong. The neural regression and visual read agree that convincing
tassets require overlapping tapered plates and a common attachment rail. If
revisited, use a single coherent skirt-shell construction rather than discrete
rounded boxes.

## Next question

Can tapering only the existing breastplate's lower outline make the torso less
boxy without changing the underlying mass, shoulders, or waist?

---

# 0021: Taper the breastplate toward the waist

Status: rejected
## Pre-registration

- Observation: the accepted front breastplate remains broad and boxy almost to
  the waist, while both references show a cuirass that narrows below the ribs
  before meeting layered belts. Experiment 0010 showed the underlying torso
  depth should not be reduced in isolation.
- Hypothesis: tapering only the lower front plate outline will improve the
  frontal torso shape and perceptual similarity while preserving the accepted
  underlying mass, shoulders, and waist compensation.
- Change boundary: in the `breastplate` prism only, change the lower side points
  `(+/-0.265,1.05)` to `(+/-0.225,1.05)` and bottom points
  `(+/-0.13,0.96)` to `(+/-0.10,0.96)`. Keep top points, depth, position,
  bevel, underlying torso volumes, ridges, strap, belt, limbs, equipment,
  materials, landmarks, lights, cameras, references, annotations, and metric
  fixed.
- Expected movement: strongest improvements in front, front-left, and
  front-right through body-armour parts, silhouette, LPIPS, and DreamSim; sides
  may move slightly and rear views should be flat. Palette/texture and landmarks
  should be nearly unchanged.
- Reject if: aggregate improvement is less than `0.001`; the underlying sphere
  protrudes visibly around the tapered plate; gaps appear at belt/strap/ridges;
  the waist becomes pinched or implausible; front or front-left materially
  regresses; or movement cannot be attributed to the lower outline.

## Result

- Baseline distance: `0.6852487012332253`
- Candidate distance: `0.6852552185013109`
- Absolute delta: `+0.0000065172680855`
- Relative delta: `+0.000951%`
- Baseline report SHA-256: `254bf5f0ca681b4f27608ee5b0b80b8aa5ff76ffdf0e551b5465023217fba3e0`
- Candidate report SHA-256: `508ceef6b07442c3ac599cbcad714be96baccdd7985af6e4fbe79b5d5a304c9f`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: rejected. The candidate is numerically neutral but slightly worse,
  missing the `0.001` improvement margin by a wide margin. The mixed view
  movement does not support the registered all-front-view hypothesis.

## Diagnostics and visual review

I reviewed all eight candidate beauty renders and their mask overlays. The
front (`-0.001305`) and left (`-0.001419`) views improved, but front-left
(`+0.001244`) and front-right (`+0.001408`) regressed; rear views were nearly
flat as expected. DreamSim improved by `0.000269`, while LPIPS regressed by
`0.000653` and silhouette by `0.000151`. The narrower lower plate remained
joined to its ridges, strap, and belt, with no obvious gap or exposed sphere,
but the unchanged rounded torso and thick belt still controlled the visible
waist silhouette. The visual change was too small to justify the contradictory
diagonal movement.

## Protocol reflection

This experiment isolated the plate outline successfully, but also showed that
the lower breastplate polygon has little leverage while the torso volume and
belt occlude its edges. A future torso-shape experiment should not repeat this
local taper. The protocol correctly rejected a visually plausible edit whose
small aggregate movement could otherwise have been overinterpreted.

## Next question

Does reducing only the oversized shield boss improve the exposed shield views
without moving the already accepted shield outline or semantic landmarks?

---

# 0022: Compact the shield boss

Status: accepted
## Pre-registration

- Observation: after the accepted shield outline and pose changes, the exposed
  shield still carries a large bright hemispherical boss. Both rigid reference
  sheets show comparatively subdued, low-profile shield ornament, while the
  candidate boss dominates the front and diagonal shield face.
- Hypothesis: reducing only the shield boss footprint will improve perceptual
  and palette similarity in shield-exposed views without disturbing the
  accepted shield silhouette, pose, or landmark alignment.
- Change boundary: change only `shield_boss` scale from
  `(0.110, 0.030, 0.116)` to `(0.065, 0.030, 0.068)`. Keep its center,
  material, mesh resolution, shield outer and field geometry, shield pose,
  sword, body, landmarks, lights, cameras, references, annotations, and metric
  fixed.
- Expected movement: strongest improvements in front, front-left, and
  front-right through DreamSim, LPIPS, and palette/texture. Shield parts,
  silhouette, and landmarks should be nearly unchanged; rear views should be
  flat and side views may change slightly where the boss profile is visible.
- Reject if: aggregate improvement is less than `0.001`; the boss becomes too
  small to read as attached hardware; it appears sunken, detached, or
  implausibly flat; shield parts or landmarks move materially; exposed shield
  views regress; or the movement cannot be attributed to the boss footprint.

## Result

- Baseline distance: `0.6852487012332253`
- Candidate distance: `0.6830961936105201`
- Absolute delta: `-0.0021525076227052`
- Relative delta: `-0.314121%`
- Baseline report SHA-256: `3f31aeb7844b218f81cab8c881e8bcda6b6098a77405f2286990788d1f4121bd`
- Candidate report SHA-256: `1ec70fe203e3f2e6e98ed6f69345b69f5c3ba81b3a08fa6d59feaf88162c0aeb`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: accepted. The aggregate improved by more than the registered
  margin, the exposed shield views improved coherently, and visual review found
  no attachment or readability defect.

## Diagnostics and visual review

I reviewed all eight candidate beauty renders and mask overlays. Front
(`-0.007495`), front-left (`-0.007561`), front-right (`-0.006030`), and left
(`-0.002376`) improved as predicted. Back, back-left, and back-right moved by
less than `0.000082`; right regressed only `0.000304`. DreamSim improved by
`0.010087`, LPIPS by `0.005563`, palette/texture by `0.001653`, and silhouette
by `0.000649`; parts and landmarks were effectively fixed. The smaller boss
still reads as attached hardware, stays centered on the shield field, and no
longer dominates the shield face.

## Protocol reflection

This clean result confirms that interior equipment detail can materially move
the neural and palette terms without changing semantic geometry. The tiny
silhouette movement is attributable to canonical antialiasing at the boss
profile, not a shield-pose change. Future detail experiments should preserve
this strict fixed-outline boundary and continue requiring exposed-view gains.

## Next question

Does replacing the toy-like horizontal breastplate ridges with a restrained
diagonal quilt pattern improve the front-facing perceptual residuals while
leaving the plate outline fixed?

---

# 0023: Darken the cuirass ridges

Status: rejected
## Pre-registration

- Observation: four bright brass horizontal ridges divide the accepted front
  breastplate into broad toy-like stripes. The references instead read as dark
  blackened armour with low-contrast seams and dense diagonal construction.
- Hypothesis: changing only those four ridge materials to the accepted dark
  steel will remove a false high-contrast motif and improve frontal perceptual
  and palette similarity without changing the cuirass geometry.
- Change boundary: in the `cuirass_ridge_` loop only, change the material
  argument from `brass` to `steel`. Keep ridge count, positions, sizes, bevels,
  breastplate and torso geometry, strap and rivets, every other material,
  equipment, landmarks, lights, cameras, references, annotations, and metric
  fixed.
- Expected movement: front, front-left, and front-right should improve through
  DreamSim, LPIPS, and palette/texture. Parts, silhouette, and landmarks should
  remain effectively fixed; side and rear views should be flat.
- Reject if: aggregate improvement is less than `0.001`; the breastplate loses
  all readable layering; the ridges appear detached or produce lighting
  artifacts; any geometric component moves materially; front-facing views
  regress; or the movement cannot be attributed to ridge contrast.

## Result

- Baseline distance: `0.6830961936105201`
- Candidate distance: `0.6821239462251432`
- Absolute delta: `-0.0009722473853769`
- Relative delta: `-0.142329%`
- Baseline report SHA-256: `5cfcfd1e4f172b882f592e4c390fcad498983c10fcfe2e812e9870ccfc9be243`
- Candidate report SHA-256: `71195b0bb4db24645fb8fca85fe400783243d33967bfec69e342e2d24c13a99b`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: rejected as inconclusive. The coherent improvement missed the
  fixed `0.001` aggregate margin by `0.000027753`; the accepted source remains
  unchanged rather than weakening the rule for a favorable-looking result.

## Diagnostics and visual review

I reviewed all eight candidate beauty renders and mask overlays. Front
(`-0.002004`), front-left (`-0.004375`), and front-right (`-0.003847`)
improved coherently; rear views were byte-equivalent in score, left was flat,
and right improved `0.000144`. DreamSim improved by `0.006062` and LPIPS by
`0.001073`, while palette/texture regressed `0.000233`; geometric components
were exactly fixed. The steel ridges remained attached and readable as subtle
layering, with no lighting or geometry defect, but the numerical gain did not
clear the registered margin.

## Protocol reflection

The strict margin prevented a near-threshold result from being accepted by
special pleading. Because all exposed views and both neural terms agreed, the
causal hypothesis remains promising even though this strength was
inconclusive. The next iteration should keep the identical geometry and test a
preregistered stronger contrast removal, not combine it with a new pattern.

## Next question

Does using the existing near-black material on only the four cuirass ridges
produce a decisive version of the same low-contrast motif hypothesis?

---

# 0024: Blacken the cuirass ridges

Status: accepted
## Pre-registration

- Observation: experiment 0023 changed only the four bright horizontal ridges
  from brass to dark steel. It improved every exposed front view and both
  neural components, but its `0.000972` aggregate gain narrowly missed the
  fixed decision margin and palette/texture slightly regressed.
- Hypothesis: using the existing blackened-iron material on the same four
  ridges will more completely suppress the false bright stripe motif and turn
  the coherent but inconclusive 0023 movement into a decisive improvement.
- Change boundary: in the `cuirass_ridge_` loop only, change the material
  argument from `brass` to `black`. Keep ridge count, positions, sizes, bevels,
  all breastplate and torso geometry, strap and rivets, every other material,
  equipment, landmarks, lights, cameras, references, annotations, and metric
  fixed.
- Expected movement: front, front-left, and front-right should improve through
  DreamSim and LPIPS, by more than experiment 0023. Palette/texture should be
  flat or improve; parts, silhouette, landmarks, sides, and rear views should
  remain effectively fixed.
- Reject if: aggregate improvement is less than `0.001`; exposed front views
  do not all improve; palette regression grows beyond `0.001`; the ridges
  disappear so completely that the breastplate becomes visually blank; any
  geometry component moves materially; or the movement cannot be attributed
  to ridge contrast.

## Result

- Baseline distance: `0.6830960729035708`
- Candidate distance: `0.6820894240944771`
- Absolute delta: `-0.0010066488090936`
- Relative delta: `-0.147366%`
- Baseline report SHA-256: `d41cec87f06f3f663db289af10a2bf209a244a803f29d5587e2b313d48370f09`
- Candidate report SHA-256: `7808ef4fda50fee421985eac9ac53e3cf72ec905b18549db61428ea69e7e4fac`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: accepted. The candidate clears the `0.001` margin, all three
  exposed front views improve, the registered palette cap is respected, and
  the ridges remain visually readable.

## Diagnostics and visual review

I reviewed all eight candidate beauty renders and mask overlays. Front
(`-0.002008`), front-left (`-0.004785`), and front-right (`-0.004292`)
improved coherently. Rear views were exactly flat; left changed only
`+0.000001`, and right regressed `0.000346`. DreamSim improved by `0.006398`
and LPIPS by `0.001254`; palette/texture regressed `0.000627`, below the
registered `0.001` rejection cap. Parts, silhouette, and landmarks were exactly
fixed. The blackened ridges remain visible through specular highlights and
still communicate layering without reading as bright brass stripes.

## Protocol reflection

The stronger material variant converted experiment 0023's coherent but
sub-threshold result into a protocol-valid gain while preserving the same
causal boundary. This paired result is useful evidence that ridge contrast,
not ridge geometry, was the immediate problem. The slight palette regression
also cautions against assuming every darker metal edit helps the histogram
term; neural and palette diagnostics must remain separate.

## Next question

Can the oversized head width and depth be reduced as one anchored facial
assembly without creating floating facial features or changing its height?

---

# 0025: Narrow the complete head assembly

Status: accepted
## Pre-registration

- Observation: the accepted head reads as a broad spherical toy head, while
  both reference sheets show a narrower adult face, beard, and hair mass. Prior
  hair-only experiments failed because they changed isolated tufts rather than
  the complete anchored assembly.
- Hypothesis: applying one horizontal compression to the complete head and all
  attached facial and hair features will improve head/hair parts, silhouette,
  and perceptual similarity without changing crown/chin height or creating
  floating features.
- Change boundary: preserve every Z coordinate and apply the registered
  horizontal assembly transform. Set head scale to `(0.120, 0.105, 0.175)`;
  nose center Y to `-0.138`, scale to `(0.024, 0.032, 0.055)`; eye centers to
  `(+/-0.045, -0.132, 1.68)`, scales to `(0.027, 0.010, 0.018)`; beard center Y
  to `-0.123`, scale to `(0.088, 0.038, 0.09)`; hair-back center Y to `0.041`,
  scale to `(0.126, 0.092, 0.17)`. Multiply every hair-tuft X coordinate and
  its Y offset from head center `-0.035` by `0.84`, and change tuft base radii
  from `0.038` to `0.032`; keep tuft Z, depth, and tilt fixed. Keep body,
  gorget, materials, landmarks, equipment, lights, cameras, references,
  annotations, and metric fixed.
- Expected movement: head/hair parts, silhouette, DreamSim, and LPIPS should
  improve across all eight views, strongest in front, back, and diagonals.
  Crown/chin landmarks remain fixed by construction; palette should be nearly
  unchanged.
- Reject if: aggregate improvement is less than `0.001`; any eye, nose, beard,
  hair mass, or tuft appears detached or embedded; the face becomes pinched;
  crown or chin height visibly changes; the gorget develops an implausible gap;
  front and back do not both improve; or movement cannot be attributed to the
  registered horizontal transform.

## Result

- Baseline distance: `0.6820894240944771`
- Candidate distance: `0.6810348510339064`
- Absolute delta: `-0.0010545730605708`
- Relative delta: `-0.154609%`
- Baseline report SHA-256: `df826447d3c9f0bbcff8e86a3dad996ac6762888b7df79b0b4abfa739b0d4589`
- Candidate report SHA-256: `1d35459e95ec3e811fe22763f4aefe8f741ffd03c208b38036d12dbc4aacbc11`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: accepted. The candidate clears the aggregate margin, front and back
  both improve, and the complete assembly remains coherent with fixed height;
  the mixed neural/view movement is retained as a caution for follow-ups.

## Diagnostics and visual review

I reviewed all eight candidate beauty renders and mask overlays. Front
(`-0.003241`), back (`-0.003173`), back-right (`-0.002050`), and left
(`-0.002558`) improved; front-left (`+0.000702`), front-right (`+0.000416`),
back-left (`+0.003602`), and right (`+0.003517`) regressed. Parts improved by
`0.004249`, palette/texture by `0.005083`, LPIPS by `0.004396`, and silhouette
by `0.000388`; DreamSim regressed `0.008730`. Crown/chin and landmark height
remained fixed. The eyes, nose, beard, rear hair, and tufts remain attached,
the face reads narrower rather than pinched, and the gorget relationship is no
worse than baseline.

## Protocol reflection

The full anchored transform avoided the detached-feature failure of earlier
hair-only tests, validating assembly-level edits when every dependent anchor is
preregistered. However, the opposite DreamSim and LPIPS movement shows that a
small aggregate win can hide model disagreement. The next experiment should
avoid further head compression and target a different high-residual region;
future head work should require both neural terms to improve.

## Next question

Can the large spherical pauldron bases be replaced by layered, flatter caps
while preserving their already accepted compact outer footprint and anchors?

---

# 0026: Darken the pauldron ridges

Status: rejected
## Pre-registration

- Observation: each accepted compact pauldron still carries three bright
  concentric rings that read as toy hoops. The references show overlapping
  dark shoulder plates with subdued edges, and experiments 0023-0024 found
  that excessive ridge contrast was harmful on the cuirass.
- Hypothesis: changing only the six pauldron ridge materials from bright steel
  to the accepted dark steel will reduce the false hoop motif and improve
  upper-body perceptual similarity without changing shoulder geometry or
  anchors.
- Change boundary: in the `pauldron_ridge_` torus call only, change material
  from `bright` to `steel`. Keep all torus geometry, pauldron spheres, rivets,
  arm points, body, equipment, every other material, landmarks, lights,
  cameras, references, annotations, and metric fixed.
- Expected movement: front, back, and all four diagonal views should improve
  through DreamSim, LPIPS, and palette/texture; side views may improve less.
  Parts, silhouette, and landmarks should remain effectively fixed.
- Reject if: aggregate improvement is less than `0.001`; both front and back do
  not improve; shoulder layering becomes unreadable; rings visually detach or
  cause lighting artifacts; any geometric component moves materially; or the
  movement cannot be attributed to ridge contrast.

## Result

- Baseline distance: `0.6810348510339064`
- Candidate distance: `0.6802338080942207`
- Absolute delta: `-0.0008010429396856`
- Relative delta: `-0.117621%`
- Baseline report SHA-256: `e5f1209c9905672d358acd90c8b42f4f0c86448051c648336fe1bac7f0f7bbba`
- Candidate report SHA-256: `1f724c8884992163b2dc4835bb69b77587be732b7ae8af515b556c5635fcea32`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: rejected as inconclusive. Every view improved, but the aggregate
  missed the fixed `0.001` margin and palette/texture regressed materially.

## Diagnostics and visual review

I reviewed all eight candidate beauty renders and mask overlays. Every view
improved: front led at `-0.002538`, followed by front-left `-0.001450` and
front-right `-0.001358`; the five remaining changes ranged from `-0.000750` to
`-0.000272`. DreamSim improved by `0.003963` and LPIPS by `0.004420`, while
palette/texture regressed `0.002572`. Parts, silhouette, and landmarks were
exactly fixed. The rings remained attached and readable, but their strongly
specular circular geometry still dominated the shoulder motif despite the
darker base color.

## Protocol reflection

The cuirass-ridge material lesson only partially transferred: pauldron-ring
geometry maintains bright highlights even with a dark material. The strict
margin and palette diagnostic correctly prevent accepting the coherent but
undersized gain. Future shoulder work should change the circular form rather
than repeat another material-only variant.

## Next question

Does replacing each three-ring assembly with three overlapping flattened caps
improve the shoulder motif while preserving the accepted anchors and overall
pauldron footprint?

---

# 0027: Replace pauldron hoops with layered caps

Status: rejected
## Pre-registration

- Observation: experiment 0026 improved every view by darkening the three
  pauldron hoops, but missed the aggregate margin and showed that their circular
  geometry still creates bright toy-like rings. The references use overlapping
  plate shells rather than a ball-and-hoop construction.
- Hypothesis: replacing each spherical base and three torus hoops with three
  overlapping flattened ellipsoid caps will preserve the compact accepted
  shoulder footprint while producing a more reference-like layered armour
  motif.
- Change boundary: inside the shoulder loop only, remove the one pauldron base
  sphere and three ridge tori per side. Add three steel spheres per side at the
  unchanged shoulder X/Y and Z offsets `+0.050`, `0`, and `-0.050`, with scales
  `(0.160,0.130,0.055)`, `(0.150,0.125,0.050)`, and
  `(0.140,0.120,0.045)`, named `*_pauldron_layer_0..2`. Keep shoulder anchors,
  arms, pauldron rivets, all other geometry and materials, landmarks, lights,
  cameras, references, annotations, and metric fixed.
- Expected movement: DreamSim, LPIPS, body-armour parts, and palette/texture
  should improve in front, back, and all diagonal views; sides may move less.
  The overall shoulder silhouette and landmarks should remain close to fixed.
- Reject if: aggregate improvement is less than `0.001`; either shoulder reads
  as three detached beads rather than overlapping plates; gaps expose the arm
  anchor; rivets float; the silhouette becomes materially wider or narrower;
  both front and back do not improve; or movement cannot be attributed to the
  registered layer replacement.

## Result

- Baseline distance: `0.6810348510339064`
- Candidate distance: `0.6809609085962410`
- Absolute delta: `-0.0000739424376653`
- Relative delta: `-0.010857%`
- Baseline report SHA-256: `f5bf362167445f388858e8d16452a429cae5d9ecead2b6683b7eb2942c42d3d8`
- Candidate report SHA-256: `b57e48bc9de7980962ac898e4c32295ed0ea4280b028c04c924752ce2b13db2d`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: rejected. The aggregate was effectively neutral, the registered
  front/back gate failed, silhouette regressed, and visual review found the
  explicit detached-bead failure mode.

## Diagnostics and visual review

I reviewed all eight candidate beauty renders and mask overlays. Back-right
(`-0.012187`) and left (`-0.006666`) improved strongly, but right regressed
`0.008533`, back `0.002396`, and front `0.001552`; front-left was flat and
front-right improved `0.000996`. LPIPS improved by `0.012060` and DreamSim by
`0.003730`, but palette/texture regressed `0.005291` and silhouette regressed
`0.002618`. The flattened spheres remained attached to the arm anchors, yet
their rounded gaps and repeated highlights made them read as three stacked
pancakes or beads rather than overlapping forged plates. The outer shoulder
profile also changed enough to violate the intended near-fixed footprint.

## Protocol reflection

The experiment showed that “layering” is not a sufficient geometric theme:
primitive choice and overlap profile determine whether the result reads as
armour. Strong isolated view gains were orientation artifacts and did not
generalize across mirrored sides. A future pauldron replacement must use a
continuous shell or beveled plate construction, not multiple full ellipsoids.

## Next question

Can narrowing only the accepted shield slab depth reduce its bulky side profile
without changing its face outline, boss, pose, or landmarks?

---

# 0028: Thin the shield slab

Status: accepted
## Pre-registration

- Observation: the accepted shield face and boss are improved, but side and
  diagonal renders still reveal a bulky multi-slab edge. The reference heater
  shield reads as a comparatively thin plate.
- Hypothesis: reducing only the outer and inset prism depths will improve
  shield profile and perceptual similarity in side and diagonal views without
  disturbing the accepted face outline, pose, or semantic landmarks.
- Change boundary: change `kite_shield` prism depth from `0.070` to `0.045`
  and `shield_field` prism depth from `0.035` to `0.022`. Keep both polygons,
  Y locations, bevels, boss, materials, sword, body, landmarks, lights,
  cameras, references, annotations, and metric fixed.
- Expected movement: left, right, and four diagonal views should improve
  through shield parts, silhouette, DreamSim, and LPIPS; front/back may be
  nearly flat. Palette/texture and landmarks should remain nearly fixed.
- Reject if: aggregate improvement is less than `0.001`; the field floats or
  sinks into the outer shield; bevels collapse; the shield becomes visibly
  paper-thin; exposed front views regress materially; shield landmarks move;
  or movement cannot be attributed to slab depth.

## Result

- Baseline distance: `0.6810348498249377`
- Candidate distance: `0.6793299158807575`
- Absolute delta: `-0.0017049339441801`
- Relative delta: `-0.250345%`
- Baseline report SHA-256: `0eb1adc336e5a79ac92e9e0edcc3a5b386d5c9e25316030a5afa3522f4a067cc`
- Candidate report SHA-256: `30c109dd42b44a42b025e630ed1a2e62df20bb1a087c990c93ce11cf08c59830`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: accepted. The aggregate clears the margin, seven views and all
  registered perceptual/profile components improve, and visual review finds no
  field seating, bevel, or paper-thin failure.

## Diagnostics and visual review

I reviewed all eight candidate beauty renders and mask overlays. Back-left
(`-0.004479`), left (`-0.003685`), front-left (`-0.003769`), front
(`-0.002354`), back (`-0.001178`), back-right (`-0.000487`), and right
(`-0.000455`) improved; front-right regressed `0.001362`. DreamSim improved by
`0.004885`, LPIPS by `0.003707`, palette/texture by `0.001300`, and silhouette
by `0.002043`. Parts regressed only `0.000068` and landmarks improved
`0.000075`. The inset field remains seated against the outer plate, bevels are
intact, and the edge profile is thinner without becoming paper-like.

## Protocol reflection

Unlike outline edits, a depth-only equipment change improved both neural and
classical profile diagnostics while preserving the accepted face design. The
front-right regression is a useful reminder that occlusion-side asymmetry can
remain even for symmetric slab-depth edits; acceptance should continue to
require visual inspection rather than demanding identical mirrored deltas.

## Next question

Can reducing only the oversized round sword pommel improve weapon appearance
without changing the accepted blade, guard, grip, or sword landmarks?

---

# 0029: Compact the sword pommel

Status: rejected
## Pre-registration

- Observation: the accepted sword angle is closer to the reference, but its
  bright spherical pommel remains oversized relative to the narrow grip and
  reads as a toy ball. The reference swords use small, restrained pommels.
- Hypothesis: reducing only the pommel volume will improve weapon appearance in
  exposed views without changing the accepted blade, guard, grip, hand contact,
  or semantic landmarks.
- Change boundary: change `sword_pommel` scale from
  `(0.055, 0.045, 0.055)` to `(0.036, 0.030, 0.036)`. Keep its center,
  material, resolution, blade, guard, grip, hand and arm, shield, body,
  landmarks, lights, cameras, references, annotations, and metric fixed.
- Expected movement: front, front-right, right, and rear-right views should
  improve through DreamSim, LPIPS, palette/texture, and sword parts. Other
  views should be flat; silhouette and landmarks should move only minimally.
- Reject if: aggregate improvement is less than `0.001`; the pommel becomes too
  small to read, detaches from the grip, or sinks into the hand; sword parts or
  landmarks regress materially; exposed sword views regress; or movement
  cannot be attributed to pommel scale.

## Result

- Baseline distance: `0.6793295068705235`
- Candidate distance: `0.6796112021786105`
- Absolute delta: `+0.0002816953080870`
- Relative delta: `+0.041467%`
- Baseline report SHA-256: `1c0c10d0dd5e9ac68dd13a81917a60c7e6285defc19fb5721536f9f7774af72c`
- Candidate report SHA-256: `f2e608ccad7eb28ab36411edc751f92a81218473f7dc80154ada591e43dc8443`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: rejected. The aggregate worsened, the registered exposed front
  views all regressed, and only silhouette moved favorably.

## Diagnostics and visual review

I reviewed all eight candidate beauty renders and mask overlays. Front
(`+0.001964`), front-left (`+0.001843`), front-right (`+0.001638`), and left
(`+0.000415`) regressed. Back-right improved `0.001703`, right improved
`0.000515`, and back/back-left were nearly flat. DreamSim regressed by
`0.001620`, LPIPS by `0.001383`, parts by `0.000181`, and palette/texture by
`0.000032`; silhouette improved `0.000394`. The smaller pommel remained
attached to the grip and did not sink into the hand, but the registered visual
and numeric hypothesis failed.

## Protocol reflection

This result warns against treating every rounded toy-like detail as oversized:
the current pommel contributes useful weapon mass and overlap in the exposed
front projections. The experiment was cleanly isolated, so the negative result
should retire pommel scale as a near-term lever rather than invite retuning.

## Next question

Can reducing only the thick sword guard radius improve the weapon silhouette
while preserving its accepted span, grip contact, blade, and landmarks?

---

# 0030: Darken the leather palette

Status: accepted
## Pre-registration

- Observation: the accepted belt geometry is compact, but the belt and
  cross-body strap still render orange-brown and visually dominate the dark
  armour. Both references use much darker, weathered brown leather, including
  the diagonal harness and waist belts.
- Hypothesis: darkening only the shared worn-leather base color will improve
  palette and perceptual similarity across views without changing geometry,
  semantic masks, or landmarks.
- Change boundary: change `worn_leather` base color from
  `(0.17, 0.085, 0.036)` to `(0.105, 0.045, 0.018)`. Keep metallic and
  roughness values, every geometry value, every other material, landmarks,
  lights, cameras, references, annotations, and metric fixed.
- Expected movement: palette/texture, DreamSim, and LPIPS should improve across
  all eight views, strongest in front, back, and diagonals where the belt or
  strap is broad. Parts, silhouette, and landmarks should be exactly fixed.
- Reject if: aggregate improvement is less than `0.001`; palette/texture does
  not improve; both front and back do not improve; leather becomes
  indistinguishable from steel or loses readable separation; any geometric
  component moves; or movement cannot be attributed to the material.

## Result

- Baseline distance: `0.6793299171309972`
- Candidate distance: `0.6763572643366178`
- Absolute delta: `-0.0029726527943794`
- Relative delta: `-0.437586%`
- Baseline report SHA-256: `6588fb7195cf6dbabe6703a79620af90fb256062ade678dfe2cf5c1c57398ec1`
- Candidate report SHA-256: `3faf2633883a796fdd1d3d7cb7ad6d0a279e6d1bf2e67316f302f22483ec0c56`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: accepted. The aggregate clears the margin, all eight views improve,
  every registered non-geometric component improves, and the leather remains
  visually distinct from metal.

## Diagnostics and visual review

I reviewed all eight candidate beauty renders and mask overlays. Every view
improved: back-left `-0.005181`, right `-0.004427`, back-right `-0.003954`,
front `-0.003634`, front-left `-0.002766`, back `-0.002261`, front-right
`-0.001844`, and left `-0.001614`. DreamSim improved by `0.008326`, LPIPS by
`0.008897`, and palette/texture by `0.006551`; parts, silhouette, and landmarks
were exactly fixed. The belt, diagonal strap, and sword grip remain readable as
brown leather but no longer dominate the blackened armour with orange color.

## Protocol reflection

This is the cleanest material experiment so far: broad view agreement and exact
geometric invariance make the causal result strong. It confirms that palette
work should target material families individually rather than globally retune
all warm accents, as the rejected brass experiment did. Future material trials
should retain the same requirement that both neural terms and palette agree.

## Next question

Does removing the ignored front and rear cloth occluders reveal the already
authored rigid faulds and thighs, improving the no-cloth reference match without
introducing holes or intersections?

---

# 0031: Remove the cloth occluders

Status: rejected
## Pre-registration

- Observation: the selected rigid reference has no hanging cloth. Although the
  metric classifies candidate tabards as ignored, they first occlude the faulds
  and thighs in the beauty and parts renders; clearing their pixels afterward
  leaves canonical holes instead of revealing the rigid armour behind them.
- Hypothesis: removing only the front tabard, its badge, and rear tabard will
  reveal the already authored rigid faulds and thighs, improving the no-cloth
  reference match and eliminating an avoidable occlusion artifact.
- Change boundary: remove only creation of `rear_tabard`, `tabard`, and
  `tabard_badge`. Keep the cloth material declaration, ignored-part rules,
  every rigid armour/body/equipment object, all landmarks (including the unused
  tabard landmark), lights, cameras, references, annotations, and metric fixed.
- Expected movement: parts, silhouette, DreamSim, and LPIPS should improve in
  front, back, and rear diagonals as rigid armour replaces cleared holes; side
  and front diagonals should also improve. Palette may move. Landmarks should
  remain fixed.
- Reject if: aggregate improvement is less than `0.001`; either front or back
  materially regresses; revealed faulds/thighs contain holes, intersections,
  or unfinished geometry; the rigid character becomes visually incoherent;
  semantic publication breaks; or movement cannot be attributed to removing
  the occluders.

## Result

- Baseline distance: `0.6763572643366178`
- Candidate distance: `0.67437445103621`
- Absolute delta: `-0.0019828133004078374`
- Relative delta: `-0.293161%`
- Baseline report SHA-256: `80824a89b18f988af0ee9ab54f85d8109103265d83c2ba6f773619b8bd8bcdb2`
- Candidate report SHA-256: `4ad640cc1c2bfaa39b99bb1f30fea95b2a51151b2c58b8077b0325170ff6bbfe`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: rejected. The candidate cleared the aggregate margin, but removal
  exposed unfinished waist geometry and materially regressed the registered
  front-view gate.

## Diagnostics and visual review

All eight beauty renders and mask overlays were reviewed. Removing the cloth
revealed the three accepted fauld rows, but their front edges read as detached
horizontal bars above an open crotch rather than a continuous articulated
armour skirt. The same central opening is visible from both front diagonals.
The back is cleaner, but the belt now terminates directly into two plain thigh
columns; side views mainly lose the hanging strips without gaining structure.
There were no new mesh intersections or semantic-publication failures.

The aggregate improved by `0.001983`. DreamSim (`-0.017891`), parts
(`-0.002703`), and palette/texture (`-0.002441`) improved, while LPIPS
(`+0.014038`) and silhouette (`+0.004644`) regressed. Front worsened by
`0.003762`, left by `0.003695`, back-left by `0.003188`, and right by
`0.000381`; front-left, front-right, back, and back-right improved. Landmarks
were unchanged as expected. The mixed movement is causally consistent with
revealing real rigid geometry, but the front regression and unfinished visual
read trigger the pre-registered rejection conditions.

## Protocol reflection

The experiment corrected an important misconception: ignored objects can still
change every metric by occluding scored geometry before ignored pixels are
cleared. The numerical gain shows that a no-cloth direction is promising, but
cloth removal cannot be evaluated independently of the armour it reveals. A
future no-cloth trial should first author a connected tapered tasset shell, then
remove the occluders as one explicitly registered replacement theme. Accepting
the current intermediate state would reward a metric gain while making the
model visibly less finished.

## Next question

Can removing the three bright pauldron hoops, while retaining the compact cap
and rivets, eliminate the toy-like concentric shoulder read without leaving the
upper arms visually bare?

---

# 0032: Ablate the pauldron hoops

Status: accepted
## Pre-registration

- Observation: each accepted compact pauldron still carries three polished torus
  hoops that produce a strong circular, toy-like shoulder motif. Experiment 0026
  improved every view by darkening those hoops, led by front `-0.002538`, but
  missed the aggregate margin at `-0.000801`. Experiment 0027 confounded hoop
  removal with replacement of the accepted base sphere and failed because its
  three ellipsoid caps read as detached beads. The isolated effect of the six
  hoop meshes has not been measured while preserving the accepted base, anchors,
  and rivets.
- Hypothesis: removing only the six pauldron ridge tori will eliminate the false
  circular highlight motif and reduce aggregate distance through perceptual
  similarity, while the unchanged base spheres preserve coverage and silhouette.
- Change boundary: remove only the `for ridge in range(3)` block that creates
  `left_pauldron_ridge_0..2` and `right_pauldron_ridge_0..2`. Keep each
  `*_pauldron` sphere, both rivets, arm points, every other torus, all materials,
  body and equipment geometry, landmarks, lights, cameras, references,
  annotations, and metric fixed.
- Expected movement: DreamSim and LPIPS should improve, led by front and both
  front diagonals where experiment 0026 showed the strongest response. Rear
  views should improve less because the hoops are offset toward the front; side
  movement may be asymmetric due to equipment occlusion. Parts and silhouette
  may move slightly where torus pixels extend beyond the base spheres, while
  landmarks must remain fixed. Palette/texture may move in either direction.
- Reject if: aggregate improvement is less than `0.001`; front does not improve;
  neither DreamSim nor LPIPS improves; any landmark moves; either shoulder reads
  as an unarmoured smooth ball, exposes an upper-arm gap, or leaves a rivet
  floating in any view; silhouette or semantic-part damage outweighs the
  perceptual gain; or movement cannot be attributed to removing the hoops.

## Result

- Baseline distance: `0.6763572643366178`
- Candidate distance: `0.6740783861195763`
- Absolute delta: `-0.0022788782170415356`
- Relative delta: `-0.336934%`
- Baseline report SHA-256: `f62d3f959d99ff4fa3f48a06ef1dff4b8e54b8642aae7d883e9f8d32f36c6fb8`
- Candidate report SHA-256: `b21b2749febb4942f818874f483eb9d6e3764bc7a2ca3463e9bd4822f746022a`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: accepted. The isolated ablation cleared the numeric margin, improved
  both neural metrics and the registered front view, and removed the circular
  toy motif without exposing an attachment gap or dislodging a rivet.

## Diagnostics and visual review

All eight beauty renders and mask overlays were reviewed. The retained dark
metal spheres still cover both upper-arm anchors in every view. The four rivets
remain seated on the front edges: both are visible and attached in front and
front-right, one or both are occluded naturally by the shield, torso, or cap in
the other views. No floating geometry or new gap appears. The caps are simpler
and smoother, but their metal response, compact outline, and rivets still read
as shoulder armour rather than bare anatomy.

The aggregate improved by `0.002279`. DreamSim improved by `0.017593` and LPIPS
by `0.007770`; parts improved slightly by `0.000061` and landmarks were exactly
fixed. Palette/texture regressed by `0.011510` because the edit removed bright
metal pixels, and silhouette regressed by `0.002161` where the hoops had extended
beyond the caps. Seven views improved: front-right led at `-0.013747`, followed
by back-right `-0.004280`, back-left `-0.002378`, front `-0.001584`, back
`-0.000933`, left `-0.000250`, and front-left `+0.000224` was effectively flat.
Right regressed by `0.001128`; its exposed smooth cap lost useful highlight
structure, but the small localized regression is explained by the ablation.

## Protocol reflection

Isolating hoop deletion produced a much clearer signal than 0027's bundled
primitive replacement. The six tori contributed almost no semantic-part score,
but did influence silhouette, palette, and both neural measures. View movement
mostly followed visibility, with equipment occlusion explaining the asymmetric
front-right gain and right regression. The shoulders are now intentionally plain;
any later detail must be tested as a non-circular surface treatment rather than
restoring concentric rings. This closes hoop tuning as a useful direction.

## Next question

Can a narrowly tapered sword blade, with the accepted endpoints and pose fixed,
replace the current broad triangular cleaver read and improve exposed sword
views without disturbing global canonicalization?

---

# 0033: Narrow the tapered sword blade

Status: rejected
## Pre-registration

- Observation: the accepted sword blade uses widths `0.055` at the guard and
  `0.006` at the tip, producing a broad triangular cleaver silhouette. The
  reference uses a narrower, near-parallel double-edged blade. Sword-part
  distance remains at least `0.903971` in every accepted view and is exactly
  `1.0` in front, back, and back-left, despite the accepted pose and endpoints.
- Hypothesis: uniformly contracting the blade's perpendicular half-widths will
  make the fixed blade read as a slender pointed sword rather than a triangle and
  reduce exposed-view perceptual, sword-part, and silhouette error.
- Change boundary: change only `sword_blade` start width from `0.055` to `0.034`
  and end width from `0.006` to `0.004`. Keep blade start `(-0.50, 0.78)`, end
  `(-0.20, 0.08)`, depth `0.045`, material and Y position fixed. Keep guard,
  grip, pommel, arm, all landmarks including sword tip/hilt, body, shield,
  cameras, references, annotations, renderer, and metric fixed.
- Expected movement: silhouette, DreamSim, and LPIPS should improve
  most in front, front-left, front-right, right, and rear-right where the blade
  is exposed. Rear-left and back may move less because the reference sword is
  occluded. Landmarks must remain exactly fixed. Canonical foreground bounds
  should remain nearly fixed because the endpoints do not move; sword parts may
  be mixed because narrowing reduces mask area while position stays fixed.
  Palette may move only slightly as bright blade pixels are redistributed.
- Reject if: aggregate improvement is less than `0.001`; neither DreamSim nor
  LPIPS improves; any landmark
  moves; the blade detaches from the guard, becomes blunt, clips a leg or ground,
  or no longer reads as pointed in any view; exposed front views materially
  regress; or movement cannot be attributed to the width-profile change.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6739413680947006`
- Absolute delta: `-0.00013701802487564585`
- Relative delta: `-0.020327%`
- Baseline report SHA-256: `9b37fe308ce0daa81592489f9c33b2affab0933f7cc20f8ac45af95985435a77`
- Candidate report SHA-256: `5c377711996a9c8bcfbe3d40cb51fc2e4868b6b6fcc1c5b43faa6428a97b218f`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: rejected. The candidate remained visually sound but improved by only
  `0.000137`, well below the registered `0.001` decision margin, and DreamSim
  moved slightly in the wrong direction.

## Diagnostics and visual review

All eight beauty renders and mask overlays were reviewed. The narrower blade
remained seated under the guard, pointed, clear of the legs and ground, and
semantically classified as sword in every view. No landmarks moved. Its visual
effect was subtle: the front and front-right faces read slightly less cleaver-like,
while edge-on and occluded views were nearly indistinguishable.

Silhouette improved by `0.000770`, parts by `0.000129`, and LPIPS by `0.000099`;
DreamSim regressed by `0.000429` and palette/texture by `0.000116`. Front-right
improved most at `-0.002221`; front, front-left, left, and back improved by less
than `0.0008`. Back-right regressed by `0.001605`, right by `0.001167`, and
back-left by `0.000183`. The mixed exposed-view response and tiny aggregate
movement fail the preregistered gate.

## Protocol reflection

The width profile is not the main cause of the very high sword-part residuals.
Holding endpoints fixed successfully prevented broad canonical movement, but it
also demonstrated that the current mismatch is dominated by pose, occlusion, or
reference inconsistency rather than a few pixels of blade thickness. Further
width tuning would be parameter chasing; leave the accepted width in place and
move to a feature with evidence of a larger causal effect.

## Next question

Can analytically surface-conforming rear leather ribbons preserve experiment
0009's measured rear-view improvement while eliminating the buried and
fragmented harness geometry that forced its rejection?

---

# 0034: Add a conforming rear harness

Status: rejected
## Pre-registration

- Observation: the accepted rear cuirass is a blank smooth ellipsoid while both
  reference sheets show a brown leather X. Experiment 0009 added straight
  cylinder chords and improved aggregate distance by `0.002302`, including back
  `-0.005394` and back-left `-0.005746`, but was rejected because the chords
  tunneled through the curved torso and appeared as disconnected fragments.
- Hypothesis: two thin leather mesh ribbons sampled on the exact accepted
  cuirass ellipsoid will preserve the prior rear perceptual gain while remaining
  continuously seated, legible at the crossover, and invisible from the front.
- Change boundary: add one `rear_surface_y` helper that evaluates the accepted
  cuirass ellipsoid, one `rear_harness_ribbon` helper that creates a 12-segment
  surface ribbon with solidify thickness `0.008`, and exactly two leather ribbon
  objects from `(-0.24,1.43)` to `(0.22,1.02)` and its X mirror. Use width
  `0.050`, clearances `0.010` and `0.016`, and no buckle or rivets. Keep the
  cuirass, existing front strap, materials, anatomy, equipment, landmarks,
  cameras, renderer, references, annotations, and metric fixed.
- Expected movement: DreamSim and LPIPS should improve, led by back and
  back-left; back-right should be flat to improved. Front and front diagonals
  should be unchanged because the torso occludes the ribbons; side views may
  move slightly. Palette may improve from matching brown leather. Landmarks must
  remain fixed. Parts and silhouette should be nearly flat because the ribbons
  stay inside the torso projection and publish as body armour.
- Reject if: aggregate improvement is less than `0.001`; the rear mean of
  DreamSim and LPIPS does not improve; back or back-left regresses; any ribbon
  has a visible gap, burial, faceting, detached endpoint, gorget/belt clipping,
  or illegible crossover; any harness pixel leaks into front or either front
  diagonal; any landmark moves; mean parts or silhouette regresses by more than
  `0.003`; or movement cannot be attributed to the harness.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6741808214817437`
- Absolute delta: `+0.00010243536216747451`
- Relative delta: `+0.015196%`
- Baseline report SHA-256: `55c63e0205754deb74c76fd9f2d2a84ce9dd6c634d41cf3d1f56208ed7f3bd1f`
- Candidate report SHA-256: `0f7fd4e748ee8a6fed03846da49be7065c570280350d1a6fad91dedba9bfb95e`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: rejected. The candidate worsened aggregate distance, regressed the
  registered back view and DreamSim, and failed to produce a continuous legible
  X across the rear cuirass.

## Diagnostics and visual review

All eight beauty renders and mask overlays were reviewed. The front and both
front diagonals remained effectively unchanged and showed no harness leakage.
The rear views exposed only short orange-brown fragments near the upper anchors;
the long diagonal bodies and crossover disappeared against or into the dark
cuirass. The result therefore still reads as disconnected pieces rather than a
load-bearing X, despite the analytic surface sampling. Side views showed at
most a tiny upper endpoint. Landmarks, parts, and silhouette stayed exactly
fixed, confirming that the ribbons remained within the body-armour projection.

Aggregate distance worsened by `0.000102`. LPIPS improved by `0.002104`, while
DreamSim regressed by `0.001136` and palette/texture by `0.000461`; all classical
components were fixed. Back regressed by `0.000221`, back-right by `0.001241`,
and back-left improved only `0.000169`. Left improved `0.000795`; the four front
or right views moved by less than `0.000005`. Both the numeric and visual gates
therefore reject the candidate.

## Protocol reflection

The analytic ellipsoid eliminated broad silhouette damage but did not make the
feature visibly continuous. Experiment 0009's larger score gain evidently came
from the much more exposed cylinders, not merely the semantic presence of an X.
A useful rear harness needs a deliberately offset, contrast-aware surface or a
rear plate beneath it; simply conforming a dark ribbon to the existing dark
mass is ineffective. Retire direct harness-only tuning until the rear cuirass
surface itself changes.

## Next question

Can a skin-colour-only adjustment make the bright orange face closer to the
reference's darker weathered complexion without losing separation from hair
and armour?

---

# 0035: Darken the skin palette

Status: rejected
## Pre-registration

- Observation: the accepted face and nose use `warm_skin` base colour
  `(0.42, 0.22, 0.13)`, which renders as bright saturated orange. The reference
  warrior has a darker, weathered complexion with subdued red-orange highlights.
  This mismatch is exposed in front, both front diagonals, and both sides while
  geometry and landmarks are already fixed.
- Hypothesis: multiplying only the skin base-colour magnitude by `0.70`, to
  `(0.294, 0.154, 0.091)`, will
  improve palette/texture and neural similarity in face-visible views without
  changing silhouette, semantic parts, or landmark alignment.
- Change boundary: change only the RGB tuple passed to `warm_skin` from
  `(0.42, 0.22, 0.13)` to `(0.294, 0.154, 0.091)`. Keep metallic `0.0`, roughness
  `0.74`, material assignment, all geometry, hair and beard colour, eyes,
  lighting, cameras, references, annotations, landmarks, renderer, and metric
  fixed.
- Expected movement: palette/texture, DreamSim, and LPIPS should improve in
  front, front-left, front-right, left, and right. Rear views should be nearly
  flat because hair occludes most skin. Parts, silhouette, and landmarks must be
  exactly fixed.
- Reject if: aggregate improvement is less than `0.001`; palette/texture does
  not improve; neither DreamSim nor LPIPS improves; both front and front-left
  regress; any classical geometry component or landmark moves; the face loses
  readable separation from hair, beard, or steel; skin becomes unnaturally gray
  or underexposed; or movement cannot be attributed to the colour change.

## Result

- Baseline distance: `0.6740783792344194`
- Candidate distance: `0.6752308399412784`
- Absolute delta: `+0.0011524607068590376`
- Relative delta: `+0.170968%`
- Baseline report SHA-256: `78b447b5d8f5ffd0673d636fc5751e8d9f649ba2e5b0af9fc9ebf22ba2fce8aa`
- Candidate report SHA-256: `dd70578b2795c2be5be1cc7d44eaed184104d58baeebeec976ba3ff94270eca6`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: rejected. The candidate worsened aggregate distance and every
  skin-visible view; both neural components regressed despite a negligible
  palette/texture improvement.

## Diagnostics and visual review

All eight beauty renders and mask overlays were reviewed. The darker skin stayed
readable against the beard, hair, gorget, and armour and did not become gray or
underexposed. Geometry publication was unchanged exactly: landmarks, parts, and
silhouette were fixed. The appearance change was limited to the head and nose as
registered. Nevertheless, the darker face flattened the warm-lit facial planes
and looked muddier rather than more weathered; no added geometry or texture
exists to recover the reference's detail.

Aggregate distance regressed by `0.001152`. DreamSim worsened by `0.007370` and
LPIPS by `0.000860`; palette/texture improved only `0.000234`. Front-right
regressed most at `+0.003346`, followed by front-left `+0.002071`, front
`+0.001969`, left `+0.001798`, right `+0.001465`, back-left `+0.000863`, and
back-right `+0.000780`; back was exactly unchanged. This exposure pattern is
causally clean and decisively rejects darker global skin.

## Protocol reflection

The experiment isolated brightness successfully and showed that the accepted
orange skin is not improved by a uniform luminance reduction. The reference's
weathered look depends on facial form, local contrast, and texture rather than a
darker flat swatch. Retire nearby RGB tuning instead of searching the colour
cube; later face work should use a separately registered geometry or localized
detail hypothesis.

## Next question

Can assigning the accepted blackened iron to only the bright toroidal gorget
remove the last large circular toy highlight while preserving a legible armored
collar around the head?

---

# 0036: Blacken the gorget

Status: rejected
## Pre-registration

- Observation: the accepted gorget is a complete torus using polished steel, so
  it renders as a broad bright silver-orange annulus around the neck in front,
  rear, and diagonal views. The references show a dark high plate collar with
  restrained edge highlights. Accepted experiments 0016, 0024, and 0032 showed
  that dark metal and removal of false circular highlights improve this asset.
- Hypothesis: changing only the gorget from polished steel to accepted
  blackened iron will suppress the false bright neck ring while retaining enough
  specular response to read as an armoured collar, reducing perceptual distance
  without changing geometry or semantic publication.
- Change boundary: in only `torus("gorget", (0, 0, 1.50), 0.18, 0.035, bright,
  root)`, change the material argument from `bright` to `black`. Keep its
  location, radii, helper, every other polished-steel assignment, all materials,
  head, hair, cuirass, shoulders, body, equipment, landmarks, lights, cameras,
  references, annotations, renderer, and metric fixed.
- Expected movement: DreamSim and LPIPS should improve in all eight views, led
  by front, back, and diagonals where the annulus exposes a broad face. Side
  views may improve less due to occlusion. Palette/texture should be flat to
  improved. Parts, silhouette, and landmarks must remain exactly fixed.
- Reject if: aggregate improvement is less than `0.001`; neither DreamSim nor
  LPIPS improves; front or back regresses by more than `0.001`; any classical
  geometry component or landmark moves; the collar becomes visually absent,
  makes the head appear to float, merges into hair or cuirass, produces a black
  specular artifact in any view; or movement cannot be attributed to material.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6749148039150398`
- Absolute delta: `+0.0008364177954635066`
- Relative delta: `+0.124083%`
- Baseline report SHA-256: `a29e7ce5ba6e6023c7b66b9b647023284a22d830295c700896d1f380cb46a0b7`
- Candidate report SHA-256: `3341358a4f97b38477747a1218de3a42c9775ffc716bc445f6ca17cbefcfb82c`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: rejected. The dark collar stayed visually legible, but aggregate,
  DreamSim, palette/texture, back, and right-facing views regressed.

## Diagnostics and visual review

All eight beauty renders and mask overlays were reviewed. The blackened torus
remained a readable collar and did not make the head float or merge fully into
the hair and cuirass. No black artifact appeared. Its form was more subdued,
but the accepted polished edge had been providing useful separation around the
neck, especially from the rear and right. Parts, silhouette, and landmarks were
exactly fixed as registered.

Aggregate distance worsened by `0.000836`. DreamSim regressed by `0.002352` and
palette/texture by `0.002698`; LPIPS improved only `0.000444`. Right regressed
most at `+0.004702`, followed by back-right `+0.001387`, back `+0.001258`, and
back-left `+0.000672`. Front was flat, front-left nearly flat, while front-right
improved `0.001785` and left `0.000708`. The back regression independently trips
the registered gate.

## Protocol reflection

The accepted 0024 and 0032 lessons do not transfer mechanically to every bright
curve. The gorget's continuous highlight is not merely a toy motif; it also
separates the head from the dark torso. Material-only darkening preserves shape
but removes that useful depth cue. Retire gorget palette tuning. If the collar is
revisited, its geometry should become a real high plate collar while retaining
a narrow bright edge, as a separately registered construction experiment.

## Next question

Can changing only the two polished gauntlets to accepted dark steel reduce their
bright spherical toy read without sacrificing hand and equipment separation?

---

# 0037: Use dark steel for the gauntlets

Status: rejected
## Pre-registration

- Observation: both accepted gauntlets are flattened spheres assigned to
  polished steel, producing bright round highlights at the weapon and shield
  hands. The reference uses dark articulated metal gloves integrated with the
  vambraces. The current hand landmarks and equipment contacts are fixed, so
  material is the cleanest isolated variable.
- Hypothesis: assigning only the two gauntlets to accepted dark steel will reduce
  their bright spherical toy read and improve neural and palette similarity
  without altering hand geometry, semantic parts, or equipment alignment.
- Change boundary: change only the material argument in
  `sphere(side + "_gauntlet", hand, (0.11, 0.10, 0.13), bright, root)` from
  `bright` to `steel`. Keep scale, hand points, both arms, sword and shield,
  every other polished-steel assignment, materials, body geometry, landmarks,
  lights, cameras, references, annotations, renderer, and metric fixed.
- Expected movement: DreamSim, LPIPS, and palette/texture should improve most in
  front and front diagonals, with smaller view-dependent gains elsewhere due to
  shield, sword, and torso occlusion. Parts, silhouette, and landmarks must be
  exactly fixed.
- Reject if: aggregate improvement is less than `0.001`; neither DreamSim nor
  LPIPS improves; palette/texture materially regresses without larger coherent
  neural gains; any classical geometry component or landmark moves; either hand
  becomes visually lost against its vambrace, shield, sword, or torso; equipment
  contact becomes ambiguous; or movement cannot be attributed to material.

## Result

- Baseline distance: `0.6740783727964181`
- Candidate distance: `0.6745321141749914`
- Absolute delta: `+0.0004537413785732358`
- Relative delta: `+0.067313%`
- Baseline report SHA-256: `68115696c96ab05f698610988f554c7902cbe3b441578c942df22b02139bc20a`
- Candidate report SHA-256: `ba04f4aedf450ac635d41825871787ff2fb417a3fd7f685f1f2c2f4074d7d451`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: rejected. The material-only candidate preserved all geometry and
  contact, but worsened aggregate distance, both neural components, and seven
  of eight views.

## Diagnostics and visual review

All eight beauty renders and mask overlays were reviewed. The dark gauntlets
remained metallic and attached at both hand anchors. Sword guard/grip contact
and shield-hand attachment remained readable where exposed, with no black
artifact or semantic movement. However, the darker spheres merged more closely
with their already dark vambraces and removed useful localized hand separation.
Parts, silhouette, and landmarks were exactly fixed.

Aggregate distance regressed by `0.000454`. DreamSim worsened by `0.001719` and
LPIPS by `0.000510`; palette/texture improved only `0.000131`. Right improved
`0.002017`, but front regressed `0.001116`, front-right `0.000980`, front-left
`0.000892`, back-right `0.000843`, back `0.000670`, back-left `0.000342`, and
left `0.000227`. Front also trips the registered per-view gate.

## Protocol reflection

Small equipment-contact surfaces behave like the gorget: bright metal supplies
useful articulation even when its primitive is simple. Darkening them cannot
substitute for modeled fingers or plate segmentation. The exact invariance of
classical metrics validates the isolation, while the broad neural regression
closes gauntlet palette tuning. Future hand work should be geometry-only and
retain a controlled edge highlight.

## Next question

Can changing the complete polished lower-leg trim family--both knee ridges and
all four greave bands--to accepted dark steel suppress false leg hoops while
retaining readable segmentation?

---

# 0038: Darken the lower-leg trim

Status: rejected
## Pre-registration

- Observation: the accepted lower legs retain six high-contrast polished-steel
  accents: two broad knee-ridge boxes and four complete greave-band tori. They
  create bright smooth hoops across otherwise dark cylindrical legs, while the
  reference uses dark segmented plates with restrained seams. Experiment 0032
  showed that false concentric armour highlights can dominate perceptual error.
- Hypothesis: assigning the complete lower-leg trim family to accepted dark
  steel will suppress false rings while retaining the authored seams, improving
  palette/texture and neural similarity with exact geometric invariance.
- Change boundary: change only the material of `left/right_knee_ridge` and
  `left/right_greave_band_0/1` from `bright` to `steel` in the existing leg
  loop. Keep their geometry, boots, knees, shins, greaves, every other polished
  edge, shared materials, body and equipment, landmarks, cameras, references,
  annotations, renderer, and metric fixed. Treat all six objects as one
  indivisible trim family.
- Expected movement: DreamSim and LPIPS should improve; front,
  front-left, front-right, and back should lead because both legs expose the
  trim, with side and rear diagonals smaller or asymmetric through occlusion.
  Palette/texture should be flat to improved but is not a necessary gate after
  prior appearance-signal disagreement. Parts, silhouette, landmarks, and
  canonical bounds must remain exactly fixed.
- Reject if: aggregate improvement is less than `0.001`; neither DreamSim nor
  LPIPS improves; front does not improve; fewer than four views improve; the
  mean of back, back-left, and back-right regresses by more than `0.001`; any
  parts, silhouette, or landmark value moves; bands disappear into
  the greaves, knees become unreadable, legs merge into featureless black
  columns, material response is inconsistent across the six objects; or
  movement cannot be attributed to the registered material family.

## Result

- Baseline distance: `0.6740783925575773`
- Candidate distance: `0.6736024809905212`
- Absolute delta: `-0.0004759115670560643`
- Relative delta: `-0.07060181312894014%`
- Baseline report SHA-256: `1c80291112cb579fe1ac88b754ae36da7e45259ba374de17c007cbb35d612733`
- Candidate report SHA-256: `5b097da7f49364056c6ea6b7514177d6cbd131566347b49bff9a0033fa8ba486`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Rejected. The candidate missed the `0.001` improvement margin and
  failed the registered front-view and neural-agreement gates.

## Diagnostics and visual review

All eight beauty renders and all eight mask overlays were reviewed. The edit
left the semantic masks, silhouette, and landmarks exactly invariant, as a
material-only experiment should. LPIPS improved by `-0.0040140525`, but
DreamSim regressed by `+0.0009953231` and palette/texture regressed by
`+0.0011314989`. Back, back-left, left, and right improved, led by back at
`-0.0016360741`; front regressed by `+0.0011515482` and front-left by
`+0.0016650766`.

The six darkened pieces remained attached and metallic in every view, with no
render artifact or inconsistent assignment. The front and front-left beauties,
however, lost useful bright knee/greave separation and made the lower legs read
more like dark columns. Rear and side views looked slightly calmer. This is a
coherent but sub-threshold trade, not an acceptable forward step.

## Protocol reflection

The experiment supports only a family-level conclusion because it intentionally
combined the geometrically distinct knee ridges and greave bands. Their bright
material is not merely noise: it provides useful front articulation even while
the rings are somewhat toy-like. The exact invariance of every classical term
also confirms that the observed movement came only from appearance. Do not tune
the whole family again. A future greave-band-only ablation could isolate the
circular subfamily, but immediate nearby material searching would be weak
protocol practice.

## Next question

Can replacing the accepted donut-shaped gorget with a high dark plate collar and
a narrow polished rim preserve the separation that 0036 proved useful while
correcting the collar form across all eight views?

---

# 0039: Replace the gorget ring with a high plate collar

Status: rejected
## Pre-registration

- Observation: the accepted gorget is one complete polished torus at
  `(0, 0, 1.50)`, with major radius `0.18` and minor radius `0.035`, so it
  reads as a thick horizontal donut. The references use a narrower, vertically
  raised dark collar with restrained bright edge highlights. Experiment 0036
  showed that simply blackening the torus removes useful head/torso separation;
  its incorrect form remains untested.
- Hypothesis: replacing only the thick torus with one tapered dark-steel collar
  and a narrow polished top rim will preserve head separation while changing
  the donut into a high armoured collar, reducing perceptual and upper-body
  shape error across the turntable.
- Change boundary: remove only
  `torus("gorget", (0, 0, 1.50), 0.18, 0.035, bright, root)` and add one helper
  used only by its replacement assembly. The helper builds a closed 48-segment
  hollow annular shell with bottom `z=1.455`, outer radius taper
  `0.205 -> 0.180`, inner radius taper `0.155 -> 0.150`, and top contour
  `1.555 - 0.035 * max(0, -sin(theta)) + 0.025 * max(0, sin(theta))`. It also
  builds a contour-following polished rim spanning radii `0.168..0.182` and
  `top_z +/- 0.004`. Use `steel` for the shell and `bright` for the rim, with
  hard mesh normals and no bevel. Keep head/hair, cuirass, shoulders, material
  definitions, every other torus, body/equipment, landmarks, lights, cameras,
  references, annotations, renderer, and metric fixed. Both replacement meshes
  remain `body_armour` through the existing publication rule.
- Expected movement: DreamSim and LPIPS should improve across all eight views,
  led by front and back where the old annulus exposes its broadest face. Parts
  and silhouette should improve or move modestly as the collar becomes narrower
  and taller; palette/texture may be mixed because the polished area shrinks but
  remains at the rim. Landmarks must remain exactly fixed. Unlike 0036, the head
  should remain visibly separated from the torso in every view.
- Reject if: aggregate improvement is less than `0.001`; front or back regresses
  by more than `0.001`; neither DreamSim nor LPIPS improves; the head appears to
  float, becomes pinched or embedded; the collar intersects the face, hair,
  breastplate, cuirass, or pauldrons; the rim floats, z-fights, or disappears;
  the result reads as a traffic cone or plain cylinder rather than plate armour;
  the shell has a backface hole or hidden solid cap through the neck;
  any landmark moves; mean parts or silhouette regresses by more than `0.003`
  without larger coherent perceptual gains; or movement cannot be attributed to
  the registered collar construction.

The original preregistration named the existing solid `cone()` helper. A
constructor audit performed after the baseline but before any candidate render
showed that this would put a capped disk through the neck. The exact boundary
above supersedes that invalid literal set before candidate evidence was
observed; the causal question remains torus-to-high-collar replacement.

## Result

- Baseline distance: `0.6740783792344194`
- Candidate distance: `0.6767016819603526`
- Absolute delta: `+0.002623302725933252`
- Relative delta: `+0.3891687979835005%`
- Baseline report SHA-256: `5dbad5f295786157eadd4a44fef982377cc7f4aca320a891517bb8c2b75c3857`
- Candidate report SHA-256: `2846f7b3950db5e28b2ee163743f094b7fdd693e62727e366e2ae45dd3383279`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Rejected. The candidate increased aggregate distance and failed the
  registered back/right neural and visual-coherence gates.

## Diagnostics and visual review

All eight candidate beauties and all eight mask overlays were reviewed. The
mesh was closed, continuously seated, and free of z-fighting or backface holes;
the front dip also avoided cutting through the beard. Front, front-left, and
front-right improved by `-0.0027382256`, `-0.0019771718`, and `-0.0032103736`.
Those gains were overwhelmed by right `+0.0075490662` and back-right
`+0.0117319017`, with back also worsening `+0.0039835024`.

The tall rear and side walls read as a broad smooth funnel around the head,
especially in back, back-right, and right. The narrow rim remained visible, but
its bright side arc still recreated a ring-like cue. DreamSim worsened by
`+0.0089594424`, LPIPS by `+0.0018190742`, and palette/texture by
`+0.0035082555`; only parts improved slightly (`-0.0007387491`). Landmarks were
exactly fixed and silhouette moved only `+0.0001498434`, so the failure is a
localized appearance/form result rather than canonicalization contamination.

## Protocol reflection

The constructor correction was worthwhile: it prevented a solid cap from
invalidating the trial and yielded a clean causal result. The split response
shows that the reference's front collar cue does not transfer to a tall uniform
rear enclosure. The old bright torus is imperfect, but it preserves head
separation more consistently around this stylized body. Close high-collar work;
do not retune contour heights or radii nearby. Future neck work would require a
fundamentally different articulated multi-plate design, not another annulus.

## Next question

Can a single low-profile heraldic relief inside the accepted shield field reduce
the large exposed-face appearance residual without disturbing its already
accepted outline, pose, boss, landmarks, or canonical bounds?

---

# 0040: Add seated shield heraldry

Status: rejected
## Pre-registration

- Observation: after accepted outline, slab, pose, and boss refinements, the
  shield field remains a large blank dark plane. Both references show subdued
  bronze/gold heraldic linework across the field. Further outline or pose work
  risks reopening accepted geometry, while an interior feature is untested.
- Hypothesis: adding one contiguous, low-profile brass heraldic relief fully
  inside the accepted field will reduce exposed shield DreamSim, LPIPS, and
  palette error without changing outline, landmarks, bounds, or semantic shape.
- Change boundary: add exactly one `shield_heraldry` prism after the existing
  shield boss using the preregistered 14-point symmetric spear/fleur polygon,
  depth `0.014`, bevel `0.004`, brass material, and `location.y=-0.358`. The
  accepted field front face is `-0.351`, so the relief rear face seats exactly
  on it; the boss remains unchanged and occludes its center. Keep shield outer
  and inner polygons, slab depths, boss, rivets, pose, landmarks, all materials,
  sword/body, cameras, lights, references, annotations, renderer, and metric
  fixed. The `shield_` prefix preserves shield semantic publication.
- Expected movement: front and front-left should lead through DreamSim, LPIPS,
  and palette/texture; front-right and left may improve where the face remains
  exposed. Rear and right edge-on views should be nearly flat. Parts,
  silhouette, landmarks, and canonical bounds should remain exactly or
  effectively fixed because the relief lies inside the opaque shield region.
- Reject if: aggregate improvement is less than `0.001`; front and front-left
  do not both improve; neither DreamSim nor LPIPS improves; palette worsens by
  more than `0.002` without a larger coherent neural gain; the relief floats,
  sinks, z-fights, clips the inset boundary, protrudes through the rear, or its
  boss overlap looks accidental; the motif reads as a modern cross, stick
  figure, or saturated toy decal rather than restrained heraldry; any shield
  landmark or classical geometry component moves materially; rear views change
  beyond tiny render noise; or movement cannot be attributed to the relief.

## Result

- Baseline distance: `0.674078384839113`
- Candidate distance: `0.674931678471542`
- Absolute delta: `+0.0008532936324290308`
- Relative delta: `+0.12658670736530031%`
- Baseline report SHA-256: `88354055a37b7def07514e4c171719ecb28987a7fb2bbc6ce093b9a4f01a4f0f`
- Candidate report SHA-256: `bbe78346815f1957f1df9b6c4c265b31e23ae482da52c59be3d830f5d70db485`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Rejected. The candidate increased distance and failed both exposed
  shield-view and appearance-component gates.

## Diagnostics and visual review

All eight beauties and all eight mask overlays were reviewed. The relief was
physically seated, stayed inside the shield field, did not protrude through the
rear, and left landmarks exactly fixed. Its tiny parts (`+0.0000017632`) and
silhouette (`+0.0000993115`) movement is consistent with antialiasing at an
interior raised edge rather than a bound change.

Visually, the pointed brass polygon plus the retained spherical boss read as a
bright sunburst or modern emblem, not subdued worn heraldry. The effect was most
prominent in front and front-left. DreamSim worsened `+0.0032790303`, LPIPS
`+0.0027166754`, and palette/texture `+0.0017988727`. Front worsened
`+0.0003536919`, front-left `+0.0042639083`, and front-right `+0.0030286431`;
rear views stayed within roughly `0.00003`, as predicted. The result is a clean
appearance failure rather than a placement or protocol failure.

## Protocol reflection

The metric and visual gate agree that adding clean saturated relief to the
stylized shield moves away from the weathered reference. Interior detail is not
automatically beneficial: its shape, contrast, and interaction with existing
hardware matter. Do not tune this polygon or add another decal nearby. The
accepted boss already supplies a dominant circular motif, and prior experiment
0022 supplies a stronger monotonic clue: shrinking it improved aggregate and
all exposed shield views. Test complete boss removal separately, without any
heraldry, as a cleaner next causal step.

## Next question

Does removing only the remaining spherical shield boss continue experiment
0022's accepted monotonic improvement while leaving the shield field coherent,
or is the smaller boss now necessary to keep the blank field visually finished?

---

# 0041: Remove the shield boss

Status: rejected
## Pre-registration

- Observation: the accepted shield still has a bright spherical brass boss on
  an otherwise flat dark field, while both references show a flatter weathered
  face without a prominent circular boss. Experiment 0022 reduced the boss from
  `(0.110, 0.030, 0.116)` to `(0.065, 0.030, 0.068)` and improved aggregate by
  `0.002153`, including roughly `0.006..0.008` gains in the exposed front views.
  Experiment 0040 then showed that adding relief around the boss makes the false
  motif stronger, not more reference-like.
- Hypothesis: removing only the remaining spherical boss will continue 0022's
  monotonic improvement by flattening the shield face, lowering exposed-view
  neural and palette error without reopening accepted shield shape or pose.
- Change boundary: delete only
  `sphere("shield_boss", (0.530, -0.388, 1.230), (0.065, 0.030, 0.068), brass,
  root, 28)`. Keep outer and field polygons, slab depths and Y positions,
  rivets, all materials, shield pose and landmarks, sword/body, cameras, lights,
  references, annotations, renderer, and metric fixed. Add no replacement
  emblem, fastener, texture, or surface detail.
- Expected movement: front, front-left, and front-right should improve most
  through DreamSim, LPIPS, and palette/texture; left may improve where the face
  remains exposed. Rear and edge-on views should be effectively flat. Parts and
  landmarks must be exactly fixed; silhouette may move only by tiny side-profile
  antialiasing because the boss lies inside the accepted shield outline.
- Reject if: aggregate improvement is less than `0.001`; the three exposed front
  views do not improve coherently; neither DreamSim nor LPIPS improves; the
  shield reads unfinished, featureless, hollow, or visibly missing a necessary
  fastener; any hole or shading artifact appears where the boss was removed;
  parts or landmarks move; silhouette moves materially; rear views change
  beyond tiny render noise; or movement cannot be attributed to boss removal.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6748198469606594`
- Absolute delta: `+0.0007414608410831747`
- Relative delta: `+0.10999623431801376%`
- Baseline report SHA-256: `3a008bcd12eaa6113e97c1f42d912b6377ffe7e5e518e7cc99decc3ff08c419e`
- Candidate report SHA-256: `dd78be7c2941371c66c04d161bd9fdb771aee2618ae9b23c5c04d9da53382740`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Rejected. Appearance improved as hypothesized, but removal changed
  the left-view canonical bound and worsened aggregate distance.

## Diagnostics and visual review

All eight beauties and overlays were reviewed. The boss disappeared cleanly:
there was no field hole, shading artifact, rear protrusion, or visual detachment,
and the blank shield remained coherent. DreamSim improved `-0.0031269938`,
LPIPS `-0.0007005185`, palette/texture `-0.0001947415`, and parts
`-0.0004796213`. Front, front-left, and front-right improved coherently by
`-0.0044624492`, `-0.0018290918`, and `-0.0061054523`.

The boss was nevertheless the extreme foreground projection in the edge-on left
view. Removing it changed canonical framing, causing left to regress by
`+0.0202458946`, silhouette mean by `+0.0061176304`, and landmark mean by
`+0.0038990935`. Other rear/edge views stayed within `0.0001`. The aggregate
therefore worsened despite a visually and neurally cleaner shield face.

## Protocol reflection

Experiment 0022's local monotonic improvement does not extrapolate to complete
removal under the current canonicalization: the final boss volume participates
in the left-view subject bound. This is a genuine metric tradeoff, not evidence
that the bright sphere looks reference-like. The protocol correctly prevents
accepting a change that improves selected views by destabilizing normalized
framing elsewhere. Keep the accepted compact boss and close boss-size tuning;
do not search an intermediate scale nearby.

## Next question

Can narrowing only the oversized front cross-body strap preserve its five seated
rivets while reducing the thick toy-baton appearance in the three front-facing
views, with rear views and canonical bounds fixed?

---

# 0042: Compact the cross-body strap

Status: rejected
## Pre-registration

- Observation: the accepted front leather strap is a smooth cylinder of radius
  `0.034` crossing most of the breastplate, so its full width `0.068` reads as a
  thick toy baton. The reference has a flatter, narrower load-bearing strap.
  Experiment 0030 already established the accepted darker leather palette, so
  geometry is the isolated remaining lever.
- Hypothesis: narrowing only the strap while preserving endpoints, depth,
  rivets, colour, and pose will reduce the dominant false stripe without losing
  attachment or readability, improving front-facing neural similarity.
- Change boundary: change only the radius of `cross_body_strap` from `0.034` to
  `0.024`. Keep endpoints `(-0.24,-0.315,1.44)` and
  `(0.22,-0.315,1.00)`, vertices, Y seating, leather material, all five rivet
  centers and scales, breastplate, every other leather object, all body and
  equipment geometry, landmarks, cameras, lights, references, annotations,
  renderer, and metric fixed. Rivet diameter `0.026` remains smaller than the
  new full strap width `0.048`.
- Expected movement: DreamSim and LPIPS should improve in front, front-left,
  and front-right; side views may move slightly and rear views should be flat.
  Palette/texture may improve modestly. Parts may move only inside the existing
  torso outline, while silhouette, landmarks, and canonical bounds remain fixed.
- Reject if: aggregate improvement is less than `0.001`; front fails to improve;
  neither DreamSim nor LPIPS improves; the strap breaks at either endpoint,
  sinks into the plate, becomes string-like, or any rivet overhangs or floats;
  rear views change materially; classical movement exceeds `0.002` without an
  interior-mask explanation; or movement cannot be attributed to strap radius.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6733844263548396`
- Absolute delta: `-0.0006939597647366291`
- Relative delta: `-0.10294941642195394%`
- Baseline report SHA-256: `5b83c5e4a50cf3558cb677225cbec5e76b75ce80e7403d629201e97f2ec227eb`
- Candidate report SHA-256: `fcdba6476a4a81a81988725fed977153c4514318a480e214a997719baebb5fa1`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Rejected. The edit was visually coherent and improved every
  component, but missed the fixed `0.001` aggregate acceptance margin.

## Diagnostics and visual review

All eight beauties and overlays were reviewed. The narrower strap remained
continuously seated at both endpoints and retained a readable leather band.
All five rivets remained centered and visibly seated; none overhung or floated.
No canonical-bound or landmark movement occurred.

Every component improved: DreamSim `-0.0025474727`, LPIPS `-0.0012306347`,
palette/texture `-0.0017952483`, parts `-0.0002209474`, and silhouette
`-0.0004546187`. Front, front-left, and front-right improved by
`-0.0016271767`, `-0.0014735013`, and `-0.0020234259`; right improved most at
`-0.0032507356`. Rear changes were small regressions from `+0.00009` to
`+0.00037`. The coherent aggregate gain of `0.000694` is nevertheless below the
preregistered threshold.

## Protocol reflection

This is a real directional signal, not an accepted state change. The fixed
margin protects the chain from accumulating dozens of small renderer/model
fluctuations, so a visually pleasing near miss cannot be waived after seeing
the score. Do not search nearby strap radii immediately. The result does show
that front interior detail can improve without destabilizing bounds, and that
the rivet-to-band scale remains viable at `0.024` if a future broader strap
assembly redesign independently justifies revisiting it.

## Next question

Can restoring a brighter silver material on only the accepted sword blade
improve its conspicuously dark weapon read in exposed views while leaving blade
geometry, pose, semantic masks, and every classical component fixed?

---

# 0043: Restore a polished sword-blade surface

Status: rejected
## Pre-registration

- Observation: the accepted sword pose is diagonal and its geometry is now
  closed after experiment 0033, but the blade renders nearly black. The
  reference blade is conspicuously silver with dark edge definition. Experiment
  0016 darkened the shared polished-edge family globally; a blade-only surface
  correction remains untested.
- Hypothesis: raising only the blade base-colour magnitude while preserving its
  accepted metallic response, roughness, geometry, and pose will restore a
  silver weapon read and reduce exposed-view neural and palette error.
- Change boundary: add `polished_blade` with base colour
  `(0.36, 0.37, 0.36)`, metallic `0.84`, and roughness `0.26`, then change only
  the `sword_blade` material argument from `bright` to `blade_steel`. Keep the
  accepted blade endpoints, widths, depth, bevel, Y position, guard, grip,
  pommel, shared `bright` definition and every other assignment, all body and
  shield geometry, landmarks, lights, cameras, references, annotations,
  renderer, and metric fixed.
- Expected movement: DreamSim, LPIPS, and palette/texture should improve in
  front, front-right, right, and back-right, with smaller movement in
  front-left and left through occlusion or edge-on presentation. Parts,
  silhouette, landmarks, and canonical bounds must remain exactly fixed.
- Reject if: aggregate improvement is less than `0.001`; front and at least one
  of front-right or right do not improve; neither DreamSim nor LPIPS improves;
  the blade clips to white, loses dark edge definition, looks emissive or
  plastic, or no longer separates from the guard; any classical component or
  landmark moves; rear occluded views change materially; or movement cannot be
  attributed to the blade base colour.

## Result

- Baseline distance: `0.6740783801825001`
- Candidate distance: `0.6735401592627356`
- Absolute delta: `-0.0005382209197645205`
- Relative delta: `-0.07984545055707059%`
- Baseline report SHA-256: `817573402641f4286728b6c514a26494f4ceb1e9a33ee07504cab32a81aaf5ca`
- Candidate report SHA-256: `6254cfbb18d046abd0fc0ee45cc371d71d18f53f9098a2a71de6267bb478a26a`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Rejected. The candidate improved DreamSim and most views, but
  missed the acceptance margin while LPIPS and palette/texture regressed.

## Diagnostics and visual review

All eight beauties and overlays were reviewed. The blade stayed seated beneath
the guard, retained dark edge definition, and did not clip, bloom, or look
emissive. Semantic masks, silhouette, landmarks, and canonical bounds remained
exactly invariant. The surface was visibly somewhat more silver in exposed
front and diagonal views, though the change was subtle under the fixed light.

DreamSim improved `-0.0039781928`, while LPIPS regressed `+0.0014369190` and
palette/texture regressed `+0.0002416737`. Seven views improved, led by
back-right at `-0.0023305795`; back-left alone regressed `+0.0000801377`.
Front, front-right, and right all improved as registered, but the aggregate gain
was only `0.000538`, below the fixed margin.

## Protocol reflection

Blade brightness is directionally useful to DreamSim but not robust across the
appearance ensemble. Exact classical invariance confirms clean isolation. Do
not search nearby blade RGB values: that would tune against one neural signal
after observing disagreement. Geometry and pose are already closed, so sword
surface work should also be retired unless a future material-system change
creates a genuinely new hypothesis.

## Next question

Can replacing only the bulbous spherical nose with a narrow tapered primitive
improve facial form in front and profile views without changing head scale,
skin palette, eyes, beard, or crown/chin anchors?

---

# 0044: Replace the bulb nose with a tapered nose

Status: rejected
## Pre-registration

- Observation: the accepted nose is a UV sphere centered at
  `(0, -0.138, 1.63)` with scale `(0.024, 0.032, 0.055)`, producing a long
  smooth egg or bulb. The references show a narrower angular bridge and tip.
  Global head compression and skin-palette work are closed, but this isolated
  facial primitive has not been tested.
- Hypothesis: replacing the complete bulbous ellipsoid with a compact attached
  forward-pointing tapered cone, while preserving its center, front/back depth
  envelope, skin material, and semantic name, will improve facial form without
  moving the head, eyes, beard, or semantic anchors.
- Change boundary: replace only
  `sphere("nose", (0,-0.138,1.63), (0.024,0.032,0.055), skin, root, 24)` with
  `cone("nose", (0,-0.138,1.63), 0.026,0.010,0.064, skin, root, 24,
  rotation=(math.pi / 2,0,0))`. The `+90` degree X rotation points the broad
  `radius1` base toward `+Y` into the face and the narrow `radius2` tip toward
  camera-facing `-Y`; depth `0.064` preserves Y extent `-0.106..-0.170`. Keep
  The existing `cone()` helper's `0.008` bevel and smooth shading are retained
  as part of this complete primitive replacement and must be inspected at the
  `0.010` tip. The edit also reduces vertical nose height from `0.110` to
  `0.052`; it is not evidence about taper alone. Keep the helper, name and
  `head_hair` semantic classification, head, eyes, beard,
  hair, skin material, all other geometry/materials, landmarks, cameras,
  lights, references, annotations, renderer, and metric fixed.
- Expected movement: DreamSim, LPIPS, head-part edge, and local silhouette
  should improve in front, front-left, front-right, and profiles; rear views
  should remain flat. Palette/texture may move slightly through changed shading.
  Authored landmarks and canonical bounds must remain fixed.
- Reject if: aggregate improvement is less than `0.001`; front fails to improve;
  both neural means regress; the nose floats, leaves a face gap, intersects the
  beard or eyes, looks like a horn, beak, or obvious cone, loses a readable
  bridge, or develops a cap/shading artifact; rear views change materially;
  mean head parts or silhouette regresses by more than `0.003` without a larger
  coherent perceptual gain; any landmark moves materially; or movement cannot
  be attributed to nose form.

## Result

- Baseline distance: `0.674078384839113`
- Candidate distance: `0.6742827822130184`
- Absolute delta: `+0.00020439737390542945`
- Relative delta: `+0.03032249342251412%`
- Baseline report SHA-256: `d995b70ce339c695f8f8844a0e59c37ce0ef2f597bf48b637b8476a5af241f94`
- Candidate report SHA-256: `d307df76fa735c66a700c147efe0363e01473becadad4973c74edca52cf8406f`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Rejected. The complete compact replacement worsened aggregate and
  both neural means, with a clear right-profile visual failure.

## Diagnostics and visual review

All eight beauties and overlays were reviewed. The cone remained attached and
did not intersect the eyes or beard, and canonical landmarks stayed exactly
fixed. Its large inherited bevel collapsed the narrow end into a round button;
the 53% height reduction also left an implausibly large eye-to-nose gap. In
front it read as a tiny button, while profiles showed a short peg rather than a
bridge or tapered human nose.

Front improved `-0.0010374825`, as did left slightly, and palette/texture,
parts, and silhouette improved by `-0.0002101578`, `-0.0002748142`, and
`-0.0002122660`. DreamSim regressed `+0.0019402057`, LPIPS regressed
`+0.0002868548`, right regressed `+0.0032900716`, and front-right regressed
`+0.0003573170`. Rear views stayed within tiny noise, confirming isolation.

## Protocol reflection

The constructor audit correctly predicted the failure: a circular cone that
preserves depth does not preserve the old vertical bridge, and the shared bevel
is too large for its tip. This experiment supports only rejection of the
complete compact-cone replacement; it does not prove that a carefully authored
elliptical tapered nose would fail. Do not tune cone radii or bevel nearby.
Future face work should change a genuinely separate feature rather than repair
this candidate post hoc.

## Next question

Can reducing only the two oversized black eye-socket footprints make the face
less toy-like while preserving their centers, depth, head, nose, beard, and all
semantic anchors?

---

# 0045: Compact the eye sockets

Status: rejected
## Pre-registration

- Observation: each accepted eye socket is a smooth black ellipsoid with scale
  `(0.027, 0.010, 0.018)`, creating two large horizontal black beads. The
  references show smaller shadowed eyes beneath hair and brow structure. This
  paired scale-only edit is independent of rejected skin, head-compression, and
  nose-primitive work.
- Hypothesis: reducing only the eye sockets' X/Z footprint while preserving
  centers and depth will make the face less toy-like and improve face-exposed
  neural similarity without changing expression symmetry or other features.
- Change boundary: in the existing two-eye loop, change only eye-socket scale
  from `(0.027, 0.010, 0.018)` to `(0.020, 0.010, 0.010)`. Keep centers
  `(+/-0.045, -0.132, 1.68)`, black material, name/publication, head, accepted
  spherical nose, beard, hair, all other geometry/materials, landmarks,
  cameras, lights, references, annotations, renderer, and metric fixed.
- Expected movement: DreamSim and LPIPS should improve in front, front-left,
  front-right, and profiles; palette/texture may move slightly. Parts and local
  silhouette may move only at tiny face pixels, while rear views, landmarks,
  and canonical bounds remain fixed.
- Reject if: aggregate improvement is less than `0.001`; front and neither front
  diagonal improve; neither DreamSim nor LPIPS improves; either eye disappears,
  looks punched through or detached, becomes asymmetric, or makes the expression
  less coherent; rear views change materially; mean head-part or silhouette
  regresses by more than `0.003`; any landmark moves materially; or movement
  cannot be attributed to the paired socket footprint.

## Result

- Baseline distance: `0.6740783925575773`
- Candidate distance: `0.674982441649487`
- Absolute delta: `+0.0009040490919096644`
- Relative delta: `+0.13411631375388493%`
- Baseline report SHA-256: `4916604ed97758e9a19940b7742e97f459d23cfccf120818176287a6032f4709`
- Candidate report SHA-256: `a73d0f6ebf8011a43f3f3a5c902978f5fc9ee060a73b006c8d26b57b84b6db2a`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Rejected. The smaller sockets worsened aggregate, DreamSim, and the
  primary front/front-left views, and failed visual expression coherence.

## Diagnostics and visual review

All eight beauties and overlays were reviewed. The paired edit remained
symmetric and attached, with fixed landmarks and bounds. The reduced Z scale
turned each eye into a very thin horizontal slit or punched black mark. They did
not disappear entirely, but the face lost the stronger readable gaze supplied
by the accepted sockets and looked more mask-like, especially in front and
front-left.

DreamSim regressed `+0.0054316819`; LPIPS improved only `-0.0000458881`;
palette/texture, parts, and silhouette all regressed slightly. Front worsened
`+0.0040472492`, front-left `+0.0051406951`, and right `+0.0013059576`.
Front-right and left improved modestly, but the registered primary views and
aggregate failed. Rear movement was small, consistent with limited visibility.

## Protocol reflection

The accepted large sockets are stylized, but they preserve expression and
neural face cues better than thin compact marks. This result closes simple
eye-footprint shrinking; do not search nearby scales or offsets. Together with
0044, it indicates that small primitive-level facial simplification is not the
current high-leverage path. Return attention to larger coherent armour surfaces
where the rear residual remains dominant.

## Next question

Can changing only the huge smooth cuirass-mass material from worn dark steel to
accepted blackened iron reduce the warm glossy blank rear-shell error across all
three worst rear views without losing torso volume or changing any geometry?

---

# 0046: Blacken the cuirass mass

Status: rejected
## Pre-registration

- Observation: the accepted `cuirass_mass` is a huge smooth ellipsoid using
  worn dark steel. Across back, back-left, and back-right—the three worst
  accepted views—it reads as a warm glossy blank shell, while the references
  show much darker blackened plate with restrained highlights. The front
  breastplate largely occludes this mass, making its material independently
  testable without repeating rejected torso-depth or rear-plate geometry.
- Hypothesis: assigning only the cuirass mass to accepted blackened iron will
  suppress the broad warm glossy rear shell and reduce rear DreamSim and
  palette/texture error while retaining readable torso volume.
- Change boundary: in only
  `sphere("cuirass_mass", (0,-0.015,1.20), (0.36,0.205,0.39), steel, root)`,
  change the material argument from `steel` to `black`. Keep its location,
  scale, segments, bevel and shading, both material definitions, breastplate,
  ridges, arms, belt, all other body/equipment geometry and materials,
  landmarks, cameras, lights, references, annotations, renderer, and metric
  fixed.
- Expected movement: back, back-left, and back-right should lead through
  DreamSim and palette/texture; LPIPS should be flat to improved. Front should
  move little because the breastplate occludes most mass pixels; diagonals and
  sides may improve with visible curved shell area. Parts, silhouette,
  landmarks, and canonical bounds must remain exactly fixed.
- Reject if: aggregate improvement is less than `0.001`; all three rear views
  do not improve; neither DreamSim nor palette/texture improves; front regresses
  by more than `0.001`; any classical component or landmark moves; the torso
  merges into arms, head, or background, loses readable volume, looks like
  cloth rather than plate, or develops a black specular artifact; or movement
  cannot be attributed to the one material assignment.

## Result

- Baseline distance: `0.6740783727964181`
- Candidate distance: `0.6750510072183362`
- Absolute delta: `+0.0009726344219180838`
- Relative delta: `+0.14429099955886495%`
- Baseline report SHA-256: `2feb8acce185f7a3c0a16d50acdb62b21d1e572e40d0b8f5418af96b1e77c831`
- Candidate report SHA-256: `98c50c0889a547ca366ea4bc0201109bdb6328b26117b9bd192c270ca333f311`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Rejected. The black material worsened all registered rear views,
  every appearance component, and aggregate distance.

## Diagnostics and visual review

All eight beauties and overlays were reviewed. Geometry, masks, silhouette,
landmarks, and bounds remained exactly invariant. The blackened shell retained
some highlight and volume, but became an even larger uninterrupted dark void;
it merged more strongly with the upper arms and made the already blank rear
surface less legible rather than more reference-like.

DreamSim regressed `+0.0049419403`, LPIPS `+0.0005863458`, and palette/texture
`+0.0009735744`. Back, back-left, and back-right all regressed by
`+0.0004573974`, `+0.0014732272`, and `+0.0005169758`; front regressed
`+0.0025581963`. Front-right alone improved slightly. The one-argument edit is
cleanly disproved.

## Protocol reflection

The rear error is not primarily excessive material brightness. The worn-steel
highlight supplies necessary curvature and separation on this primitive; making
the same smooth mass darker emphasizes its lack of plate structure. Close
cuirass palette tuning. A genuinely new surface-form experiment—faceting the
existing shell at invariant dimensions—is a more defensible next question than
another RGB or roughness search.

## Next question

Can reducing only the cuirass mass's smooth tessellation and disabling smooth
normals break the toy-like egg highlight into restrained plate facets while
preserving its accepted dimensions, material, semantic mask, and all anchors?

---

# 0047: Facet the cuirass shell

Status: rejected
## Pre-registration

- Observation: the accepted cuirass mass is a 32-by-16 smooth-shaded UV sphere
  scaled into a torso ellipsoid. In the rear views it reads as one blank toy-like
  egg with a single broad highlight. Experiment 0046 proved that darkening the
  same smooth shell makes this worse, so surface form—not palette—is the next
  isolated lever.
- Hypothesis: reducing only the cuirass mass tessellation and using hard face
  normals will break the broad toy highlight into restrained plate-like facets,
  improving rear perceptual similarity while preserving accepted dimensions,
  material, anchors, and overall volume.
- Change boundary: extend `sphere()` with default parameters `ring_count=16`
  and `smooth=True`, pass them to `primitive_uv_sphere_add` and `finish`, so
  every existing call remains behavior-identical by default. Change only the
  `cuirass_mass` call to use `segments=16`, `ring_count=12`, and `smooth=False`.
  Keep its center `(0,-0.015,1.20)`, scale `(0.36,0.205,0.39)`, accepted steel
  material, existing `0.006` bevel, name/publication, and all other geometry,
  materials, landmarks, cameras, lights, references, annotations, renderer, and
  metric fixed. The retained bevel now chamfers the lower-poly edge network, so
  this tests one complete faceted-and-chamfered shell construction rather than
  attributing any result to tessellation or normals separately.
- Expected movement: back, back-left, and back-right should lead through
  DreamSim, LPIPS, and texture response; side/diagonal views may also improve.
  Front should move less because the breastplate occludes most of the mass.
  Landmarks and bounds must remain fixed; parts and silhouette should remain
  nearly flat apart from subpixel changes caused by lower tessellation.
- Reject if: aggregate improvement is less than `0.001`; back and back-left do
  not both improve; neither DreamSim nor LPIPS improves; mean parts or
  silhouette regresses by more than `0.003`; the shell reads as a gemstone,
  disco ball, low-poly placeholder, or faceted balloon; highlights become harsh
  or broken; UV poles, holes, or shading seams appear; any landmark or bound
  moves materially; or movement cannot be attributed to shell faceting.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6726456545791717`
- Absolute delta: `-0.0014327315404046`
- Relative delta: `-0.0021254672600501` (`-0.2125%`)
- Baseline report SHA-256: `66c5321bec2b73effecab262e63c3908e6e943719cdfcab38490a646d49dec24`
- Candidate report SHA-256: `6f477228ae20d6796ddd4a19c0ef68111412e17010a2c7d94702cefb8536131b`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Rejected. The candidate cleared the numeric margin, but failed the
  registered production-coherence gate: regular horizontal polygon bands are
  plainly visible on the exposed front-right torso and read as a low-poly
  placeholder rather than forged plate.

## Diagnostics and visual review

All eight beauty renders and all eight mask overlays were reviewed. DreamSim
improved by `-0.004126`, LPIPS by `-0.002912`, palette/texture by `-0.000519`,
and silhouette by `-0.000085`; landmarks were exactly unchanged. Parts moved
only `+0.000140`, so the measured gain was predominantly perceptual as expected.

Back (`-0.002280`) and back-left (`-0.001977`) both improved, while back-right
regressed slightly (`+0.000536`). Front (`-0.001719`), front-right
(`-0.004886`), and right (`-0.000780`) improved; front-left (`+0.000519`) and
left (`+0.001385`) regressed. The overlays showed no new hole, gross bound
movement, or landmark displacement.

The rear shell did acquire a subtler broken highlight, but the strongest
front-right gain coincided with clearly exposed latitude-like facets beside the
breastplate. Those repeated horizontal planes are visually mechanical and make
the torso read as a deliberately low-polygon mesh. That is the exact
low-poly/faceted-balloon failure named before measurement, so the numeric win
cannot be accepted.

## Protocol reflection

This experiment establishes a useful distinction: breaking the single smooth
cuirass highlight is directionally valuable to both neural metrics, but coarse
UV topology plus hard normals and the retained all-edge bevel is not a viable
surface treatment. The metric rewarded the regular bands most strongly in
front-right, demonstrating why the all-angle human gate is necessary even when
the aggregate, both worst rear views, and both neural components pass.

Future cuirass work should preserve the accepted smooth outer volume and add
irregular, explicitly authored plate boundaries or surface detail. It should
not tune nearby UV segment/ring counts, remove the bevel opportunistically, or
infer that flat normals alone were beneficial; this experiment measured the
complete faceted-and-chamfered construction.

## Next question

Can an appearance-only change on the large shield field improve weathered-metal
response without introducing new geometry, bounds movement, or decorative toy
motifs?

---

# 0048: Weather the shield field

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: the accepted shield outline, slab depths, pose, and compact boss
  are settled, but its large inset field shares `worn_dark_steel` roughness
  `0.37` with the body armour. Under the fixed lights this produces a clean,
  coherent specular face unlike the dull, battered, blackened shield surface in
  both rigid references. Experiment 0040 showed that adding a clean bright
  heraldic relief worsens the field; surface response is the remaining isolated
  appearance lever that does not reopen shield geometry or decoration.
- Hypothesis: broadening only the inset field's highlight with roughness `0.58`,
  while preserving its accepted RGB and metallic response, will make the shield
  read as more matte plate and reduce exposed-view perceptual distance without
  changing masks, bounds, pose, or landmarks. This tests a uniform response,
  not spatial scratches, mottling, or literal weathering texture.
- Change boundary: add one material immediately after `worn_dark_steel` named
  `weathered_shield_steel`, with the same base colour `(0.075,0.080,0.080)` and
  metallic value `0.76`, changing only roughness from `0.37` to `0.58`. Change
  only the `shield_field` prism's material argument from `steel` to this new
  material. Keep the outer `kite_shield`, inner polygon, both slab depths,
  locations, bevels, boss, rivets, shield landmarks, every other `steel`
  assignment, all geometry, other materials, lights, cameras, references,
  annotations, renderer, and metric fixed. Do not add noise, bump, wear marks,
  or decoration in this experiment. The assignment covers the prism's front,
  reverse, sidewall, and generated bevel faces as one indivisible object.
- Expected movement: DreamSim, LPIPS, and palette/texture should improve most in
  front and front-left, then front-right and left where the inset face is
  exposed. Direct back should be effectively flat because the outer slab
  occludes the field; rear diagonals and edge views may move only where the
  forward-offset prism's sidewall or bevel is actually exposed. Parts, silhouette,
  landmarks, and canonical bounds must remain exactly fixed because this is an
  interior material-only assignment.
- Reject if: aggregate improvement is less than `0.001`; front and front-left do
  not both improve; their mean with front-right does not improve, or front-right
  regresses by more than `0.001`; neither DreamSim nor LPIPS improves, or the
  other neural component regresses by more than `0.002`; palette/texture
  regresses by more than `0.002` without a larger coherent neural gain; any
  parts, silhouette, landmark, or bound value moves; direct back changes by more
  than `0.0002`, or side/rear movement cannot be localized to an exposed field
  sidewall or bevel; the field becomes a
  featureless black patch, chalky, plastic, or indistinguishable from the outer
  slab; boss seating or shield depth becomes unreadable; a rear or edge-on view
  changes without a visibility explanation; the exported material fails GLB
  validation if accepted; or movement cannot be attributed to the field
  roughness assignment.

## Result

- Baseline distance: `0.6740783925575773`
- Candidate distance: `0.6746937353181104`
- Absolute delta: `+0.0006153427605331`
- Relative delta: `+0.0009128652799541` (`+0.0913%`)
- Baseline report SHA-256: `cddd6241ea770864d503eed9f13004ee09333c86eba82c41a51edf895ffa28f3`
- Candidate report SHA-256: `e1a52c33afa1dfa065b3464538010129d0e342797db79320f2db1c724f4f40f3`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Rejected. The candidate worsened the aggregate and failed every
  registered exposed-view and appearance-component gate.

## Diagnostics and visual review

All eight candidate beauty renders and all eight mask overlays were reviewed
against the baseline. DreamSim regressed by `+0.002176`, LPIPS by `+0.001055`,
and palette/texture by `+0.002798`. Parts, silhouette, and landmarks were exactly
unchanged, which confirms that the experiment cleanly isolated rendered surface
response.

Movement followed shield-field visibility exactly, but in the wrong direction:
front regressed `+0.003031`, front-left `+0.000930`, front-right `+0.001662`,
left `+0.000399`, and right `+0.000542`. Back, back-left, and back-right were
exactly unchanged, confirming that the outer slab occludes the field there and
that no unregistered object changed.

The rougher field retained its attachment, boss seating, bevel continuity, and
metallic material classification, but its already-subdued face became still more
uniform. It reads as a blank dark insert rather than acquiring any of the
reference's battered variation. The unchanged overlays and classical components
also confirm there was no framing or semantic confound to rescue the hypothesis.

## Protocol reflection

This is unusually clean negative evidence. A scalar roughness increase cannot
stand in for weathering on this field: every appearance signal and every exposed
view agreed that the accepted `0.37` response is closer. The protocol's direct
back invariance prediction was exact, and the small left/right changes localize
to the forward field sidewall as expected.

Close nearby uniform shield roughness tuning rather than trying intermediate
values. Future shield work would need spatially irregular wear or a different
surface construction, but experiments 0040 and 0048 together warn that clean
added motifs and uniform BRDF changes both make this large plane less reference-
like. Those higher-complexity directions should wait behind broader body-form
tests.

## Next question

Can a small set of seated rear cuirass rivets add reference-like armour breakup
inside the accepted silhouette without repeating the failed plate, harness, or
faceted-shell constructions?

---

# 0049: Add seated rear cuirass rivets

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: back, back-left, and back-right remain the three worst accepted
  views. Their cuirass is a broad, uninterrupted ellipsoid, while both rigid
  references contain many small fasteners and segmented armour details.
  Attempts to add a planar rear plate, straight harness, spherical hair breakup,
  or coarse shell faceting either floated, tunneled, became bead-like, or failed
  the production-coherence gate. Small fasteners seated directly on the accepted
  surface provide a distinct interior-detail test without changing the shell.
- Hypothesis: nine restrained, symmetric dark-steel rivets half-seated in a
  dotted X on the rear cuirass will echo the reference's crossed construction,
  break up its blank toy-like surface, and reduce rear DreamSim and LPIPS
  distance while preserving the accepted torso outline, volume, anchors, and
  front appearance.
- Change boundary: add a helper that returns the positive-Y surface of the
  accepted cuirass ellipsoid. It computes
  `radial = 1-(x/0.36)^2-((z-1.20)/0.39)^2`, rejects a negative radial term,
  then returns `-0.015 + 0.205 * sqrt(radial)` so later invalid points fail
  rather than silently clamping to the equator.
  Immediately after `cuirass_mass`, add exactly nine `steel` spheres named
  `rear_cuirass_rivet_0..8` at X/Z pairs `(-0.20,1.36)`, `(0.20,1.36)`,
  `(-0.10,1.28)`, `(0.10,1.28)`, `(0,1.20)`, `(-0.10,1.12)`,
  `(0.10,1.12)`, `(-0.20,1.04)`, and `(0.20,1.04)`. Set each center Y to that
  surface, scale `(0.010,0.006,0.010)`, and segments `12`, so approximately half of each
  fastener is embedded along world Y. The small spheres retain the shared
  `0.006` bevel and are not aligned to the local ellipsoid normal; that complete
  stud construction and the indivisible dotted-X pattern are what this experiment
  tests. Keep the cuirass, breastplate, materials, all other
  rivets, body/equipment, landmarks, cameras, lights, references, annotations,
  renderer, and metric fixed. The names publish as `body_armour`; do not add a
  plate, seams, straps, or buckle in this experiment. The studs must not be
  individually countable as bright beads at normal gallery size.
- Expected movement: back should lead, with back-left and back-right also
  improving through DreamSim, LPIPS, and possibly palette/texture. Side views
  may move slightly where outer rivets are visible; front and its diagonals
  should remain effectively flat because the torso occludes the rear fasteners.
  Parts should remain nearly invariant because the rivets share body-armour
  publication and lie inside the torso projection. Silhouette, landmarks, and
  canonical bounds must remain exactly fixed.
- Reject if: aggregate improvement is less than `0.001`; any rear view regresses
  by more than `0.001`; neither DreamSim nor LPIPS improves; the mean parts or
  silhouette term moves by more than `0.001`; any landmark or canonical bound
  moves; front changes materially; any rivet floats, sinks, disappears,
  intersects the collar/arms/belt, breaks the registered symmetry, reads as a
  jewel, button grid, dotted emblem, or polka-dot pattern, or becomes
  individually bead-like rather than seated hardware; or movement cannot be
  attributed to the nine fasteners.

## Result

- Baseline distance: `0.6740783848391130`
- Candidate distance: `0.6740783861195763`
- Absolute delta: `+0.0000000012804633`
- Relative delta: `+0.0000000018995763`
- Baseline report SHA-256: `ecba16c2878368278bddb3ab0b2f2cd32227ad34728ac9c047584dec678f3291`
- Candidate report SHA-256: `87b407a996224febd111976f6e49a2baf094b80f4391c104c69c96669f924066`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Rejected. The candidate was visually and numerically indistinguishable
  from baseline and missed the required margin by effectively the full `0.001`.

## Diagnostics and visual review

All eight full-resolution beauty renders and all eight mask overlays were
reviewed. DreamSim, LPIPS, landmarks, parts, and silhouette were exactly
unchanged. Palette/texture moved only `+0.000000017`, producing an aggregate
delta of `+0.0000000013`. Back, back-left, back-right, front, both front
diagonals, and right were bit-for-metric identical; left changed only
`+0.000000014` through negligible rendered palette noise.

No stud is visibly countable at normal or full-resolution review. The accepted
steel material, small scale, half-surface seating, and smooth dark shell combine
to hide the complete dotted X. This avoids floating, side leakage, polka dots,
and bright jewelry, but it also fails to create the registered armour breakup.
The unchanged overlays confirm that no stud reached a silhouette or semantic
edge and no canonical bound moved.

## Protocol reflection

The analytic seating protocol worked mechanically: it introduced no leakage,
intersection, framing movement, or front contamination. However, surface center
placement is not sufficient to ensure visible relief when the stud shares the
shell material and is only `0.006` deep. The experiment therefore measures a
null visibility threshold rather than supporting or refuting rear fasteners as
a semantic feature.

Do not tune nearby stud sizes, clearance, or brass colour immediately: the next
more visible setting would re-enter the bead/button failure identified before
the run. Close sparse rear studs for now. A future rear treatment should use a
continuous, seated plate-boundary construction whose visibility comes from form
rather than isolated dots.

## Next question

Can replacing only the bulbous beard sphere with one attached angular wedge
improve the face silhouette and perceived age without changing the accepted
head, nose, hair, skin, or landmarks?

---

# 0050: Taper the lower beard

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: the accepted beard is a smooth UV ellipsoid centered under the
  nose, so its lower half remains as wide and round as its moustache attachment
  and reads as a brown muzzle or ball. The rigid references show a beard that
  remains broad at the cheeks but narrows toward an irregular lower point.
  Earlier head-width, skin, nose, and eye experiments close global face
  compression and small-feature palette/primitive tuning; lower beard outline is
  a separate unmeasured facial-form lever.
- Hypothesis: tapering only the X width of the accepted beard's lower mesh rings,
  while preserving its complete Y/Z envelope, upper attachment, material,
  smoothing, bevel, semantic name, and anchors, will produce a more mature jaw
  silhouette and reduce front and profile perceptual distance without creating
  a flat facial plate.
- Change boundary: retain the exact accepted beard sphere call, but capture its
  return as `beard`. For each baked local mesh vertex with `vertex.co.z < 0.018`,
  compute `t = max(0.0, min(1.0, (vertex.co.z + 0.090) / 0.108))` and multiply
  only `vertex.co.x` by `0.45 + 0.55 * t`. Leave every vertex Y and Z unchanged.
  This preserves the accepted location `(0,-0.123,1.555)`, scale envelope before
  deformation `(0.088,0.038,0.09)`, `hair` material, 28 segments, smooth
  shading, shared `0.006` bevel, upper rings at and above local Z `0.018`, name
  `beard`, and `head_hair` publication. Keep the sphere helper, head, nose,
  eyes, hair back, hair tufts, gorget, all other geometry and materials,
  body/equipment, landmarks, cameras, lights, references, annotations, renderer,
  and metric fixed. The fixed `0.45` bottom-width factor and linear transition
  are one indivisible deformation; do not tune them after evidence.
- Expected movement: front should lead, with front-left, front-right, left, and
  right also improving through DreamSim, LPIPS, local silhouette, and head/hair
  overlap. The upper beard and full Y/Z envelope should remain visually fixed.
  Back and the two rear diagonals should be effectively flat because the head
  occludes the lower beard. Palette/texture should remain nearly fixed because
  material and surface response are unchanged. Authored landmarks and canonical
  bounds must remain exactly fixed.
- Reject if: aggregate improvement is less than `0.001`; front and at least two
  of `{front_left,front_right,left,right}` do not improve; either DreamSim or
  LPIPS regresses; rear-three mean movement exceeds `0.0002`; mean head/hair
  parts or silhouette regresses by more than `0.003` without a larger coherent
  neural gain; any landmark or canonical bound moves; the upper beard or Y
  envelope visibly changes; the lower beard becomes imperceptible, pinched,
  spike-like, goatee-like, asymmetric, detached at the cheeks, intersects the
  nose/gorget, develops a cap or shading seam, or movement cannot be attributed
  to the registered lower-ring X deformation.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6734418814421627`
- Absolute delta: `-0.0006365046774136`
- Relative delta: `-0.0009442591403616` (`-0.0944%`)
- Baseline report SHA-256: `528370ef8cba095b539fe71fb10787efaad75bcfb6a41e4116e1c62bdc8b4a48`
- Candidate report SHA-256: `02b28057b9936900b9200476bc20f0712194df46696e51198778ab3e3530e4c3`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Rejected. The deformation remained visually coherent and improved
  several face-exposed views, but missed the `0.001` aggregate margin, slightly
  regressed LPIPS, and failed the registered left/right profile requirement.

## Diagnostics and visual review

All eight full-resolution beauty renders and all eight mask overlays were
reviewed. DreamSim improved `-0.003832`, palette/texture `-0.000196`, and parts
`-0.000287`; LPIPS regressed `+0.000056`, silhouette regressed only
`+0.000029`, and landmarks were exactly unchanged.

Front improved `-0.000584`, front-left `-0.002608`, front-right `-0.003014`, and
right `-0.000474`. Left regressed `+0.000057`. Rear movement stayed very small:
back `-0.000008`, back-left `+0.000093`, and back-right `-0.000232`; the latter
makes the rear-three mean magnitude slightly exceed the strict registered
`0.0002` expectation only at one view, without any visible rear artifact.

Visually, the taper is continuous, symmetric, seated at the cheeks, and free of
caps, shading seams, nose/gorget intersections, or a flat-bib read. It remains
subtle enough that the face still reads as a round procedural head rather than a
materially more adult reference face. The overlays show the intended local
head/hair contraction and no bound or landmark movement.

## Protocol reflection

Deforming the accepted mesh was materially safer than substituting a prism: it
preserved attachment and avoided every predicted wedge-construction failure.
The clear front-diagonal DreamSim response supports lower-beard taper as a valid
direction, but the disagreement with LPIPS and sub-threshold aggregate show that
this local feature cannot carry the larger facial mismatch by itself.

Do not tune the `0.45` factor or transition height nearby. The fixed margin is
doing useful work here: retaining many visually plausible sub-threshold changes
would blur causal continuity and gradually overfit one neural component. Close
beard-width taper for now; a future authored head/face assembly may incorporate
the lesson as part of a broader coherent rebuild rather than another scalar
sweep.

## Next question

Does changing only both thigh armour segments from blackened iron to the already
accepted worn dark steel improve the broad lower-body material read, especially
in the three worst rear views, without changing any geometry or masks?

---

# 0051: Change the thigh armour to dark steel

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: both accepted thigh segments use `blackened_iron` while the
  adjacent knees, greaves, and boots use `worn_dark_steel`. In rear and oblique
  views the thighs therefore read as nearly featureless black columns rather
  than articulated dark plate. Accepted experiment 0018 established that worn
  steel is a useful lower-limb material, while rejected 0046 showed that further
  blackening a broad armour surface moves the rear appearance in the wrong
  direction. The two thighs are the remaining symmetric material discontinuity
  in that accepted leg assembly.
- Hypothesis: assigning only the left and right thigh segments to accepted worn
  dark steel will recover restrained metallic volume and continuity with the
  knees/greaves, reducing rear and side appearance distance without changing
  geometry, semantic publication, silhouette, or landmarks.
- Change boundary: in the single leg-loop call
  `segment(side + "_thigh", (x,0.01,0.83), (x+lean,0.015,0.51), 0.13, black, root)`,
  change only the material argument from `black` to `steel`. This changes exactly
  `left_thigh` and `right_thigh`. Keep endpoints, radius, segment helper, stance,
  knees, shins, greaves, boots, faulds, front and rear tabards, both shared
  material definitions, every other assignment, body/equipment, landmarks,
  cameras, lights, references, annotations, renderer, and metric fixed. Treat
  the symmetric pair as one indivisible thigh-armour family. This tests the
  complete accepted-material reassignment--slightly lighter/cooler RGB, higher
  metallic value, lower roughness, and resulting highlights--not colour alone.
- Expected movement: back, back-left, back-right, left, and right should lead
  through DreamSim, LPIPS, and palette/texture as the thigh volumes become
  readable. Front and its diagonals may move less because the ignored cloth
  tabard physically occludes the thighs before its pixels are cleared from the
  canonical mask, so hidden thigh pixels are not recovered. Any movement there
  must localize to exposed outer thigh pixels; this experiment does not test
  cloth removal or the hidden no-cloth construction. Parts, silhouette, landmarks, and
  canonical bounds must remain exactly fixed because only material assignment
  changes.
- Reject if: aggregate improvement is less than `0.001`; either DreamSim or
  LPIPS regresses; fewer than four views improve; the mean of back, back-left,
  and back-right regresses; any parts, silhouette, landmark, or canonical-bound
  value moves; the thighs become chrome-like, too bright, plastic, cloth-like,
  merge with the knees/faulds, lose separation from the rear tabard, create a
  conspicuous material seam, read as glossy trousers or metal sausages, or erase
  the reference's dark flexible-underlayer hierarchy; front movement cannot be explained by visible
  thigh exposure; or movement cannot be attributed to the two material
  assignments.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6736376488364122`
- Absolute delta: `-0.0004407372831641`
- Relative delta: `-0.0006538368418861` (`-0.0654%`)
- Baseline report SHA-256: `dca0940b74fd3398888ca55c69f10f3e1c2397cfcf772001497ed91a85a653a4`
- Candidate report SHA-256: `1223cac814ec989d8e99f322d8472562e3bb2d42ffaa5f1c40c22d5fe4abcda1`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Rejected. All appearance components and seven views improved, but
  the aggregate gain was below the fixed margin and the right profile regressed
  materially with a smooth metallic-cylinder read.

## Diagnostics and visual review

All eight full-resolution beauty renders and all eight mask overlays were
reviewed. DreamSim improved `-0.001146`, LPIPS `-0.000324`, and palette/texture
`-0.000281`. Parts, silhouette, and landmarks were exactly unchanged, confirming
a clean material-only experiment.

Front improved `-0.000879`, front-left `-0.001252`, front-right `-0.000117`,
back `-0.000894`, back-left `-0.000123`, back-right `-0.000254`, and left
`-0.000283`. Right alone regressed `+0.001484`. The three rear views therefore
improved coherently, and movement localized to exposed outer thigh regions as
predicted; ignored cloth remained a canonical hole and revealed no hidden
surface.

The worn-steel thighs retain their contacts and geometric seams, but broad
longitudinal highlights make the visible right-side thigh read as a smooth metal
tube. In back-left the same material begins to merge the thigh into the knee and
fauld assembly. This weakens the dark chainmail/under-armour hierarchy evident
in the reference even though most scalar metrics move in the desired direction.
No mask, bound, or landmark contamination occurred.

## Protocol reflection

The experiment cleanly distinguishes material direction from construction
quality. Slightly lifting the dark thigh response helps seven views, but the
accepted smooth cylinder cannot support the glossier steel BRDF without looking
like rigid trousers. The fixed margin correctly prevents retaining a weak global
gain that includes one clear profile failure.

Close shared-steel assignment for the thighs; do not tune nearby RGB or
roughness. The evidence instead supports a future dark chainmail/quilting
surface that preserves the underlayer hierarchy while adding local texture.
Because ignored cloth hides central pixels, any such test must still make claims
only about exposed thigh surfaces.

## Next question

Can a dedicated dark chainmail bump material on only the two upper-arm sleeves
improve the all-angle armour texture without changing their accepted geometry,
publication, or silhouettes?

---

# 0052: Compact and straighten both arm paths

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: the accepted elbow centers sit outside both fixed shoulder and
  hand anchors, making each arm bow laterally before returning toward its weapon
  hand. The rigid references use compact, mostly vertical arms held close to the
  cuirass. A procedural chainmail bump was considered but rejected before
  evidence because the current glTF export neither bakes Blender Noise/Bump
  nodes nor exports texture coordinates, so the scored Eevee appearance would
  not survive in the shipped GLB.
- Hypothesis: moving only the paired elbow control points inward and slightly
  forward will make the existing upper-arm/vambrace paths more compact and
  vertical, reducing arm/body silhouette and perceptual distance while
  preserving shoulder, hand, equipment, material, and endpoint attachment.
- Change boundary: in `arm_points`, change only the left elbow from
  `(-0.51,-0.02,1.10)` to `(-0.47,-0.045,1.10)` and the right elbow from
  `(0.51,-0.05,1.08)` to `(0.47,-0.085,1.08)`. Keep both shoulder and hand
  tuples, every Z value, upper-arm/vambrace radii, segment helper, bevel and
  smoothing, materials, pauldrons/rivets, gauntlets, sword/shield and contacts,
  all other geometry/materials, landmarks, cameras, lights, references,
  annotations, renderer, export settings, and metric fixed. The symmetric
  inward X change plus deliberately asymmetric forward Y seating is one
  indivisible paired arm-path hypothesis. It changes both upper-arm and
  vambrace length/orientation; it does not test chainmail, material, or an added
  elbow joint.
- Expected movement: elbow width narrows by `0.08` overall. The left/right
  arm-path turn angles decrease from about `31.90°/28.96°` to `14.10°/10.64°`,
  so this is straightening rather than increased articulation. Front, back, and
  diagonal body-armour parts, silhouette, DreamSim, and LPIPS should lead; side
  views should respond to the `0.025/0.035` forward Y shifts and asymmetric
  equipment occlusion. Palette should remain nearly invariant. Authored
  shoulder/hand landmarks and all other landmarks must remain exactly fixed;
  canonical bounds should remain fixed.
- Reject if: aggregate improvement is less than `0.001`; neither DreamSim nor
  LPIPS improves; front and back do not both improve; fewer than four views
  improve; mean parts or silhouette regresses by more than `0.003` without a
  larger coherent neural gain; any landmark or canonical bound moves; either
  upper arm/vambrace disconnects, shows a cap seam or hole, tunnels into or is
  swallowed by the cuirass/pauldron, clips shield/sword/torso, breaks gauntlet
  contact, loses readable elbow structure, becomes an unnaturally rigid straight
  pipe, makes the arms too narrow/short, creates visibly inconsistent left/right
  posture, or movement cannot be attributed to the two elbow coordinates.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6779389563009720`
- Absolute delta: `+0.0038605701813957`
- Relative delta: `+0.0057271828631380` (`+0.5727%`)
- Baseline report SHA-256: `e6ecff74cd4827039bcd5162de2003271495e446ddfe88d294aa1559f81f4ac2`
- Candidate report SHA-256: `42bf290b1e6a54e85793d6c9c9619cf60b2e5590ffe292017e3154720a250652`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Rejected. Every view and most components regressed, and full-view
  review showed that the compact paths erase elbow articulation and read as
  rigid straight pipes.

## Diagnostics and visual review

All eight full-resolution beauty renders and all eight mask overlays were
reviewed. DreamSim regressed `+0.014555`, parts `+0.001680`, silhouette
`+0.001010`, and canonical landmarks `+0.001843`. LPIPS improved `-0.002496`
and palette/texture `-0.000468`, but those isolated signals did not outweigh the
broad structural damage.

Every view worsened: front `+0.001823`, front-left `+0.005526`, front-right
`+0.006011`, left `+0.004042`, back-left `+0.003141`, back `+0.004903`,
back-right `+0.002504`, and right `+0.000155`. The rear-three mean therefore
moved strongly opposite the hypothesis.

The cylinders remain physically joined and equipment hand contacts stay fixed,
but the reduced turn angles remove the only readable elbow bend. Front and rear
now show near-vertical stacked tubes; in side views the upper arm and vambrace
form a long rigid column with a hard material seam. The inward surfaces also sit
too close to the cuirass, making parts of the arm appear swallowed. Overlay
movement is localized to the arms, but changed local crop geometry explains the
otherwise surprising canonical-landmark regression despite byte-identical
authored anchors.

## Protocol reflection

The pre-registration correction from “more articulation” to “straightening” was
essential: the result confirms that compactness alone is not desirable when the
primitive arm has no elbow cop or joint mesh. LPIPS preferred some local pixel
alignment, but DreamSim and every view correctly penalized the loss of human
pose structure.

Close elbow-center straightening and nearby coordinate tuning. Any future arm
rebuild should introduce an authored elbow/joint assembly and more anatomical
segment shapes as one coherent construction, rather than forcing two cylinders
onto a nearly straight path. The skipped procedural chainmail remains blocked
until the export pipeline has baked texture/UV parity; it must not be smuggled
back as a review-only improvement.

## Next question

Can replacing only the four accepted horizontal cuirass ridges with a restrained
dark diagonal seam lattice improve the target-like quilted breastplate read
without changing the torso outline, strap, or rear shell?

---

# 0053: Replace horizontal cuirass bars with diagonal seams

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: the accepted breastplate still carries four long horizontal
  black rounded bars. They read as modern grille slats across a flat plate,
  while both rigid references show diagonal quilting and segmented plate seams.
  Experiments 0023 and 0024 established that lowering the bars' contrast helps,
  but their false orientation and repetition remain visible. This experiment
  tests seam direction without changing the accepted low-contrast material,
  breastplate outline, or cross-body strap.
- Hypothesis: replacing only the four horizontal black bars with four thin black
  diagonal seams will create a restrained diamond/quilt construction and reduce
  front-facing perceptual distance while preserving the plate silhouette,
  material hierarchy, strap, and rear shell.
- Change boundary: extend `segment()` with an optional final `bevel=0.009`
  parameter passed unchanged to `finish`, preserving every existing caller.
  Remove only the `for row,z in enumerate((1.08,1.19,1.30,1.40))` block that
  creates `cuirass_ridge_0..3`. Add exactly four `black` segments named
  `cuirass_lattice_0..3`, all at Y `-0.246`, radius `0.008`, vertices `16`, and
  bevel `0.002`, using two endpoint pairs
  `(-0.25,1.12)->(0.17,1.46)` and
  `(-0.17,1.00)->(0.27,1.36)`, plus their exact X-mirrors with reversed slopes.
  Keep the accepted black material, breastplate/shadow, front strap and rivets,
  cuirass mass, all other geometry/materials, landmarks, cameras, lights,
  references, annotations, renderer, export settings, and metric fixed. The
  breastplate front plane is Y `-0.2525`, so the seam front sits only about
  `0.0015` proud while its body remains behind the separate shadow band and
  cross-body strap. Every endpoint remains inside the tapered plate. The
  complete four-seam lattice replaces the complete four-bar family as one
  indivisible construction; it does not separately test count or slope.
- Expected movement: front, front-left, and front-right should lead through
  DreamSim, LPIPS, and palette/texture; side views may move slightly where seam
  relief is exposed, while back and rear diagonals should remain effectively
  flat. Parts may move only within the already-opaque breastplate and silhouette
  should remain nearly invariant. Landmarks and canonical bounds must remain
  fixed. The unchanged diagonal leather strap will occlude portions of the
  lattice; that overlap is part of the accepted assembly rather than a new
  variable.
- Reject if: aggregate improvement is less than `0.001`; all three front-facing
  views do not improve; neither DreamSim nor LPIPS improves; rear views change
  materially; mean parts or silhouette regresses by more than `0.001`; any
  landmark or bound moves; a seam exits the breastplate, floats, sinks,
  z-fights, clips through the strap, forms a cage/net/modern diamond grille,
  becomes visually noisy or blank, shows bevel swelling or endpoint beads,
  changes another `segment()` caller, or movement cannot be attributed to the
  replacement lattice.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6740302480358294`
- Absolute delta: `-0.00004813808374681816`
- Relative delta: `-0.000071413183893837`
- Baseline report SHA-256: `58f168c8f395e80c4e2130903a4fc99376b530f0dee9a49bc6c8d67484c458ac`
- Candidate report SHA-256: `f1a6fa095fbcc406256f719da24ae669af163fe4cb567304f0edfaa76520d386`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Reject. The candidate improved by only `0.000048`, far below the
  registered `0.001` margin. Front-left regressed, so the required coherent
  improvement across all three front-facing views also failed. DreamSim and
  palette/texture regressed, and the beauty renders show the seams as a raised
  diamond cage rather than restrained plate construction.

## Diagnostics and visual review

All eight beauty renders and mask overlays were reviewed. Component deltas were
DreamSim `+0.000280`, LPIPS `-0.001750`, palette/texture `+0.000666`, parts
`-0.000066`, silhouette `+0.000015`, and landmarks exactly `0`. View deltas
were front `-0.000766`, front-left `+0.000483`, front-right `-0.003865`, left
`-0.000409`, back-left `+0.000026`, back `+0.000005`, back-right `+0.000165`,
and right `+0.003833`.

The seams remain inside the breastplate and behind the leather strap, with no
detached endpoints, clipping, or changed non-cuirass segment objects. In front,
however, the four raised lines form a conspicuous diamond grille. Front-left
shows the same decorative cage partly hidden by the shield. Front-right exposes
fewer lines and improves strongly, while the opposite right profile regresses by
almost the same amount as the front-right gain. Left changes modestly. The back
and both rear diagonals show no visible seam leakage, matching their nearly-zero
numeric movement. Every overlay retains the accepted large-scale mismatch and
shows no material bound or landmark change caused by this interior edit.

## Protocol reflection

The experiment cleanly isolated an interior motif: rear evidence stayed flat,
classical components barely moved, and the response concentrated where the
front plate was visible. That isolation makes the negative result useful. Thin
raised cylinders are still read as applied rods, and symmetric crossing lines
turn the simple cuirass into a modern grille even when their material and relief
are subdued. The opposing front-right/right movement also shows that a small
view-local neural gain is not evidence of a stable all-angle construction.
Further tuning of seam count, endpoints, or depth would be nearby parameter
search on a visually failed primitive, so cuirass line-detail work is closed.

## Next question

Test a different structural proportion or armour assembly with broad all-view
leverage; do not retune diagonal cuirass seams or restore bright horizontal
bars.

---

# 0054: Widen the complete leg stance

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: the accepted knees and boots sit close to the center line in
  front and back, while both rigid references use a broader planted stance. The
  current leg-loop bases are X `-0.17` and `0.17`; the resulting boot anchors
  are only `0.425` apart. Earlier lower-leg material, radius, and boot-shape
  experiments did not test placement of the complete connected leg assemblies.
- Hypothesis: translating both complete leg assemblies outward by exactly
  `0.04` will improve the adult planted stance and boot landmark, body-armour,
  silhouette, and neural agreement without changing any joint, segment length,
  ground height, material, or local leg construction.
- Change boundary: change only the leg-loop bases from
  `(("left",-0.17,-0.025),("right",0.17,0.035))` to
  `(("left",-0.21,-0.025),("right",0.21,0.035))`. This translates each
  thigh, knee, knee ridge, shin, greave, boot, and two greave bands outward by
  `0.04` while preserving their relative positions. Update only dependent raw
  anchors `left_boot` from `(-0.205,-0.055,0.03)` to
  `(-0.245,-0.055,0.03)` and `right_boot` from `(0.22,-0.055,0.03)` to
  `(0.260,-0.055,0.03)`; the latter retains the accepted one-millimetre
  rounding from generated center `0.259`. Keep lean, every X offset derived
  from lean, all Y/Z values, scales, radii, materials, names and publication,
  faulds, belt, tabards, torso, arms, equipment, every other landmark, cameras,
  lights, references, annotations, renderer, exporter, and metric fixed. The
  indivisible theme is symmetric complete-leg translation, not limb reshaping.
- Expected movement: front and back plus all four diagonals should improve
  through a wider stance; profiles should move less because authored X becomes
  view depth. DreamSim and LPIPS should improve, and at least one of parts or
  silhouette should improve independently of the intentionally moved boot
  anchors. The boot landmark mean should improve, but acceptance must not be
  justified by landmark movement alone. Palette should remain nearly fixed.
  Equipment should continue to control the overall horizontal canonical bounds.
- Reject if: aggregate improvement is less than `0.001`; front and back do not
  both improve; fewer than five views improve; neither neural mean improves or
  the other regresses by more than `0.002`; neither parts nor silhouette
  improves; the gain is dominated by the moved boot anchors; any non-boot raw
  landmark changes; canonical bounds shift unexpectedly; either thigh loses
  fauld coverage; the crotch gap becomes conspicuous through the ignored
  tabards; the stance looks bow-legged, splayed, laterally slid, unbalanced, or
  no longer weight-bearing; knees cease to align over boots; a joint separates;
  the left leg creates an implausible sword tangency, the right crowds the
  shield, a side view develops a depth-order inversion, or movement cannot be
  attributed to the paired complete-leg translation.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6765896750778959`
- Absolute delta: `+0.0025112889583196463`
- Relative delta: `+0.003725514732457485`
- Baseline report SHA-256: `153e88070bb9566b936eacf253d77e3fae5fc5695965f0d3e429fbce5649e3a3`
- Candidate report SHA-256: `5d13d22dde29eb888ced5d5f87801aa883239d0c315945dc55ffb1b1a0b88456`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Reject. Distance increased by `0.002511`; both neural components,
  silhouette, landmarks, front, back, and all rear diagonals regressed. The
  candidate also fails the visual attachment gate because the translated legs
  read as laterally slid columns beneath an unchanged narrow hip assembly.

## Diagnostics and visual review

All eight beauty renders and mask overlays were reviewed. Component deltas were
DreamSim `+0.003792`, LPIPS `+0.004294`, landmarks `+0.001771`, silhouette
`+0.000519`, parts `-0.001856`, and palette/texture `-0.001671`. View deltas
were front `+0.000217`, front-left `+0.001335`, front-right `-0.003227`, left
`-0.000259`, back-left `+0.004978`, back `+0.007267`, back-right `+0.002653`,
and right `-0.005556`.

The front preserves knee-over-boot alignment and ground contact, but the thigh
tops move toward the outer fauld edges and expose a wider central void around
the ignored tabard. Front-left shows the shield-side leg detached from the hip
mass; front-right gains numerically from the sword-side projection but shows the
same laterally shifted construction. Left and right profiles retain physical
joint contact, though the changed depth ordering explains their opposing gains.
Back is the clearest failure: both legs sit outside the narrow belt/fauld stack,
the central gap grows, and the stance reads splayed rather than planted. Both
rear diagonals repeat that detachment. The overlays localize movement to the
legs and show no unexpected crop-bound shift or equipment movement.

## Protocol reflection

The one-literal translation was an excellent causal probe: local joints remained
closed, while the all-angle evidence showed that stance width cannot be changed
independently of the hip/skirt attachment. The parts gain confirms that broader
leg coverage can overlap the reference mask, but the neural, landmark, and
visual regressions reject that overlap as anatomically coherent. The moved boot
anchors did not game the result; their score worsened. Close isolated lateral
leg translation. A future lower-body rebuild would need to reshape the complete
pelvis-to-foot silhouette rather than slide intact cylinders sideways.

## Next question

Test the registered vertical hip-attachment transform, which changes internal
torso-to-leg proportion while preserving lateral leg seating; do not tune an
intermediate stance width.

---

# 0055: Raise the complete hip attachment rail

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: the accepted belt and fauld stack sits low relative to the
  breastplate waist and fixed cross-body strap endpoint, contributing to a long
  rounded torso and compressed upper legs. Experiment 0054 proved that sliding
  intact legs outward breaks their attachment to this narrow hip assembly.
  Earlier compact-belt work helped its scale, while rejected cloth removal and
  steel-thigh work show that exposed underlayers and cloth attachment must be
  reviewed with the complete waist assembly.
- Hypothesis: raising the rigid waist/hip attachment rail by exactly `0.07`,
  while preserving fixed knees and the complete cloth polygons, will shorten the toy-like lower
  torso, lengthen the upper-leg line, and improve the all-angle waist structure
  without opening gaps among belt, faulds, thighs, and tabards.
- Change boundary: move only both proximal thigh endpoints from Z `0.83` to
  `0.90`; belt center from Z `0.89` to `0.96`; buckle center from Z `0.90` to `0.97`; fauld row
  heights from `(0.84,0.77,0.70)` to `(0.91,0.84,0.77)`, allowing their existing
  `height-0.045` edge centers to follow. Keep every X/Y coordinate, width,
  radius, depth, material, both complete tabard polygons, badge and
  `tabard_bottom`, distal thigh endpoint,
  knee/shin/greave/boot chain, cuirass/breastplate/strap, helpers, names and
  publication, all landmarks, cameras, lights, references, annotations,
  renderer, exporter, and metric fixed. This is one indivisible proximal
  rigid attachment transform; it does not separately test any moved family.
- Expected movement: all eight views may improve through internal body
  proportion, with front, back, and diagonals leading in DreamSim, LPIPS,
  body-armour parts, and silhouette. Palette should remain nearly fixed. Raw
  landmarks remain fixed and equipment continues to control the subject bounds.
  Small canonical landmark movement is allowed only when explained by changed
  waist occlusion. Ignored-pixel masks should remain unchanged because both
  tabards stay fixed. The unchanged rear top at `0.94` remains inside the raised
  belt/top-fauld overlap, and the unchanged front top at `0.88` remains inside
  the raised top fauld, so cloth attachment remains continuous without becoming
  a causal variable.
- Reject if: aggregate improvement is less than `0.001`; either DreamSim or
  LPIPS regresses; fewer than five views improve; front or back regresses by
  more than `0.001`; mean parts or silhouette regresses by more than `0.003`
  without a larger coherent neural gain; canonical landmark mean moves by more
  than `0.002` or is unexplained; the belt separates from or swallows the
  breastplate/faulds; the buckle floats; fauld rows collapse or leave gaps;
  thigh caps detach, penetrate the belt, become overlong smooth columns, or make
  knees appear too low; either unchanged tabard detaches, clips, or becomes
  visibly incoherent against the raised rail; ignored masks change; the waist becomes
  too high or short-waisted; fixed hands/equipment appear anatomically low;
  strap termination becomes implausible; a numerical gain is dominated by
  ignored-cloth occlusion; or movement cannot be attributed to the complete
  hip-rail raise.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6752682044509128`
- Absolute delta: `+0.0011898183313365784`
- Relative delta: `+0.0017651038155754098`
- Baseline report SHA-256: `f9ac75575a1926d58b99389f9775b7cd66e18dcfc535384b80ccba69574e595f`
- Candidate report SHA-256: `421a574640a224bcc1595eeaabf110462c0dbf63ca88ea7bb9cc51f43d9e5cdc`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Reject. Distance increased by `0.001190`. DreamSim, silhouette,
  parts, landmarks, five views, and especially right regressed. The raised rail
  also becomes a broad chest-like hoop in profiles and leaves the unchanged
  front cloth visually suspended beneath the higher fauld assembly.

## Diagnostics and visual review

All eight beauty renders and mask overlays were reviewed. Component deltas were
DreamSim `+0.004724`, LPIPS `-0.000518`, palette/texture `-0.001571`, parts
`+0.000864`, silhouette `+0.004874`, and landmarks `+0.000349`. View deltas
were front `-0.002119`, front-left `+0.005917`, front-right `+0.002327`, left
`+0.001495`, back-left `-0.001244`, back `-0.001177`, back-right `+0.000450`,
and right `+0.010180`.

The front view gains a higher waist but exposes a dark horizontal gap and bright
fauld-edge ladder between the raised rail and the fixed tabard; the tabard reads
suspended rather than attached. Front-left and front-right show the belt cutting
across the lower breastplate at different apparent depths, explaining their
opposing response. The left profile turns the belt into a broad projecting ring;
the right profile is worse still because the fixed weapon arm and shield reveal
the raised hoop and extended smooth thigh as disconnected layers. Back and
back-left look marginally shorter-waisted and improve numerically, but the rear
tabard begins below the raised belt and the broad ring still dominates. Back-right
is mixed. No joint separates and the fixed cloth masks remain unchanged, but all
eight overlays show material internal silhouette/occlusion movement rather than
an overall reference-like proportion correction.

## Protocol reflection

Narrowing the candidate before scoring successfully removed ignored-cloth-hole
movement as a confound. That makes the rejection stronger: the rigid transform
itself worsened the perceptual and silhouette signals. The shared `+0.07` kept
numeric belt/fauld/thigh overlap but did not create a visually authored pelvis;
it merely moved primitive layers upward, producing a chest hoop, long tube-like
thighs, and inconsistent attachment to fixed cloth. Front and rear gains were
view-local and overwhelmed by diagonal/profile failures. Close simple vertical
hip-rail translation rather than searching a smaller offset.

## Next question

Return to a genuinely different assembly-level hypothesis; do not tune hip
height, stance width, cloth attachment, or exposed thigh material independently.

---

# 0056: Ablate the four greave hoops

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: each accepted lower greave carries two complete polished torus
  bands, producing four bright circular hoops around otherwise dark plate. The
  rigid references use articulated greaves with restrained plate boundaries,
  not complete luminous rings. Experiment 0038 darkened these bands together
  with both knee ridges and lost useful frontal articulation, leaving band-only
  ablation unresolved. Accepted 0032 showed that isolated removal of false
  circular pauldron hoops can produce a decisive neural gain while retaining
  the underlying armour volume.
- Hypothesis: removing only the four greave-band tori will suppress the false
  concentric lower-leg motif and improve all-view neural similarity, while the
  unchanged steel greave cones and bright knee ridges preserve coverage, joint
  separation, and readable lower-leg armour.
- Change boundary: delete only the `for band,height in
  enumerate((0.23,0.35))` torus-creation block inside the left/right leg loop,
  removing `left_greave_band_0/1` and `right_greave_band_0/1`. Keep both
  `*_knee_ridge` boxes, greaves, knees, shins, boots, leg points, the torus
  helper and gorget, every material definition and assignment, all other
  body/equipment geometry, names and publication, landmarks, cameras, lights,
  references, annotations, renderer, exporter, and metric fixed. The complete
  four-hoop ablation is indivisible; do not retain one height or side
  separately.
- Expected movement: DreamSim and LPIPS should improve across front, back,
  diagonals, and profiles; front should retain knee readability because the
  knee ridges stay bright. Back and profiles may show meaningful parts and
  silhouette movement because the Y-offset hoops protrude behind the greave
  cones; front silhouette should move less. Palette/texture may regress from
  removal of bright pixels and is not a necessary gate, following accepted
  0032. Raw landmarks and canonical bounds should remain fixed.
- Reject if: aggregate improvement is less than `0.001`; neither DreamSim nor
  LPIPS improves or either regresses by more than `0.002`; front regresses by
  more than `0.001`; fewer than five views improve; the rear-three mean
  regresses; parts/silhouette damage exceeds the coherent neural gain; any
  landmark or canonical bound moves unexpectedly; either greave becomes a
  featureless smooth cone, loses separation from knee, boot, or shin, exposes a
  gap or construction artifact, looks unarmoured or like a trouser tube; the
  retained knee ridges appear floating or overdominant; asymmetric equipment
  occlusion makes one leg inconsistent; or movement cannot be attributed to the
  four removed hoops.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6741816945305336`
- Absolute delta: `+0.00010330841095729237`
- Relative delta: `+0.00015325875014625713`
- Baseline report SHA-256: `10652efe7b9cd33e370f0bdc368a6702fa6aecbf3d39c4edd866fec93e331b3c`
- Candidate report SHA-256: `4a13ff78728c49932272d2069ec67861a88cb677b04411d995904227defd999c`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Reject. Distance increased by `0.000103`; DreamSim, palette,
  parts, silhouette, five views, and the rear-three mean regressed. The beauty
  renders also show that the remaining greave cones become featureless tapered
  tubes without the bands.

## Diagnostics and visual review

All eight beauty renders and mask overlays were reviewed. Component deltas were
DreamSim `+0.008807`, LPIPS `-0.010024`, palette/texture `+0.002491`, parts
`+0.000051`, silhouette `+0.000008`, and landmarks exactly `0`. View deltas
were front `-0.000041`, front-left `-0.001486`, front-right `-0.000405`, left
`+0.002288`, back-left `+0.002184`, back `-0.002654`, back-right `+0.006052`,
and right `+0.002242`.

The front retains bright knee ridges and physical knee/boot contact, but both
lower legs lose all intermediate scale cues and read as long smooth cones.
Front-left and front-right improve slightly where equipment and pose mask that
loss. Left and right profiles expose the featureless tubes most clearly and
both regress. Direct back improves from reduced bright clutter, but back-left
and especially back-right regress as the taper loses articulated armour
structure. No hole, asymmetry, unexpected bound shift, or landmark movement
appears; the overlays localize the tiny classical movement to the deleted hoop
silhouettes.

## Protocol reflection

The experiment successfully separated the circular bands from the useful front
knee ridges that 0038 had confounded. The result shows that lower-leg rings are
not analogous to the accepted pauldron-hoop deletion: here they provide needed
segmentation on an otherwise primitive cone. LPIPS prefers their removal, but
DreamSim and the all-angle visual review penalize the resulting tubes. Close
greave-band deletion and nearby trim material work. Future greave improvement
would require an authored layered plate replacement, not ablation or recolour.

## Next question

Replace the solid circular belt puck with a fitted elliptical leather band,
preserving its accepted front width and height while reducing profile depth.

---

# 0057: Replace the belt puck with a fitted elliptical band

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: the accepted belt is a solid circular cylinder of radius `0.300`
  and depth `0.072`. It preserves a useful narrow vertical waist after accepted
  experiment 0014, but its circular X/Y footprint projects far behind the torso
  in profiles and reads as a thick waist puck. Experiments 0054 and 0055 again
  exposed that hoop-like profile while ruling out simple stance and hip-height
  changes. The references instead use fitted layered leather belts following a
  much shallower human torso.
- Hypothesis: replacing only the solid belt puck with a fitted elliptical
  leather torus, while preserving the accepted front width and vertical
  envelope, will reduce profile and diagonal waist error and retain a readable
  attachment rail for the faulds and tabards.
- Change boundary: extend `torus()` with an optional final
  `scale=(1,1,1)` parameter; after primitive creation, assign that scale and
  apply it before the unchanged `finish()` call. Existing callers retain the
  identity default. Replace only
  `cylinder("belt",(0,0,0.89),0.300,0.072,leather,...)` with
  `torus("belt",(0,0,0.89),0.250,0.050,leather,root,
  scale=(1.0,0.84,0.72))`. This preserves outer X radius `0.300` and Z
  envelope `0.854..0.926`, contracts outer Y radius from `0.300` to `0.252`,
  and creates an inner ellipse of approximately X `0.200`, Y `0.168`. Keep the
  buckle fixed at `(0,-0.245,0.90)`, where its body remains seated across the
  contracted front surface. The `0.84` Y factor is the shallowest registered
  value that retains contact at the outer rear-tabard attachment corners. Keep
  all faulds, tabards, torso, breastplate,
  strap, legs, every other torus/cylinder and material, names and publication,
  landmarks, cameras, lights, references, annotations, renderer, exporter, and
  metric fixed. The belt-plus-buckle construction is one indivisible primitive
  replacement; it does not separately test depth or hollowing.
- Expected movement: left and right profiles and all four diagonals should lead
  through reduced waist projection; front and back should also improve from a
  more plate-like narrow band. DreamSim, LPIPS, silhouette, and body-armour
  parts should improve. Palette should be nearly fixed because material and
  approximate visible area remain similar. Raw landmarks and canonical bounds
  should remain fixed because the X/Z extremes are preserved and equipment owns
  the wider bounds.
- Reject if: aggregate improvement is less than `0.001`; either profile
  regresses by more than `0.001`; fewer than five views improve; neither neural
  mean improves or the other regresses by more than `0.002`; parts or silhouette
  regresses by more than `0.003` without a larger coherent neural gain; any
  landmark or canonical bound moves unexpectedly; an existing torus caller
  changes; the inner opening exposes a torso/fauld gap; the belt floats, sinks,
  clips the torso, or reads as an inner tube, gorget, hollow hoop, or disconnected
  ring; either tabard or the fauld stack loses attachment; the buckle floats,
  clips, disappears, or looks glued to the band; front X/Z silhouette changes
  unexpectedly; the strap relationship worsens; or movement cannot be
  attributed to the complete fitted belt construction.

## Result

- Baseline distance: `0.674078384839113`
- Candidate distance: `0.6688405548085028`
- Absolute delta: `-0.00523783003061018`
- Relative delta: `-0.007770357496124623`
- Baseline report SHA-256: `2d3fc9cc557ca5473852446b1c865cd9857a9df8de88739b9a3d6bf3f55df2ab`
- Candidate report SHA-256: `b15941d84cb0882de43b82fbadc9fea2f27ae5b756cc4fd13284bfa8123b3393`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Reject. The aggregate improved strongly by `0.005238`, every
  component mean improved, and the visual result was coherent. Nevertheless,
  only front, left, and right improved; the explicitly preregistered requirement
  for at least five improved views failed. The source is reverted to preserve
  the experiment's falsifiability rather than overriding a gate after evidence.

## Diagnostics and visual review

All eight beauty renders and mask overlays were reviewed. Component deltas were
DreamSim `-0.005595`, LPIPS `-0.014850`, palette/texture `-0.008229`, parts
`-0.003173`, silhouette `-0.008789`, and landmarks `-0.007119`. View deltas
were front `-0.003085`, front-left `+0.000679`, front-right `+0.001680`, left
`-0.013050`, back-left `+0.000571`, back `+0.000186`, back-right `+0.003056`,
and right `-0.046404`.

The front shows a narrower, more belt-like band with the buckle seated and both
front cloth and faulds attached. Front-left and front-right retain those
contacts, but each regresses slightly despite no visible failure. Left and right
profiles improve dramatically: the waist puck disappears and the torso no
longer sits on a broad circular shelf. Back preserves rear-tabard attachment and
does not expose a hollow waist; the three rear-facing numeric regressions are
small, with no obvious new defect. The torso fills the torus opening in every
view, so it never reads as an inner tube or gorget. Strap relation remains
unchanged. All gorget and greave tori are visually identical to baseline, and
the overlays localize silhouette movement to the belt projection.

## Protocol reflection

This is an important protocol false negative. The candidate changed exactly as
intended, passed every visual safety gate, and improved all six aggregate
components, but a raw count of per-view signs rejected a profile-focused edit
because five mostly occluded views moved by only `0.0002..0.0031`. Sign count
does not account for exposure or magnitude: the two profile gains outweighed
those regressions by an order of magnitude. The candidate is still rejected
because relaxing a stated gate after seeing evidence would invalidate the
preregistration. Future local or profile hypotheses should preregister an
exposed-view mean plus bounded non-exposed regressions, not an arbitrary number
of improved views. Do not tune the ellipse factors from this result; the
fitted-belt construction is closed despite its promising causal signal.

## Next question

Test deterministic irregular breakup of the existing smooth cuirass surface,
using rear-view neural improvement and bounded front/non-exposed regressions
rather than a raw improved-view count.

---

# 0058: Bake restrained irregularity into the smooth cuirass

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: the accepted cuirass mass remains a smooth 32x16 steel ellipsoid
  and dominates the three worst rear views with one broad toy-like highlight.
  Experiment 0047 improved aggregate, both rear leaders, and both neural terms
  by breaking that highlight, but its coarse UV facets failed the production
  gate as regular low-poly latitude bands. Material darkening, plates,
  harnesses, seams, and rivets are closed. A small deterministic deformation of
  the existing smooth topology is a distinct test of irregular surface breakup
  without changing tessellation, normals mode, material, or adding detail.
- Hypothesis: a bounded, smoothly shaded, deterministic front/rear-normal
  displacement on only the cuirass mass will break the broad rear highlight
  irregularly and improve rear neural distance while preserving the accepted
  authored bounds, shell attachment, and production coherence.
- Change boundary: capture only the accepted `cuirass_mass = sphere(...)`
  return. For each baked local mesh vertex compute `nx=x/0.36`, `ny=y/0.205`,
  `nz=z/0.39`, `r2=min(1,max(0,nx*nx+nz*nz))`,
  `weight=r2*(1-r2)`, and
  `phase=(sin(7*nx+5*nz)+0.5*sin(11*nx-9*nz))/1.5`; then add
  `(-1 if ny<0 else 1)*0.010*weight*phase` to local Y and call
  `cuirass_mass.data.update()`. Keep the sphere helper, 32x16 topology, center
  `(0,-0.015,1.20)`, accepted pre-deformation scale, steel material, `0.006`
  bevel and smooth shading, breastplate/shadow/ridges/strap/rivets, padded
  torso, all other geometry/materials, names and publication, landmarks,
  cameras, lights, references, annotations, renderer, exporter, and metric
  fixed. The weight is zero at both the Y-axis extrema and X/Z silhouette rim,
  caps displacement at `0.0025`, and uses frequencies below the mesh sampling
  limit. The amplitude, weight, frequencies, coefficients, and mirrored
  front/rear displacement form one indivisible baked construction.
- Expected movement: the mean of back, back-left, and back-right should improve,
  led by direct back through DreamSim and LPIPS. Profiles and diagonals may move
  through Y/Z outline and shading; direct front should remain bounded because
  the breastplate occludes most of the mass and X/Z coordinates are fixed.
  Authored XYZ bounds and front/back outer X/Z silhouette should remain
  invariant; side and diagonal interior shading may move modestly. Palette may move through
  highlight breakup. Raw landmarks and overall canonical bounds should remain
  fixed or move only slightly and explainably.
- Reject if: aggregate improvement is less than `0.001`; rear-three mean fails
  to improve or direct back regresses; either DreamSim or LPIPS regresses;
  direct front regresses by more than `0.001`; mean non-rear views regresses by
  more than `0.0015` or either profile by more than `0.003`; parts/silhouette
  regresses by more than `0.001`; any raw landmark or authored XYZ bound moves,
  or canonical movement is unexplained; the surface reads as
  low-poly, corrugated, regularly wavy, quilted, hammered orange peel,
  cellulite, dented, or inflated; UV poles, latitude bands, Moire, broken
  normals, or visibly mirrored procedural patterns appear; the shell opens a
  breastplate/arm/belt gap, clips breastplate/ridges/strap, crosses the torso
  outline implausibly, or self-intersects; or movement cannot be attributed to
  the registered deformation.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6741176008344839`
- Absolute delta: `+0.00003921471490764272`
- Relative delta: `+0.000058175303815017053`
- Baseline report SHA-256: `52f0dc9086e17fb9dc99e43acf1bccd768b41511f05f752a00fe66ff10684cec`
- Candidate report SHA-256: `7365072eae991cf12106e31677d081f9fe015af54d2d4ac4bba9348559f0679d`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Reject. The candidate worsened aggregate distance, regressed
  DreamSim and direct back, and failed the registered rear-three hypothesis.
  The accepted source was restored exactly before closing the experiment.

## Diagnostics and visual review

All eight candidate beauties and all eight mask overlays were reviewed at full
resolution. The restrained deformation is effectively imperceptible: it does
not introduce low-poly facets, regular bands, Moire, orange-peel texture,
broken normals, visible mirrored waves, contact gaps, or clipping. The torso
outline and contacts remain coherent in every view, and landmarks are unchanged.

The absence of artifacts did not produce the intended signal. Component deltas
were DreamSim `+0.0001175404`, LPIPS `-0.0000726804`, palette/texture
`+0.0000086972`, parts `-0.0000069777`, silhouette `-0.0000002089`, and
landmarks `0`. View deltas were front `+0.0000622336`, front-left
`+0.0001065973`, left `-0.0000201661`, back-left `-0.0000933379`, back
`+0.0001108882`, back-right `+0.0000104994`, right `-0.0000301623`, and
front-right `-0.0000239637`. The rear-three mean regressed, direct back
regressed, and DreamSim regressed. The tiny mixed changes are consistent with
render sensitivity to a visually negligible surface perturbation, not progress.

## Protocol reflection

Experiment 0047 showed that coarse regular faceting has enough leverage to
improve the neural measures, but it failed production coherence. This safer
2.5 mm, lower-frequency deformation avoided that failure by becoming too weak
to change the broad ellipsoid read. Together the two results close this surface
deformation family: increasing amplitude or frequency would knowingly move
back toward the visible corrugation/faceting failure, while nearby safe values
would be post-evidence parameter searching. Future torso work should change a
coherent authored assembly rather than perturbing the accepted sphere.

## Next question

Can a complete articulated arm construction -- tapered upper arm and vambrace
with a seated elbow cop at the unchanged anchors -- improve the broad all-view
body silhouette without repeating rejected uniform slimming or elbow-path
translation?

---

# 0059: Replace cylindrical arms with tapered articulated assemblies

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: both accepted arms are pairs of constant-radius cylinders meeting
  at bare angular cap seams. Experiment 0013 showed that uniformly slimming
  those cylinders loses useful bulk, while 0052 showed that straightening their
  anchor paths erases elbow articulation. The rigid references instead combine
  broad shoulder and forearm armour, narrowing segment profiles, and visible
  outer elbow plates. A complete anchor-preserving arm rebuild is untested.
- Hypothesis: replacing all four arm cylinders with tapered segments and adding
  one seated outer/front steel elbow cop per side will preserve accepted bulk
  and pose while creating readable anatomical segmentation, improving broad
  arm-exposed neural, body-part, and silhouette distance without moving any
  shoulder, elbow, hand, sword, or shield anchor.
- Change boundary: add one `tapered_segment` helper that creates a Blender cone,
  maps `radius1` to the start anchor and `radius2` to the end anchor, rotates
  local +Z onto `end-start`, and uses the accepted `0.009` bevel and smooth
  finish. At the unchanged `arm_points`, replace `left/right_upper_arm` with
  black tapered segments radius `0.125` at shoulder to `0.090` at elbow;
  replace `left/right_vambrace` with steel tapered segments `0.125` at elbow to
  `0.095` at hand. Add steel `left/right_elbow_cop` spheres, scale
  `(0.085,0.060,0.075)`, centered `0.035` farther outward in X and `0.040`
  toward the front in Y from each unchanged elbow, using 24 segments. Keep
  pauldrons/rivets, gauntlets, arm points, shoulder/hand landmarks, equipment
  and contacts, materials, every other geometry/helper/caller, cameras, lights,
  references, annotations, renderer, exporter, and metric fixed. The four
  tapers plus two cops form one indivisible construction; the result cannot
  validate any one radius or cop independently.
- Expected movement: the mean of arm-exposed `left`, `right`, `back_left`,
  `back`, and `back_right` should improve through DreamSim, LPIPS, body-armour
  parts, and silhouette. Front and the front diagonals may move asymmetrically
  through shield/sword occlusion but should remain bounded. Palette may move
  slightly because steel cops replace pixels formerly split between black and
  steel segments. Raw landmarks and equipment contacts remain fixed; canonical
  movement is allowed only when explained by the changed arm silhouette.
- Reject if: aggregate improvement is less than `0.001`; the exposed-arm
  five-view mean fails to improve by at least `0.001`; either DreamSim or LPIPS
  regresses; front/front-diagonal mean regresses by more than `0.0015`; mean
  parts or silhouette regresses by more than `0.003` without a larger coherent
  neural gain; any raw anchor moves or canonical movement is unexplained; taper
  direction is inverted; a shoulder or hand gap opens; either cop floats,
  sinks, becomes a ball, bead, or knee-on-arm, creates a crescent cap seam,
  clips torso/pauldron/vambrace/gauntlet, or widens the elbow beyond the accepted
  envelope; the arms become wasp-waisted, pipe-like, over-bulky, asymmetric, or
  visually shorter; black upper arms lose their underlayer hierarchy; equipment
  contact/order changes; bevel or cap normals break; or movement cannot be
  attributed to the complete articulated construction.

## Result

- Baseline distance: `0.6740783925575773`
- Candidate distance: `0.6710014248151079`
- Absolute delta: `-0.00307696774246935`
- Relative delta: `-0.00456470312124198`
- Baseline report SHA-256: `bf8232ff3771034988dbdbdb4bde47ba6b89aef3ce946e8aed93af1d38233ca0`
- Candidate report SHA-256: `2c946a60c0a5d3d3784c5146ed40f4066e3b308b192bafa79ec8f0c3863106ff`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Reject. The aggregate and all component means improved, but both
  offset elbow cops read as attached spherical beads in the strict profiles and
  front-right view, triggering the preregistered production-coherence gate.
  The complete taper-plus-cop construction is indivisible, so the accepted
  cylindrical arms were restored exactly before closure.

## Diagnostics and visual review

All eight candidate beauties and all eight mask overlays were reviewed at full
resolution. Both taper directions are correct, shoulder and gauntlet contacts
remain closed, equipment contact and ordering remain intact, and no torso
collision or broken normal is visible. The tapered arms produce a cleaner rear
silhouette, consistent with improvements in back `-0.0054860`, back-left
`-0.0054580`, back-right `-0.0037603`, left `-0.0057253`, and right
`-0.0007599`. Front-right also improves `-0.0062410`; front regresses
`+0.0032123` and front-left regresses `+0.0060266`, while their registered
three-view mean remains within the bounded regression gate.

Every component mean improves: DreamSim `-0.0051498`, LPIPS `-0.0052318`,
palette/texture `-0.0025957`, parts `-0.0006533`, silhouette `-0.0013493`,
and landmarks `-0.0001871`. The exposed-arm five-view mean improves by about
`0.00424`, comfortably clearing its registered threshold.

The visual failure is nevertheless unambiguous. In left and right profile the
small offset steel ellipsoids form round protruding knobs, and front-right shows
the right cop as a bead sitting on a circular elbow transition. They do not read
as fitted plate cops. This is exactly the registered ball/bead/knee-on-arm hard
reject and cannot be overridden by the otherwise coherent score gain.

## Protocol reflection

This experiment confirms that changing the cylindrical arm construction has
meaningful broad metric leverage and that anchor-preserving taper is much safer
than relocating the elbow path. It also confirms that a UV sphere is the wrong
primitive for an elbow plate: even when mostly embedded and held inside the old
envelope, its highlight and outline expose the toy-ball language. Because taper
and cops were preregistered as one construction, the result does not authorize
retaining taper alone or immediately swapping cop dimensions. The next arm
attempt, if any, needs an authored shell or plate mesh and should be separated
by work in another region.

## Next question

Can an authored smooth cuirass loft replace the accepted egg-shaped mass with
coherent waist, chest, and neck transitions while avoiding the regular facets
and imperceptible deformation failures of experiments 0047 and 0058?

---

# 0060: Replace the egg cuirass with an authored smooth loft

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: the accepted cuirass is a single UV ellipsoid, producing an
  egg-shaped waist/chest/neck transition and broad rear highlight. Coarse
  faceting in 0047 had numeric leverage but failed as a low-poly balloon;
  bounded perturbation in 0058 was imperceptible. A deliberately authored macro
  profile with unchanged extrema is a distinct assembly-level test, not another
  material, normal, facet, or millimetric surface perturbation.
- Hypothesis: replacing only `cuirass_mass` with a closed, smoothly shaded
  elliptical loft that narrows deliberately at waist and neck while preserving
  accepted global X/Y/Z extrema will improve rear, side, and diagonal body
  structure without the regular facets, attached detail, or invisible noise of
  prior shell work.
- Change boundary: add one `elliptical_loft` helper with 32 circumferential
  samples, outward-wound quads, bottom and top pole fans, direct mesh export,
  smooth polygon normals, and no all-edge bevel. Replace only the accepted
  `cuirass_mass` sphere with rings `(z,rx,ry)` exactly
  `(0.85,0.20,0.12)`, `(0.92,0.27,0.16)`, `(1.02,0.33,0.19)`,
  `(1.16,0.36,0.205)`, `(1.30,0.35,0.20)`, `(1.43,0.30,0.17)`,
  `(1.52,0.21,0.12)`, `(1.57,0.11,0.065)`, with bottom pole `0.81`,
  top pole `1.59`, steel material, name `cuirass_mass`, and only object Y set
  to `-0.015`. Keep padded torso, breastplate/shadow/ridges/strap/rivets,
  belt/gorget/arms, every other geometry/material/helper, publication,
  landmarks, cameras, lights, references, annotations, renderer, exporter, and
  metric fixed. The eight-ring macro profile, pole fans, and smooth unbevelled
  construction are indivisible; evidence cannot validate one ring separately.
- Expected movement: rear-three mean and left/right profile mean should improve
  through DreamSim, LPIPS, body-armour parts, silhouette, and coherent
  highlight/form change. Front may move through exposed side shell but should
  remain bounded by the breastplate. Palette may move slightly through changed
  normals and occlusion. Raw landmarks and global authored extrema remain fixed;
  canonical movement is allowed only when explained by the torso outline. Use
  exposed-view means rather than a raw improved-view count.
- Reject if: aggregate improvement is less than `0.001`; rear-three mean or
  profile mean fails to improve; either DreamSim or LPIPS regresses; direct
  front regresses by more than `0.0015`; non-exposed movement outweighs exposed
  gains; mean parts or silhouette regresses by more than `0.003` without a
  larger coherent neural gain; any raw landmark/global bound moves or canonical
  change is unexplained; the loft shows horizontal ring kinks, latitude bands,
  a low-poly/faceted balloon, barrel/hourglass/vase silhouette, pinched pole,
  flat lid/bottom, star-fan shading, broken normals, cap hole, nonmanifold seam,
  or visible mesh rings; the neck swallows or floats from the gorget, a shoulder
  or arm clips, breastplate or padded torso protrudes, a belt/fauld/rear-tabard
  gap opens, strap/ridge depth order changes, or movement cannot be attributed
  to the complete authored loft.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6742601883023723`
- Absolute delta: `+0.00018180218279606475`
- Relative delta: `+0.00026970480961811236`
- Baseline report SHA-256: `019816e4d9d038e9fae3ddd802402398367b43991286f55269dde94f79268980`
- Candidate report SHA-256: `c55bed310a05a8948d3a4ab791ad2404c1f2431035d9a942fd5d6eab7eb7222b`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Reject. The candidate slightly worsened aggregate distance and
  directly regressed back, so it failed both the numeric margin and the primary
  rear-form hypothesis. The accepted ellipsoid was restored exactly before
  closure.

## Diagnostics and visual review

All eight candidate beauties and all eight mask overlays were reviewed at full
resolution. The corrected upper rings preserve the gorget, beard, and shoulder
contacts; the breastplate, belt, arms, and tabards remain attached. No cap hole,
normal inversion, star fan, horizontal band, low-poly facet, or visible ring
kink appears at review resolution. The macro form remains coherent, but it also
continues to read as essentially the same smooth egg-shaped torso.

DreamSim improves `-0.0015073`, LPIPS `-0.0006890`, palette/texture
`-0.0000663`, and silhouette `-0.0002709`; parts regresses `+0.0000811` and
landmarks are unchanged. Front `-0.0017070`, front-left `-0.0001359`,
front-right `-0.0010334`, left `-0.0005386`, and back-left `-0.0021486`
improve. Direct back regresses `+0.0019599`, back-right regresses
`+0.0000274`, and right regresses `+0.0002889`. The rear-three mean changes by
only about `-0.000054`, while the profile mean slightly regresses. This does not
support the registered rear/profile construction hypothesis.

## Protocol reflection

The custom loft demonstrates that an eight-ring smooth manifold can be made
without the visible banding and cap failures anticipated by the protocol. The
limitation is causal leverage: collision-safe upper rings and unchanged global
bounds leave the authored profile too close to the accepted ellipsoid, while
the changed lower profile improves front-facing views at the expense of direct
back and right. More aggressive ring edits would be post-evidence tuning and
would reintroduce the beard, gorget, shoulder, or vase-silhouette hazards found
during preregistration. This closes simple cuirass loft/profile replacement.

## Next question

Can replacing the round cross-body strap cylinder with one flat, seated leather
band improve the three exposed front views while preserving its accepted
centerline, width, rivets, and breastplate contact?

---

# 0061: Replace the round chest strap with a seated flat band

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: the accepted cross-body strap is a smooth cylinder of radius
  `0.034`, so it reads as a round leather baton across the breastplate. The
  references use a broad flat load-bearing band. Experiment 0042 found coherent
  but sub-threshold gains from narrowing the same strap footprint; changing its
  cross-section while retaining the accepted width and centerline is the
  distinct untested form lever.
- Hypothesis: replacing only the round strap with a flat leather band seated on
  the breastplate, and moving its five dependent rivets only in Y to remain
  embedded, will improve the three exposed front views without changing the
  strap's projected centerline, width, endpoints, or semantic publication.
- Change boundary: replace only
  `segment("cross_body_strap",(-0.24,-0.315,1.44),(0.22,-0.315,1.00),
  0.034,leather,root,20)` with
  `blade("cross_body_strap",(-0.24,1.44),(0.22,1.00),0.034,0.034,
  0.050,leather,root)` at object Y `-0.2775`. `blade` widths are half-widths,
  so the full projected width remains `0.068`; the band spans Y
  `-0.3025..-0.2525`, touches the nominal breastplate face, and clears the
  ridge fronts by about `0.0045`. Change only all five strap-rivet center Ys
  from `-0.350` to `-0.3045`, preserving their X/Z centers, scale, material,
  names, and about `0.008` embed into the band face. Keep the breastplate,
  shadow, four ridges, belt, every other body/equipment object, all materials,
  helpers, landmarks, cameras, lights, references, annotations, renderer,
  exporter, and metric fixed. The flat band and five dependent Y moves form one
  indivisible seated assembly.
- Expected movement: front, front-left, and front-right should lead through
  DreamSim and LPIPS by replacing a round highlight with a planar leather band.
  Profiles and diagonals may be asymmetric through shield/sword occlusion;
  rear-three should remain effectively flat. Palette may move modestly. Parts,
  silhouette, landmarks, and canonical bounds should remain essentially fixed
  because the X/Z hull, endpoints, width, names, and body-armour publication are
  preserved.
- Reject if: aggregate improvement is less than `0.001`; the front-three mean
  fails to improve or any of front/front-left/front-right regresses; either
  DreamSim or LPIPS regresses; rear-three mean magnitude exceeds `0.0003` or a
  rear view regresses by more than `0.0005`; parts or silhouette moves by more
  than `0.001` without a localized occlusion explanation; any landmark or bound
  moves; the band disappears edge-on, twists, has inverted normals, floats from
  or sinks into the plate, shows ridge bleed-through or z-fighting, overhangs
  the breastplate at either endpoint, or reads as a plank, pageant sash, or
  plastic strip; any rivet floats, is over-buried, loses centering, leaves the
  band edge, or reads as a glued bead; publication/export changes; or movement
  cannot be attributed to the seated flat assembly.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6738052869336503`
- Absolute delta: `-0.0002730991859259957`
- Relative delta: `-0.0004051445522502631`
- Baseline report SHA-256: `18e35b0d9564ca8d9eab5f40a8ab2f92a1812c314bb1b8acef4932b388611386`
- Candidate report SHA-256: `c0aa3afcd9a2b822c619fd3543d2d68756ad43a2dbfddfd2d2adae8b4060c17e`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Reject. The band is visually coherent, but its `-0.0002731`
  improvement is below the fixed `0.001` acceptance margin and front-right
  regressed. The accepted cylindrical strap was restored exactly before
  closure.

## Diagnostics and visual review

All eight candidate beauties and all eight mask overlays were reviewed at full
resolution. The band remains seated across all four ridge crossings with no
bleed-through or z-fighting. Both caps stay within the accepted breastplate
footprint, all five rivets remain centered and embedded, and no rear or side
view exposes a floating slab. It reads more like leather than the accepted
round baton, although its perfectly straight planar face retains a mild rigid
plank quality.

DreamSim improves `-0.0027895`, LPIPS `-0.0005584`, and parts
`-0.0000282`; palette/texture regresses `+0.0013466`, silhouette regresses
`+0.0001745`, and landmarks are unchanged. Front `-0.0004094` and front-left
`-0.0004156` improve, but front-right regresses `+0.0001106`; left
`-0.0015892` and right `-0.0017904` provide the strongest gains. The rear-three
changes are small but consistently positive, averaging about `+0.000161`.
This is coherent directional evidence, not enough movement for acceptance.

## Protocol reflection

The revised seating protocol successfully prevented the coplanar ridge and
floating-rivet failures identified before evidence. The result also shows why
the fixed margin is useful: a subjectively cleaner local primitive can move one
neural metric while worsening palette and silhouette, with too little aggregate
effect to justify replacing accepted state. Together with 0042, this closes
simple strap width/cross-section work; do not search nearby depth or Y values.
Future torso detail must affect a larger or more semantically important region.

## Next question

Can short, attached, rear-facing tapered hair tufts retain experiment 0012's
strong rear neural gain without repeating its spherical bead/cauliflower
failure?

---

# 0062: Break up the rear hair with short tapered tufts

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: the accepted rear hair is one smooth ellipsoid, while both rigid
  references show an irregular shaggy contour. Experiment 0012 added six smooth
  rear ellipsoids and produced a strong `-0.002814` gain, led by direct back and
  both neural terms, but failed because the additions read as beads and
  cauliflower. Experiment 0015 showed that shortening the existing upright
  front cone row preserves its crown-like repetition. Short, varied, deeply
  attached tufts aimed rearward are a distinct test of the useful rear-breakup
  signal.
- Hypothesis: adding one asymmetric six-tuft assembly of short rear-facing
  tapered cones, deeply attached to `hair_back` and gently fanned laterally,
  will retain experiment 0012's rear neural gain while reading as swept shaggy
  hair rather than spheres, an upright crown, or detached porcupine quills.
- Change boundary: immediately after unchanged `hair_back`, add six tuples
  `(x,y,z,radius1,radius2,depth,fan)` exactly
  `(-0.090,0.109,1.735,0.030,0.005,0.060,0.20)`,
  `(-0.045,0.117,1.770,0.025,0.004,0.052,0.10)`,
  `(0.000,0.117,1.790,0.029,0.005,0.058,-0.03)`,
  `(0.050,0.116,1.765,0.024,0.004,0.050,-0.10)`,
  `(0.095,0.111,1.720,0.031,0.005,0.063,-0.19)`, and
  `(0.000,0.149,1.655,0.027,0.004,0.055,0.04)`. For each, create
  `cone(f"hair_tuft_rear_{index}",...,hair,root,16,
  rotation=(-math.pi/2,0,fan))`. Blender maps local +Z/tip primarily toward
  world +Y/rear; radius1/base points into the hair shell. The varied centers
  place roots about `0.012` inside the local ellipsoid, shorten exposed locks,
  and fan the outer pair outward. Keep `cone`, `hair_back`, all seven existing
  front tufts, head/face/beard, hair material, landmarks, every body/equipment
  object, cameras, lights, references, annotations, renderer, exporter, and
  metric fixed. The six positions, dimensions, and fans are one indivisible
  assembly.
- Expected movement: direct back and rear-three mean should lead through
  DreamSim, LPIPS, and head/hair parts; profiles may improve where outer tufts
  break the smooth rear contour. Front and front diagonals should remain nearly
  flat because additions point away from the face. Palette/texture may improve
  through broken highlights. Raw landmarks and global bounds remain fixed;
  silhouette, parts, and canonical landmarks may move only around the rear hair
  contour.
- Reject if: aggregate improvement is less than `0.001`; rear-three mean fails
  to improve by at least `0.001`; direct back fails to improve by `0.002` or
  either rear diagonal regresses by more than `0.0015`; either DreamSim or LPIPS
  regresses; front-three mean magnitude exceeds `0.0005`; head/hair parts or
  silhouette regresses by more than `0.003` without a larger coherent rear
  neural gain; any raw landmark/global bound moves or canonical movement is not
  localized to rear hair; a base seam, gap, detached root, flat cap, shell
  penetration, face intrusion, crown growth, or front-tuft clash appears; the
  six pieces read as countable spikes, porcupine, crown, fan, bouquet, horns,
  scales, beads, cauliflower, paw print, or pasted cones rather than one shaggy
  mass; front facial readability, semantic publication, or GLB validation
  changes; or movement cannot be attributed to the complete rear assembly.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6716373316562312`
- Absolute delta: `-0.0024410544633450826`
- Relative delta: `-0.003621321367975235`
- Baseline report SHA-256: `ca662060003a838592037690fe9ea0935d532fec791b479b5162f0da3af99c56`
- Candidate report SHA-256: `43157ebdb126079f6efea12c4c74f25e191edcdaf7bf5a294e35b8add9bcf434`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Reject. The candidate clears the numeric margin and improves the
  registered rear views, but the six pieces are individually countable as
  buttons and porcupine spikes and front-left regresses enough to fail the
  front-three exposure bound. The accepted hair was restored exactly before
  closure.

## Diagnostics and visual review

All eight candidate beauties and all eight mask overlays were reviewed at full
resolution. The roots remain physically attached and below the crown, with no
gorget, pauldron, face, or scalp intersection. Nevertheless, direct back shows
five rounded cone tips as a regular row of buttons plus one isolated center
button. Both profiles show a literal line of short quills, and rear diagonals
expose the roots as pasted scales. The assembly reads as porcupine hair rather
than a merged shaggy mass. Front-left visibly exposes two side tufts, explaining
its unexpected `+0.0032954` regression.

Aggregate improves `-0.0024411`. DreamSim improves `-0.0088211`, LPIPS
`-0.0006516`, and palette/texture `-0.0012070`; parts regresses
`+0.0007319`, silhouette regresses `+0.0004770`, and landmarks are unchanged.
Back improves `-0.0047492`, back-left `-0.0010928`, back-right `-0.0045866`,
left `-0.0015727`, and right `-0.0042177`. Front is flat, front-right improves
`-0.0004428`, but the front-three mean regresses about `+0.000948`, beyond the
registered `0.0005` bound. Both the exposure gate and hard visual gate fail.

## Protocol reflection

This reproduces the important 0012 result with a different primitive: adding
rear hair volume strongly helps DreamSim and rear views, but any array of
separate smooth primitives exposes its count and attachment language. Deep
roots, unequal sizes, short lengths, and outward fan were insufficient. The
metric rewards the new outline/texture even when the result becomes visibly
less hair-like, which validates the human production gate. Primitive-array hair
breakup is now closed; a future solution would require one merged authored hair
shell or strands, not another cone/sphere arrangement or parameter sweep.

## Next question

Can changing the two spherical gauntlets into same-envelope rounded articulated
blocks improve hand/equipment readability without moving either hand anchor or
reopening arm construction?

---

# 0063: Replace spherical gauntlets with rounded plate blocks

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: both accepted gauntlets are bright UV ellipsoids at fixed hand
  anchors, so their uninterrupted round highlights read as balls at the sword
  and shield contacts. Experiment 0037 showed that darkening those spheres
  removes useful separation; the bright material should remain. Experiment
  0059 held gauntlets fixed, so its rejected arm reconstruction does not test
  hand primitive shape. A same-envelope sphere-to-chamfered-block replacement
  is the remaining isolated gauntlet-form lever.
- Hypothesis: replacing the two bright spherical gauntlets with axis-aligned
  rounded plate blocks at the same centers and exact full XYZ envelopes will
  retain hand prominence and equipment overlap while changing the toy-ball
  highlight into a compact armoured-fist read.
- Change boundary: inside the unchanged `arm_points` loop, replace only
  `sphere(side+"_gauntlet",hand,(0.11,0.10,0.13),bright,root)` with
  `rounded_box(side+"_gauntlet",hand,(0.22,0.20,0.26),bright,root,0.055)`.
  Sphere scale values are radii while rounded-box values are full dimensions,
  so both constructions retain authored envelopes `0.22 x 0.20 x 0.26` around
  each unchanged hand. Keep hand centers, arm paths and geometry, pauldrons,
  sword/shield geometry and order, bright material, every helper and other
  caller, names/publication, landmarks, cameras, lights, references,
  annotations, renderer, exporter, and metric fixed. Do not rotate, taper,
  offset, recolour, segment, or add fingers. The mirrored substitutions and
  shared bevel form one indivisible test.
- Expected movement: front, both front diagonals, and both profiles should lead
  through DreamSim, LPIPS, body-armour parts, and local silhouette. Rear views
  may move where hands clear torso/equipment but should be smaller. Palette may
  move through flatter normals despite fixed material. Raw hand/equipment
  landmarks remain fixed; canonical movement is allowed only around changed
  hand contours. Axis-aligned extrema remain identical, although oblique
  projections can grow because blocks fill more of their bounds.
- Reject if: aggregate improvement is less than `0.001`; the mean of front,
  front-left, front-right, left, and right fails to improve by `0.001`; either
  DreamSim or LPIPS regresses; rear-three mean regresses by more than `0.001`;
  parts or silhouette regresses by more than `0.003` without a larger coherent
  neural gain; any raw landmark/authored bound moves or canonical movement is
  unexplained; a block opens or obscures the vambrace junction, changes
  sword/shield order, loses shield overlap, creates a collision, or makes the
  existing sword-depth gap less readable; either hand reads as a cube, die,
  luggage, oven mitt, boxing glove, oversized cuff, soap bar, or featureless
  metal brick rather than compact plate; bevels balloon/collapse, normals break,
  identical blocks shade asymmetrically, highlights clip, a hand disappears,
  semantic publication/GLB validation changes, or movement cannot be attributed
  to the same-envelope replacement.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6759044296472635`
- Absolute delta: `+0.0018260435276872267`
- Relative delta: `+0.27089483438255514%`
- Baseline report SHA-256: `1ab16d0fcb0ca5f5b20f0d67b199d48ce876bb4e735ce0c39087f39edeb57f3e`
- Candidate report SHA-256: `bd63e38e94209fcc1b7d3b817fb744f334db0a895e43162c1436b6f42f64d921`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Rejected. The candidate regressed by `0.001826`, so it failed the
  required aggregate margin. It also failed the registered appearance and
  production gates: both neural means regressed, seven views worsened, and the
  rounded blocks read as monolithic cuffs or oven mitts rather than gauntlets.

## Diagnostics and visual review

DreamSim regressed `+0.0085290521`, LPIPS `+0.0028058887`, parts
`+0.0011525204`, and silhouette `+0.0001756870`. Palette/texture improved
`-0.0005158648`; landmarks were exactly unchanged. The registered exposed-five
mean regressed `+0.0041593976`; front-three regressed `+0.0052595146`, profiles
regressed `+0.0025092220`, and only back-left improved. Rear-three improved
`-0.0009107818` solely because of that back-left result.

All eight overlays localize movement to the two gauntlet/wrist contours. Part
publication, equipment order, crops, and every unchanged region remain stable,
so the failure is causal rather than protocol contamination. All eight beauty
renders retain closed wrist junctions and the shield-hand overlap, with no mesh
hole or bevel failure. However, front and both front diagonals show broad square
hand masses and bright corner wedges; both profiles expose flat-sided robotic
cuffs; back shows two symmetric flat-bottom blocks; and both rear diagonals show
the same mallet-like termination. The square sword hand also makes the existing
grip-depth separation more obvious. These are the preregistered cube,
oven-mitt, oversized-cuff, and contact-read failures.

## Protocol reflection

- Exact AABB preservation did not preserve the useful projected contour: the
  rounded boxes filled more of their oblique bounds and damaged seven views.
- Keeping polished steel retained hand visibility, but flat faces traded the
  sphere's toy-ball cue for a stronger robot-cuff cue.
- Back-left's isolated improvement did not generalize to direct back, the other
  rear diagonal, profiles, or any front-facing view.
- The overlays confirm the metric movement came only from the registered hand
  geometry, so no framing or semantic explanation rescues the candidate.
- Close same-envelope monolithic rounded-block gauntlet tuning. A future hand
  rebuild would need authored multi-plate/finger language rather than another
  bevel or size adjustment.

## Next question

Can seated reverse-side shield carrying bands improve the currently blank
body-facing shield surface without leaking onto its accepted decorated face?

---

# 0064: Add reverse shield carrying bands

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: the accepted heater shield has a settled outline, thin outer
  slab, inset field, and compact front boss, but its body-facing reverse is a
  blank black plane. Rear, rear-diagonal, and profile references expose carrying
  structure behind the shield. Prior shield experiments changed the decorated
  face, outline, thickness, boss, or field response; none added reverse-side
  attachment hardware.
- Hypothesis: adding one seated pair of broad, low-profile leather carrying
  bands to only the body-facing reverse will improve rear/profile shield
  similarity while preserving the decorated face, outer silhouette, hand pose,
  shield landmarks, and depth order.
- Change boundary: immediately after the unchanged shield field and boss, add
  exactly:
  ```py
  rounded_box("shield_rear_grip", (0.530, -0.245, 1.180),
              (0.180, 0.036, 0.040), leather, root, 0.012)
  rounded_box("shield_rear_forearm_band", (0.500, -0.245, 1.310),
              (0.247386, 0.040, 0.044), leather, root, 0.012,
              rotation=(0, 0.244979, 0))
  ```
  The first band follows `(0.44,1.18)->(0.62,1.18)`. The second follows
  `(0.38,1.34)->(0.62,1.28)`; length `0.247386` and Y rotation `0.244979`
  encode that slope. The outer shield reverse is Y `-0.2575`; the bands span
  Y `-0.263..-0.227` and `-0.265..-0.225`, embedding `0.0055` and `0.0075`.
  Their footprints remain inside the accepted polygon. Keep every accepted
  shield point/depth/Y/bevel/material, field, boss, landmarks, right arm/hand,
  sword/body, helpers and callers, cameras, lights, references, annotations,
  renderer, exporter, and metric fixed. Do not cut holes, add buckles/rivets,
  raise loops, move the hand, or change front hardware. The pair is one
  indivisible reverse carrying assembly.
- Expected movement: back, back-left, and back-right should lead through
  DreamSim, LPIPS, palette/texture, and shield parts wherever the reverse clears
  the torso. Profiles and rear diagonals may move through bodyward relief.
  Direct front should remain effectively invariant because the opaque slab
  occludes the additions; front diagonals may show a restrained edge sliver or
  cast shadow. Silhouette may move slightly in side/rear projections. Raw
  landmarks remain fixed; canonical movement is allowed only around visible
  reverse relief.
- Reject if: aggregate improvement is less than `0.001`; rear-three mean fails
  to improve by `0.001`; direct back regresses or neither rear diagonal
  improves; either DreamSim or LPIPS regresses; direct-front absolute movement
  exceeds `0.0005` or cannot be localized to shield/body edge or cast shadow;
  shield parts regresses by more than `0.003`, or silhouette regresses by more
  than `0.002` without a larger coherent rear neural gain; any raw landmark or
  unchanged object's point/depth/pose moves; canonical crop movement is
  unexplained; a band exits the shield, floats, z-fights, sinks, exposes a
  buried edge, crosses the bevel, leaks through the decorated face, or collides
  with torso/arm/hand; the pieces read as pasted bars, luggage rails, a modern
  bracket, an equals sign, rigid metal plates, or unrelated strips rather than
  worn carrying bands; contrast is imperceptible; bevels/normals/export or
  semantic publication fail; or movement is not attributable to the pair.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6744650269036652`
- Absolute delta: `+0.00038664078408889857`
- Relative delta: `+0.05735843071822087%`
- Baseline report SHA-256: `420dfe039af6bcb6e0608786c559acf572fb61f8eed6d7b44498648fec2730a0`
- Candidate report SHA-256: `fcfc4807ab74ea2075d338f98db9e36397594a88c45f35c094ee4ba669d0036b`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Rejected. Aggregate distance regressed, the registered rear-three
  mean regressed, DreamSim regressed, and the exposed pieces read as pasted
  luggage rails or an equals sign rather than a carrying assembly.

## Diagnostics and visual review

DreamSim regressed `+0.0020347685`, palette/texture `+0.0009998055`, and
silhouette `+0.0001553255`. LPIPS improved only `-0.0001042187`, parts
`-0.0001091004`, and landmarks were exactly unchanged. Rear-three regressed
`+0.0017380485`; the reverse-exposed five-view mean regressed `+0.0009007312`.
Back-left was the dominant failure at `+0.0051515721`; direct back and
back-right also regressed. Front stayed within its visibility bound, while
front-left, front-right, and left improved modestly.

All eight overlays localize movement to the shield reverse and its profile;
landmarks, crops, unchanged objects, semantic publication, and decorated-face
contours remain stable. The meshes are cleanly seated with no visible float,
z-fight, bevel crossing, or front-face leak. In left they appear as two thick
orange rounded rails separated by a large gap. Back-left shows the clearest
failure: two parallel bars form a pasted equals sign and disappear behind the
arm instead of wrapping it. Direct back exposes only two short pegs beside the
shield/shoulder, suggesting a collision. Five other views largely occlude the
hardware, so it never establishes a functional carrying relationship.

## Protocol reflection

- Correct analytic seating prevented mesh defects but could not make two rigid
  rounded boxes read as flexible leather hardware.
- Visibility was too sparse: the assembly was useful only in left/back-left,
  confusing in back, and absent from five views.
- Back-left's strong regression shows that adding detail to a blank target
  region is harmful when the detail vocabulary and carrying relationship are
  wrong.
- The semantic and landmark invariance confirms a clean causal rejection.
- Close simple raised reverse-bar hardware; do not tune spacing, rotation, Y,
  or material nearby.

## Next question

Can a single continuous authored pauldron shell replace the smooth shoulder
sphere while preserving its compact envelope, arm attachment, and seated rivets?

---

# 0065: Rebuild tapered arms with authored plate cops

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: the accepted arms are constant-radius cylinders meeting at bare
  elbow cap seams. Experiment 0059 replaced them with anchor-preserving tapers
  plus spherical elbow cops and improved aggregate by `0.003077`, the
  arm-exposed five-view mean by about `0.00424`, every rear view, both neural
  terms, and every component. It was rejected only because its offset spheres
  read as attached beads. A thin closed plate cop is the distinct correction
  left open by that result.
- Hypothesis: rebuilding both arms with 0059's complete anchor-preserving
  tapers, but using fitted mirrored hexagonal elbow plates, will retain its
  broad measured gain while replacing the bead language with coherent plate
  articulation without moving shoulder, elbow, hand, sword, or shield anchors.
- Change boundary: add only these helpers after `segment`:
  ```py
  def tapered_segment(name, start, end, radius1, radius2,
                      used_material, root, vertices=28):
      start = Vector(start)
      end = Vector(end)
      direction = end - start
      midpoint = (start + end) / 2
      bpy.ops.mesh.primitive_cone_add(
          vertices=vertices, radius1=radius1, radius2=radius2,
          depth=direction.length, location=midpoint)
      obj = bpy.context.object
      obj.rotation_mode = "QUATERNION"
      obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(
          direction.normalized())
      return finish(obj, name, used_material, root, 0.009, True)


  def elbow_plate(name, elbow, side_sign, used_material, root):
      diagonal = math.sqrt(0.5)
      normal = Vector((side_sign * diagonal, -diagonal, 0))
      tangent = Vector((diagonal, side_sign * diagonal, 0))
      center = Vector(elbow) + normal * 0.122
      outline = ((-0.05100, -0.045), (0.00000, -0.085),
                 (0.05525, -0.060), (0.06375, 0.025),
                 (0.01700, 0.080), (-0.04675, 0.070))
      plate_outline = (outline if side_sign < 0 else
                       tuple((-across, height)
                             for across, height in reversed(outline)))
      half_depth = 0.012
      vertices = []
      for normal_offset in (-half_depth, half_depth):
          for across, height in plate_outline:
              point = center + tangent * across + normal * normal_offset
              point.z += height
              vertices.append(tuple(point))
      count = len(plate_outline)
      faces = [tuple(reversed(range(count))),
               tuple(range(count, count * 2))]
      for index in range(count):
          following = (index + 1) % count
          faces.append((index, following,
                        count + following, count + index))
      mesh = bpy.data.meshes.new(name + "_mesh")
      mesh.from_pydata(vertices, [], faces)
      mesh.update()
      obj = bpy.data.objects.new(name, mesh)
      bpy.context.scene.collection.objects.link(obj)
      return finish(obj, name, used_material, root, 0.008)
  ```
  Inside unchanged `arm_points`, replace only the two `segment` arm calls with:
  ```py
  tapered_segment(side + "_upper_arm", shoulder, elbow,
                  0.125, 0.090, black, root)
  tapered_segment(side + "_vambrace", elbow, hand,
                  0.125, 0.095, steel, root)
  elbow_plate(side + "_elbow_cop", elbow,
              -1 if side == "left" else 1, steel, root)
  ```
  Keep arm points, pauldrons/rivets, accepted gauntlets, landmarks, equipment
  geometry/order, materials, every other helper/caller/object, cameras, lights,
  references, annotations, renderer, exporter, and metric fixed. Radius1 maps
  to the start and radius2 to the end. Plate inner/outer planes are at normal
  radii `0.110/0.134`; their narrowed outlines reduce curved-edge air gaps to
  about 3 mm for the fixed bevel while retaining roughly 9 mm central relief.
  The right outline is a true X-mirror with preserved winding. The four tapers
  and two plates are one indivisible construction.
- Expected movement: back, back-left, back-right, left, and right should lead
  through DreamSim, LPIPS, body-armour parts, and silhouette. Front views may be
  asymmetric through equipment occlusion, but plate cops should reduce 0059's
  bead-related front damage. Palette may move slightly. Raw anchors remain
  fixed; canonical movement is allowed only around arm/elbow contours.
- Reject if: aggregate improvement is less than `0.001`; arm-exposed five-view
  mean improves less than `0.002`; rear-three mean improves less than `0.0015`
  or any rear view regresses by more than `0.001`; either DreamSim or LPIPS
  regresses; front-three mean regresses by more than `0.0015`; parts or
  silhouette regresses by more than `0.003` without larger coherent neural gain;
  any raw anchor/equipment contact/order or unchanged authored bound moves;
  taper direction reverses; any shoulder/wrist/elbow gap, cap crescent, joint
  discontinuity, torso/pauldron/gauntlet/equipment collision, or asymmetry
  appears; a plate is buried, floats, tunnels, opens, reverses winding, becomes
  nonmanifold, or shows pinched bevel/normals; either cop reads as a bead,
  button, badge, fin, wing, shield, knee-on-arm, glued hexagon, flat tile, or
  modern bracket instead of fitted elbow armour; semantic publication/GLB
  validation changes; or movement cannot be attributed to the complete rebuild.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6724037782280479`
- Absolute delta: `-0.0016746078915284013`
- Relative delta: `-0.24842925185133273%`
- Baseline report SHA-256: `1ea7d588852ba9dcf71204d2006ad8d0427668b86fd5f3ccec7dc2d08f6c23a7`
- Candidate report SHA-256: `8f8e3bd1ccf54429215e10d6fbd059ea65052199967b89d2d6fc71ad1cee7191`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Rejected despite clearing the aggregate margin. DreamSim and the
  front-three gate failed, while the authored cops triggered the registered
  glued-badge, fin, flat-tile, daylight, and cap-crescent production gates.

## Diagnostics and visual review

LPIPS improved `-0.0033467188`, palette/texture `-0.0029712261`, silhouette
`-0.0014946109`, parts `-0.0004450377`, and canonical landmarks
`-0.0001870748`; DreamSim regressed `+0.0012032092`, a hard failure. The
arm-exposed five-view mean improved `-0.0033346709`, rear-three improved
`-0.0047051808`, and all three rear views passed. Front-three regressed
`+0.0033460635`, also a hard failure. Left improved while right regressed.

All eight overlays localize movement to the tapered arm/elbow contours and
their immediate equipment occlusion. Raw landmark JSON, equipment order, and
unchanged regions are stable; the small canonical landmark gain comes from arm
foreground shape. The tapers themselves are coherent: directions are correct,
shoulder and wrist contacts stay closed, and no torso, pauldron, gauntlet, sword,
or shield collision appears. The plates fail visually in every exposed angle.
Front/front-right/right show broad pasted polygon badges or miniature shields;
left and both rear diagonals show thin upright fins with apparent daylight;
back shows two symmetric tabs; and bright vambrace cap crescents remain visible.
The pair mirrors correctly and has no mesh break, but does not wrap or seat as
functional elbow armour.

## Protocol reflection

- The repeated strong rear/LPIPS/parts/silhouette signal confirms that tapered
  arms are directionally valuable.
- Replacing spherical beads with thin planar solids traded one explicit toy
  primitive for another: badges in broad views and fins edge-on.
- Central analytic embedding cannot make a flat plate conform around a curved,
  angled joint; visible side/top daylight remained after the pre-evidence width
  correction.
- The exact anchor and semantic invariance confirms the failure is causal, not
  framing or publication contamination.
- Close discrete attached elbow-cop primitives and nearby offset/outline/bevel
  tuning. Any future arm solution must integrate elbow articulation into a
  continuous authored shell rather than attach another primitive.

## Next question

Can one continuous baked rear-hair shell retain the strong measured rear-volume
signal without exposing the countable primitive language that rejected 0012
and 0062?

---

# 0066: Shape one merged rear-hair shell

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: the accepted rear hair is one smooth ellipsoid. Experiments 0012
  and 0062 independently improved aggregate by `0.002814` and `0.002441`, with
  strong rear/neural gains, but failed because separate spheres and cones read
  as beads, cauliflower, buttons, or quills. Their records close primitive
  arrays and leave a merged authored shell as the valid representation.
- Hypothesis: a low-frequency, centimetre-scale deformation baked into the
  existing watertight hair mesh will retain the rear-volume gain while reading
  as one asymmetrically swept shaggy mass, without moving the face, crown,
  existing front locks, or head anchors.
- Change boundary: add exactly this helper after `sphere`:
  ```py
  def shape_rear_hair_shell(obj):
      for vertex in obj.data.vertices:
          x, y, z = vertex.co
          nx = x / 0.126
          ny = y / 0.092
          nz = z / 0.170
          t = max(0.0, min(1.0, (ny + 0.18) / 1.18))
          rear = t * t * (3.0 - 2.0 * t)
          cap = max(0.0, 1.0 - nz * nz)
          pattern = (0.68
                     + 0.18 * math.sin(3.2 * nx + 2.4 * nz + 0.35)
                     + 0.14 * math.sin(5.3 * nx - 3.1 * nz - 0.20))
          displacement = 0.026 * rear * cap * pattern
          normal = Vector((x / (0.126 * 0.126),
                           y / (0.092 * 0.092),
                           z / (0.170 * 0.170)))
          if normal.length_squared > 0:
              vertex.co += normal.normalized() * displacement
          lower = max(0.0, -nz)
          nape = (0.018 * rear * lower * lower
                  * max(0.0, 1.0 - nx * nx)
                  * (0.82 + 0.18 * math.sin(4.1 * nx + 0.30)))
          vertex.co.z -= nape
      obj.data.update()
  ```
  Replace only the accepted `hair_back` sphere call with capture plus
  `shape_rear_hair_shell(hair_back)`. Keep topology, center/accepted scale,
  material, smooth shading/bevel, name/publication, head/face/beard, all seven
  front tufts, crown/chin landmarks, body/equipment, cameras, lights,
  references, annotations, renderer, exporter, and metric fixed. `rear` is zero
  for normalized Y at or below `-0.18`, rises smoothly through the side rim, and
  reaches one at the rear pole. The positive field adds no dents; radial relief
  is capped at `0.026`, and the squared lower term merges a restrained nape.
  The exact fade, field, amplitude, and nape are one indivisible construction.
- Expected movement: direct back and rear-three should lead through DreamSim,
  LPIPS, head/hair parts, palette, and a continuous contour/highlight change.
  Profiles may improve through restrained asymmetry. Front views should remain
  stable because the shell front is fixed and side leakage is smoothly
  suppressed. Approximate local bounds become X `[-.128149,.127152]`, Y
  `[-.092,.114213]`, Z `[-.171414,.170]`: rear grows about 22.2 mm, sides about
  1--2 mm, nape drops about 1.4 mm, while crown/front poles stay fixed. Raw
  landmarks remain fixed; canonical movement must localize to that envelope.
- Reject if: aggregate improvement is less than `0.001`; rear-three improves
  less than `0.0015`; direct back improves less than `0.002` or either rear
  diagonal regresses more than `0.001`; either DreamSim or LPIPS regresses;
  front-three regresses more than `0.0008` or direct-front movement is not
  localized to the faded rim; head/hair parts or silhouette regresses more than
  `0.003` without larger coherent rear neural gain; raw crown/chin/front pole
  moves or canonical bounds exceed the registered envelope; any face/front-lock
  change, scalp gap, gorget/pauldron collision, self-intersection, open seam,
  inverted/pinched normal, bevel failure, UV band/pole star, or semantic/GLB
  failure appears; the result has countable bumps/lobes/scales/spikes/strands,
  or reads as cauliflower, porcupine, helmet, melted rubber, tumor, balloon,
  mullet curtain, mushroom, rear bustle, corrugated/hammered/procedural surface,
  or is imperceptible; or movement is not attributable to the merged shell.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6743897875930531`
- Absolute delta: `+0.00031140147347685776`
- Relative delta: `+0.04619662637004023%`
- Baseline report SHA-256: `4f6e4c7afa81e0bfc7daaa9faf75376966c9f9249df52cb4bd7e599021e0e910`
- Candidate report SHA-256: `b0156d9cc71f9336e947e80f84787c4482132e8d0b74b3386f94a1b5e92632c9`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: Rejected. Aggregate, LPIPS, rear-three, direct back, parts,
  silhouette, and palette all failed. The clean continuous shell remained an
  imperceptibly altered egg in back and became a smooth helmet/mullet bulge in
  the right profile rather than shaggy hair.

## Diagnostics and visual review

DreamSim improved `-0.0026113391`; LPIPS regressed `+0.0006388873`,
palette/texture `+0.0003616940`, parts `+0.0015958483`, and silhouette
`+0.0006025724`. Landmarks were unchanged. Rear-three regressed
`+0.0007815175`; direct back regressed `+0.0009538053`; both rear diagonals also
regressed. Front-three narrowly stayed within its bound at `+0.0006815386`.
Right improved `-0.0044510261`, but the other seven views averaged a regression.

All eight overlays localize movement to the head/hair rim; raw crown/front
anchors and every unrelated region remain stable. The shell is continuous and
watertight with no countable lobes, UV seam/band, pole star, broken normals,
front-lock detachment, scalp gap, or gorget/pauldron collision. Front is visually
invariant. Front-left/front-right/left show only marginal fullness. Back and
back-left retain the same smooth egg. Back-right and especially right expose one
broad rounded overhang that reads as an inflated helmet or mild mullet curtain,
not swept hair. The primary back-view change is effectively imperceptible.

## Protocol reflection

- Continuous deformation solved the separate-object/countability defect of
  0012 and 0062, but positive low-frequency relief did not create hair language.
- DreamSim again rewards rear volume, while LPIPS, parts, silhouette, and every
  rear view reject this smooth analytic form.
- Smoothstep and the squared nape removed seams and protected the front/collar,
  confirming the failure is representational rather than a mesh artifact.
- Close this analytic rear-hair displacement field; do not tune amplitudes,
  phases, or fade after evidence.
- Future rear hair would require a genuinely authored continuous lock surface,
  not primitive arrays or a displaced ellipsoid.

## Next question

Can one connected rigid skirt assembly replace both ignored cloth occluders and
the unfinished fauld/crotch construction without exposing holes or pouch-like
separate plates?

---

# 0067: Replace cloth and faulds with a common-rail rigid skirt

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: the rigid reference has no hanging cloth and uses connected
  articulated waist armour. Experiment 0031 removed both tabards and improved
  aggregate `0.001983`, DreamSim, and parts, but exposed an unfinished crotch
  beneath narrow horizontal bars. Experiment 0020's separate boxes regressed and
  read as pouches because they lacked a common attachment. Cloth removal is
  useful only if the bars and open crotch are replaced simultaneously by a
  connected rigid assembly.
- Hypothesis: replacing the complete ignored-cloth plus horizontal-fauld area
  with one dark-steel elliptical rail and twelve overlapping radially seated
  tapered plates will preserve the no-cloth gain while closing the crotch and
  avoiding pouch language, without moving belt, thighs, knees, or landmarks.
- Change boundary: add exactly these helpers after `prism`:
  ```py
  def elliptical_skirt_rail(name, used_material, root, segments=32):
      outer_x, outer_y = 0.305, 0.205
      inner_x, inner_y = 0.270, 0.170
      bottom_z, top_z = 0.780, 0.860
      vertices = []
      for z, radius_x, radius_y in (
              (bottom_z, outer_x, outer_y),
              (top_z, outer_x, outer_y),
              (bottom_z, inner_x, inner_y),
              (top_z, inner_x, inner_y)):
          for index in range(segments):
              angle = 2 * math.pi * index / segments
              vertices.append((radius_x * math.cos(angle),
                               radius_y * math.sin(angle), z))
      outer_bottom = 0
      outer_top = segments
      inner_bottom = 2 * segments
      inner_top = 3 * segments
      faces = []
      for index in range(segments):
          following = (index + 1) % segments
          faces.extend((
              (outer_bottom + index, outer_bottom + following,
               outer_top + following, outer_top + index),
              (inner_bottom + index, inner_top + index,
               inner_top + following, inner_bottom + following),
              (outer_top + index, outer_top + following,
               inner_top + following, inner_top + index),
              (outer_bottom + index, inner_bottom + index,
               inner_bottom + following, outer_bottom + following),
          ))
      mesh = bpy.data.meshes.new(name + "_mesh")
      mesh.from_pydata(vertices, [], faces)
      mesh.update()
      obj = bpy.data.objects.new(name, mesh)
      bpy.context.scene.collection.objects.link(obj)
      return finish(obj, name, used_material, root, 0.008, True)


  def radial_skirt_plate(name, angle, bottom_z, used_material, root):
      radial = Vector((math.cos(angle), math.sin(angle), 0))
      tangent = Vector((-math.sin(angle), math.cos(angle), 0))
      center = Vector((0.2875 * math.cos(angle),
                       0.1900 * math.sin(angle), 0))
      outline = ((-0.060, bottom_z), (0.060, bottom_z),
                 (0.090, 0.805), (-0.090, 0.805))
      half_depth = 0.019
      vertices = []
      for radial_offset in (-half_depth, half_depth):
          for across, height in outline:
              point = center + tangent * across + radial * radial_offset
              point.z = height
              vertices.append(tuple(point))
      count = len(outline)
      faces = [tuple(reversed(range(count))),
               tuple(range(count, count * 2))]
      for index in range(count):
          following = (index + 1) % count
          faces.append((index, following,
                        count + following, count + index))
      mesh = bpy.data.meshes.new(name + "_mesh")
      mesh.from_pydata(vertices, [], faces)
      mesh.update()
      obj = bpy.data.objects.new(name, mesh)
      bpy.context.scene.collection.objects.link(obj)
      return finish(obj, name, used_material, root, 0.010)
  ```
  Remove only `rear_tabard`; the complete `fauld_*`/`fauld_edge_*` loop;
  `tabard`; and `tabard_badge`. Immediately after unchanged belt/buckle add:
  ```py
  elliptical_skirt_rail("skirt_attachment_rail", steel, root)
  for index in range(12):
      angle = -math.pi / 2 + index * math.pi / 6
      bottom_z = 0.620 - 0.060 * abs(math.sin(angle))
      if index % 2:
          bottom_z += 0.015
      radial_skirt_plate(f"skirt_plate_{index:02d}", angle,
                         bottom_z, steel, root)
  ```
  Keep cloth material and raw `tabard_bottom` landmark even though no ignored
  object consumes them. Keep belt/buckle, torso, thighs/leg anchors, all other
  objects/materials, helpers, cameras, lights, references, annotations,
  renderer, exporter, metric, and part/ignored rules fixed. The deletions plus
  13 overlapping closed solids are one indivisible common-rail articulated
  assembly; it is visually connected, not Boolean-unioned.
- Expected movement: front, back, and four diagonals should improve through
  DreamSim, LPIPS, body-armour parts, silhouette, and elimination of ignored
  holes. Profiles may move less. Palette changes materially because red cloth,
  badge, and bright bars become dark steel. Raw landmarks remain fixed;
  canonical movement must localize to the waist/skirt and removed occlusion.
- Reject if: aggregate improvement is less than `0.001`; front or back regresses
  or front/back/diagonal six-view mean improves less than `0.001`; either
  DreamSim or LPIPS regresses; parts or silhouette regresses over `0.002`; a
  profile regresses over `0.003`; any raw anchor/unchanged bound moves; ignored
  pixels remain or former cloth regions clear to holes instead of rigid armour;
  publication/export fails; rail/belt separates, tunnels, z-fights, opens, shows
  its inner wall, or reads as a second belt/donut/tutu hoop; a plate detaches,
  clips thigh/knee, reverses winding, opens, leaves crotch/rear holes, exposes
  thigh caps, or forms zipper seams; the assembly reads as pouches, piano keys,
  fence teeth, Roman strips, petals, tutu, cage, lampshade, gear, tire, barrel,
  rigid tube, or merged slab; repetition/stagger creates a saw hem; plate motion
  is impossible; front/back plates intersect visibly between legs; bevels or
  normals fail; or movement is not attributable to the full replacement.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6741930997038315`
- Absolute delta: `+0.0001147135842551883`
- Relative delta: `+0.017017840449617827%`
- Baseline report SHA-256: `39c070009310151fe20c0ff535889101e7a82e61567241926ad2ec6eb9d2befa`
- Candidate report SHA-256: `9b43f38bf5a37e2c38aebf2f36cf2a51d91859d3377e8062332d9e3fc32550f7`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: reject. The candidate regressed aggregate distance, LPIPS,
  silhouette, direct front, direct back, and the registered six-view mean. The
  rail and plates closed the ignored-cloth holes cleanly, but the repeated
  construction triggered the explicit pouch, Roman-strip, piano-key, saw-hem,
  second-belt, tutu, and lampshade rejection gates.

## Diagnostics and visual review

- Component deltas (candidate minus baseline): DreamSim
  `-0.004956990480422974`, landmarks `0`, LPIPS
  `+0.007487736642360687`, palette/texture `-0.0016281113240063927`,
  parts `-0.003541030938730594`, silhouette `+0.005807785825305278`.
  DreamSim, palette, and parts improved, but LPIPS and silhouette failed their
  hard gates.
- View deltas: back `+0.0008462627386329746`, back-left
  `+0.005786420681857418`, back-right `-0.009241645325471892`, front
  `+0.005163442755131364`, front-left `+0.0016388049703618401`, front-right
  `-0.001881440170412807`, left `+0.0020793380116465032`, and right
  `-0.005424272732711177`. The registered front/back/diagonal six-view mean was
  `+0.00038530760834981637`; front-three was `+0.0016402691850267992`,
  rear-three `-0.0008696539683271665`, and profiles
  `-0.001672467360532337`.
- All eight beauties and overlays were reviewed at full resolution. Movement
  localized to the intended waist/skirt replacement. Raw landmark JSON was
  identical; head, upper torso, arms, equipment, knees, lower legs, crop, and
  cameras remained stable. The removed ignored cloth did not leave canonical
  holes: the new `skirt_*` body-armour geometry filled the front and rear
  regions, which explains the parts gain without semantic contamination.
- Mechanically, the rail met the belt, plate tops remained seated, thigh roots
  and the crotch were covered, and no detached mesh, inverted normal, or open
  component was visible. Visually, five repeated slabs dominated front/back as
  pouches or Roman pteruges; diagonals exposed piano-key/petal repetition and
  zipper seams; profiles turned the rail into a projecting second belt,
  tutu/lampshade shelf. Alternating bottoms formed a saw hem. Those are explicit
  production-gate failures even independent of the numeric rejection.

## Protocol reflection

- The experiment answered a useful causal question: replacing ignored cloth
  with published rigid geometry can improve parts and eliminate the unfinished
  holes seen in 0031, but semantic closure alone is insufficient. Twelve radial
  panels around a continuous rail impose a repetitive costume vocabulary and a
  damaging profile silhouette.
- The strong disagreement between improved DreamSim/parts and regressed
  LPIPS/silhouette matches the visual evidence: the model gained rigid coverage
  while losing coherent anatomy and articulation. No metric term justifies
  retaining the construction partially.
- Close this exact common-rail radial-panel construction. Do not tune panel
  count, stagger, width, rail radius, or palette nearby; a future lower-waist
  replacement would need a materially different authored overlapping shell.

## Next question

Test a different region with a new construction; do not use another radial
panel skirt, cloth-only deletion, or fauld-box variant.

---

# 0068: Replace spherical pauldrons with continuous plate shells

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: accepted experiment 0032 removed six toy-like shoulder hoops but
  retained each compact pauldron as one smooth UV ellipsoid. Those plain balls
  remain visible in nearly every view. Experiment 0027's three separate
  flattened ellipsoids were near-neutral and failed as pancakes/beads; it left
  open a single continuous authored shell. This experiment does not restore
  hoops or layers and does not change arm paths, materials, or rivets.
- Hypothesis: replacing only the two pauldron ellipsoids with closed,
  flat-shaded, three-depth-section steel shells will preserve compact shoulder
  coverage and seated rivets while converting the spherical highlight and
  contour into one forged plate cap, improving broad upper-body perceptual and
  body-armour agreement.
- Change boundary: add exactly this helper after `prism`:
  ```py
  def pauldron_shell(name, shoulder, side_sign, used_material, root):
      shoulder = Vector(shoulder)
      outline = ((-0.125, -0.075), (-0.135, 0.035),
                 (-0.085, 0.105), (0.015, 0.120),
                 (0.105, 0.085), (0.160, 0.015),
                 (0.135, -0.085), (0.035, -0.115))
      profile = tuple(reversed(outline)) if side_sign > 0 else outline
      sections = ((-0.145, 0.88), (-0.025, 1.00), (0.110, 0.82))
      vertices = []
      for y_offset, scale in sections:
          for outward, height in profile:
              vertices.append((shoulder.x + side_sign * outward * scale,
                               shoulder.y + y_offset,
                               shoulder.z + height * scale))
      count = len(profile)
      faces = [tuple(range(count)),
               tuple(reversed(range(2 * count, 3 * count)))]
      for section in range(2):
          start = section * count
          following_section = start + count
          for index in range(count):
              following = (index + 1) % count
              faces.append((start + index,
                            following_section + index,
                            following_section + following,
                            start + following))
      mesh = bpy.data.meshes.new(name + "_mesh")
      mesh.from_pydata(vertices, [], faces)
      mesh.update()
      obj = bpy.data.objects.new(name, mesh)
      bpy.context.scene.collection.objects.link(obj)
      return finish(obj, name, used_material, root, 0.010)
  ```
  Inside unchanged `arm_points`, replace only
  `sphere(side + "_pauldron", shoulder, (0.16, 0.145, 0.12), steel,
  root)` with
  `pauldron_shell(side + "_pauldron", shoulder,
  -1 if side == "left" else 1, steel, root)`. Keep all shoulder, elbow,
  and hand points; upper arms, vambraces, gauntlets; all four pauldron rivet
  centers/scales/materials/names; torso, gorget, head, sword, shield, helpers and
  other callers, landmarks, cameras, lights, references, annotations, renderer,
  exporter, and metric fixed. Do not add layers, seams, ridges, hoops, trim, or
  fasteners. The outline, mirrored winding, three Y sections/scales, flat faces,
  and `.010` bevel are one indivisible continuous-shell construction.
- Geometry/control: the source outline is clockwise. Mirroring X supplies the
  left shell's required winding; reversing only the right profile makes both
  front caps face world negative Y, rear caps positive Y, and the side quads
  outward. Each shell is one closed 24-vertex, 18-face manifold. Relative Y is
  `-.145..+.110`, so world Y becomes `-.135..+.120` rather than the sphere's
  `-.135..+.155`. X remains at the accepted outer `+/-.540` subject positions,
  while the inner edge retreats 25 mm to `+/-.245`; Z is `1.265..1.500` rather
  than `1.260..1.500`. The unchanged rivet centers lie on the front cap at
  Y `-.135` and their `.010` Y radii half-embed; their X/Z centers remain safely
  inside the front polygon. The shoulder anchor remains enclosed and the shell
  overlaps both torso and proximal upper arm. Nonplanar connecting quads and
  their deterministic export triangulation are part of the candidate.
- Expected movement: front, back, and four diagonals should lead through
  DreamSim and LPIPS as ball highlights become broad plate transitions.
  Profiles may move asymmetrically through equipment occlusion. Body-armour
  parts and silhouette may move modestly around the changed shoulder contours;
  palette/texture may move through normals despite fixed materials. Raw arm and
  equipment landmarks stay fixed; canonical movement must localize to shoulders.
  This is a continuous three-depth-section shell, not three armour layers.
- Reject if: aggregate improvement is less than `0.001`; the mean of front,
  back, and four diagonals improves less than `0.001`; front or back regresses
  more than `0.001`; either DreamSim or LPIPS regresses; mean parts or silhouette
  regresses more than `0.003` without a larger coherent neural gain; either
  profile regresses more than `0.004`; any raw arm/equipment landmark, shoulder
  point, rivet center, or unchanged bound moves, or canonical movement is
  unexplained; a rivet floats, tunnels, straddles the rim, becomes asymmetric,
  or loses readable seating; a shell opens an upper-arm/torso gap, clips the
  gorget/head/torso/arm, exposes a cap seam, reverses winding, becomes
  nonmanifold, or breaks bevel normals; shoulder coverage is lost; the result
  reads as a box, robot block, badge, shield, wing, fin, roof tile, football pad,
  saddle, folded paper, gemstone, octagonal balloon, die, faceted loaf, low-poly
  placeholder, or another smooth ball rather than forged armour; the broad
  front cap becomes a billboard; depth sections form visible bands, stepped
  slices, lids, or a pinched waist; triangulated quads create incoherent diagonal
  facets; rear truncation is abrupt; bevels balloon/collapse; publication or GLB
  validation changes; or movement cannot be attributed to the complete shells.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6714725822538408`
- Absolute delta: `-0.002605803865735501`
- Relative delta: `-0.3865728301493609%`
- Baseline report SHA-256: `9ef28f8b52bff4b211ac239da93da59c047cfc5dc51a34b250f562061e24ecc2`
- Candidate report SHA-256: `b52458c405dfcf2b5d705b6474a99ab2817cf592076e3cf5b4fbceaebd360a47`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: reject despite the aggregate improvement. The registered six-view
  shoulder-exposed mean improved only `0.0002405753`, below the `0.001` gate,
  and the clean geometry triggered the explicit plaque, miniature-shield,
  football-pad, faceted-loaf, low-poly, stepped-section, and abrupt-rear-cap
  visual rejection clauses.

## Diagnostics and visual review

- Component deltas (candidate minus baseline): DreamSim
  `-0.007038086652755737`, landmarks `-0.00024486776602853055`, LPIPS
  `-0.004890508949756622`, palette/texture `-0.0009198414523488015`, parts
  `-0.0001687283225192695`, and silhouette `-0.0005030011241325829`. All six
  aggregate components improved.
- View deltas: back `-0.004241663435519264`, back-left
  `+0.004661113140957849`, back-right `-0.0004700833316603006`, front
  `-0.001982381613215796`, front-left `+0.002837181575240106`, front-right
  `-0.0022476183066327105`, left `-0.005143864821285438`, and right
  `-0.010758001936863207`. The registered front/back/four-diagonal mean was
  only `-0.00024057532880501938`; front-three was `-0.00046427278153613345`,
  rear-three `-0.00001687787540723847`, diagonal-four
  `+0.001195148269476236`, and profiles `-0.007950933379074323`.
- All eight beauties and overlays were inspected at full resolution. Changes
  localized cleanly to shoulder contours and immediate occlusion; raw landmark
  files were identical and head, lower torso, legs, tabards, sword, shield,
  cameras, and framing were stable. The tiny canonical-landmark gain came from
  changed shoulder foreground bounds, not moved anchors.
- Mechanical review passed: both shells were closed and consistently wound,
  rivets stayed half-seated, torso and upper-arm coverage remained closed,
  mirroring was coherent, and no cap hole, triangulation crack, bevel defect, or
  equipment collision appeared. Production vocabulary failed in every exposed
  family. Front/front-right showed broad octagonal plaques with two rivets like
  miniature shields; front-left/back-left exposed hard polygonal blocks; back
  showed paired blank octagonal end caps; profiles showed thick rectangular
  epaulettes/football pads with three horizontal depth bands.

## Protocol reflection

- The score confirms a useful directional clue: reducing rear shoulder depth
  and replacing spherical highlights can materially improve both neural terms,
  especially in profiles. It does not validate this flat three-section loft.
- Strong aggregate and component gains cannot override the preregistered
  six-view exposure gate or a clear low-poly costume failure. Because geometry,
  masks, rivets, and contacts were clean, the failure is specifically the shell
  surface language rather than construction contamination.
- Close this exact continuous three-depth-section pauldron topology. Do not tune
  outline points, scales, rear depth, bevel, or rivet placement nearby. Any
  future shoulder rebuild must be materially curved/tapered, not another flat
  extrusion, stacked primitive, hoop, or attached tile.

## Next question

Choose a new region and causal construction while retaining the directional
evidence that narrower rear shoulder mass helps profiles.

---

# 0069: Replace paired arm cylinders with continuous bent shells

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: the accepted arms use separate constant-radius upper-arm and
  vambrace cylinders with a bare cap seam at each elbow. Experiments 0059 and
  0065 both found strong broad leverage from tapered arms, but their attached
  spherical and flat plate cops failed as beads, badges, or fins. Their common
  unresolved question is whether the elbow can be integrated into one
  continuous shell with no separate joint primitive or internal cap.
- Hypothesis: replacing each upper-arm/vambrace pair with one smooth watertight
  five-ring shell through the unchanged shoulder, elbow, and hand anchors will
  retain the demonstrated taper and rear-silhouette gains while making the
  elbow a restrained continuous swell rather than an attached object.
- Change boundary: add exactly this helper after `segment`:
  ```py
  def bent_arm_shell(name, shoulder, elbow, hand, upper_material,
                     lower_material, root, segments=24):
      shoulder = Vector(shoulder)
      elbow = Vector(elbow)
      hand = Vector(hand)
      centers = (shoulder,
                 shoulder.lerp(elbow, 0.62),
                 elbow,
                 elbow.lerp(hand, 0.38),
                 hand)
      radii = (0.125, 0.105, 0.115, 0.112, 0.095)
      tangents = []
      for index in range(len(centers)):
          if index == 0:
              tangent = (centers[1] - centers[0]).normalized()
          elif index == len(centers) - 1:
              tangent = (centers[-1] - centers[-2]).normalized()
          else:
              tangent = (centers[index + 1] - centers[index - 1]).normalized()
          tangents.append(tangent)

      vertices = []
      previous_tangent = None
      previous_axis_x = None
      for center, radius, tangent in zip(centers, radii, tangents):
          if previous_tangent is None:
              axis_x = tangent.cross(Vector((0, 1, 0))).normalized()
          else:
              rotation = previous_tangent.rotation_difference(tangent)
              axis_x = rotation @ previous_axis_x
              axis_x = (axis_x - tangent * axis_x.dot(tangent)).normalized()
          axis_y = tangent.cross(axis_x).normalized()
          for sample in range(segments):
              angle = 2 * math.pi * sample / segments
              point = center + radius * (axis_x * math.cos(angle)
                                         + axis_y * math.sin(angle))
              vertices.append(tuple(point))
          previous_tangent = tangent
          previous_axis_x = axis_x

      faces = [tuple(reversed(range(segments))),
               tuple(range(4 * segments, 5 * segments))]
      for ring in range(4):
          for sample in range(segments):
              following = (sample + 1) % segments
              faces.append((ring * segments + sample,
                            ring * segments + following,
                            (ring + 1) * segments + following,
                            (ring + 1) * segments + sample))
      mesh = bpy.data.meshes.new(name + "_mesh")
      mesh.from_pydata(vertices, [], faces)
      mesh.update()
      obj = bpy.data.objects.new(name, mesh)
      bpy.context.scene.collection.objects.link(obj)
      obj = finish(obj, name, upper_material, root, 0.0, True)
      obj.data.materials.append(lower_material)
      obj.data.polygons[1].material_index = 1
      for ring in range(2, 4):
          first_face = 2 + ring * segments
          for face in obj.data.polygons[first_face:first_face + segments]:
              face.material_index = 1
      return obj
  ```
  In the unchanged `arm_points` loop, replace only the two calls that create
  `side + "_upper_arm"` and `side + "_vambrace"` with
  `bent_arm_shell(side + "_arm_shell", shoulder, elbow, hand, black, steel,
  root)`. Keep all arm points, pauldrons/rivets, gauntlets, sword/shield and
  contacts, materials, every other helper/caller/object, landmarks, cameras,
  lights, references, annotations, renderer, exporter, and metric fixed. Do not
  add a cop, cuff, seam object, modifier, or bevel. The five centers/radii,
  transported frames, 24-sided smooth shell, and two material bands form one
  indivisible construction.
- Construction/control: the transported frame rotates the first ring basis by
  the minimum tangent-to-tangent rotation and reprojects it, preventing the
  12–16 degree phase drift found in the independent-frame draft. The ring basis
  has `axis_x x axis_y = tangent`, so the reversed shoulder cap, forward hand
  cap, and side quads wind outward. The shell has 120 vertices and 98 faces.
  Polygon insertion order assigns the first two longitudinal bands black and
  the last two plus buried hand cap steel; the material boundary is the shared
  elbow ring. There is no internal elbow cap. Shoulder radius `.125` and hand
  radius `.095` stay buried inside the accepted pauldron and gauntlet. The
  `.105 -> .115 -> .112` profile is one subtle elbow swell, not a separate cop.
- Expected movement: back, back-left, back-right, left, and right should lead
  through DreamSim, LPIPS, body-armour parts, and silhouette; the registered
  exposed-arm five-view mean should improve decisively. Front and front
  diagonals may remain asymmetric through equipment occlusion but must stay
  bounded. Palette may move slightly because the black/steel boundary and
  curved highlights move. Raw shoulder/hand/equipment landmarks stay fixed;
  canonical movement must localize to the arm contours.
- Reject if: aggregate improvement is less than `0.001`; exposed-arm five-view
  mean improves less than `0.002`; rear-three mean improves less than `0.0015`;
  either DreamSim or LPIPS regresses; front-three mean regresses more than
  `0.0015`; either profile regresses more than `0.001`; parts or silhouette
  regresses more than `0.003` without larger coherent neural gain; any raw
  anchor/equipment landmark moves or canonical movement is unexplained; a shell
  opens a shoulder/wrist gap, exposes a cap crescent, clips or tunnels into the
  pauldron, gauntlet, torso, sword, or shield, changes equipment order/contact,
  reverses winding, self-intersects, becomes nonmanifold, or fails export;
  frames corkscrew, pinwheel, crease, or form diagonal highlight facets; the
  elbow balloons, beads, pinches, kinks, collapses, or disappears; the material
  transition reads as a painted stripe or transverse rubber band; the whole arm
  reads as a hose, noodle, sausage, rubber sleeve, bodysuit limb, muscular tube,
  or smooth unarmoured anatomy rather than integrated armour; 24-sided faceting
  is visible; left/right bends become incoherent; semantic publication changes;
  or movement cannot be attributed to the complete continuous shell.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6736308629897962`
- Absolute delta: `-0.0004475231297800253`
- Relative delta: `-0.0663904%`
- Baseline report SHA-256: `593423cad43a876552cafbc69f7f016eed93242d5e0856ee6f79855acde84425`
- Candidate report SHA-256: `1ccf928a64eb7c3dc7924dd38bbbb01b83f1ab7f11714c00ab203ce2a2b6612e`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: reject. The aggregate gain was below the `0.001` margin;
  DreamSim, the exposed-arm five-view mean, rear-three mean, and left-profile
  gates failed. The technically clean continuous shells also triggered the
  explicit hose, rubber-sleeve, muscular-tube, soft-elbow, and painted material
  band rejection clauses.

## Diagnostics and visual review

- Component deltas (candidate minus baseline): DreamSim
  `+0.006317064166069031`, landmarks `+0.0004188225081274144`, LPIPS
  `-0.007541365921497345`, palette/texture `+0.0019818187128895492`, parts
  `-0.0007712712877310235`, and silhouette `-0.00015335356052803562`.
  LPIPS, parts, and silhouette improved, but DreamSim materially regressed.
- View deltas: back `-0.003430471382721123`, back-left
  `+0.002540577550464107`, back-right `+0.006437443099132745`, front
  `-0.002482240634873678`, front-left `+0.002898005591978836`, front-right
  `+0.00019139429665759877`, left `+0.0019466009047314214`, and right
  `-0.003726965789100034`. Exposed-arm five was
  `+0.0007534368765014232`, rear-three `+0.0018491830889585763`, front-three
  `+0.00020238641792091894`, profiles `-0.0008901824421843063`, and
  diagonal-four `+0.0030168551345583217`.
- All eight beauties and overlays were reviewed at full resolution. Movement
  localized cleanly to arm contours, their material boundary, and immediate
  torso/equipment occlusion. Raw landmark JSON was byte-identical; the canonical
  landmark regression came from changed arm foreground. Head, torso core, legs,
  tabards, shield/sword geometry, framing, and semantic publication stayed
  invariant.
- Construction gates passed: transported frames showed no corkscrew or
  pinwheel; no 24-sided faceting, cap hole, shoulder/wrist gap, collision,
  winding error, or bilateral mismatch was visible. Production gates failed in
  every exposed view. Arms read as glossy organic hoses or muscular sleeves;
  elbow articulation dissolved into a soft/pointed bend; the black-to-steel
  transition was an almost invisible painted stripe rather than a cuff or joint.
  Several views exposed a ragged circular wrist termination against the round
  gauntlet, while back made both arms bowed and ape-like.

## Protocol reflection

- The rotation-minimizing frame correction successfully removed the twist
  confound. The rejection therefore tests the intended continuous-shell
  vocabulary rather than a constructor artifact.
- Experiments 0059 and 0065 established that tapering has leverage but separate
  cops fail; 0069 removed the separate cop and internal cap yet still failed
  broad metrics and armour readability. Smooth circular ring lofts are not a
  viable shortcut to articulated arms.
- Close this continuous circular arm-shell construction without tuning ring
  radii, interpolation fractions, segment count, or material boundary. Retire
  the queued gauntlet and lower-leg variants sharing smooth ring-shell
  vocabulary. Do not generalize to all authored meshes: a future arm rebuild
  would require plate-specific noncircular or explicitly overlapping structure
  after intervening regions.

## Next question

Test the front breastplate's shallow convexity as a new isolated region; do not
continue smooth limb-loft work.

---

# 0070: Give the flat breastplate a shallow smooth dome

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: the accepted tapered breastplate outline from experiment 0021
  remains one flat front slab, reading more like a shield/card over the torso
  than shallow forged chest armour. This experiment changes only its front
  surface; it does not reopen the accepted outline, cuirass mass, ridge lines,
  strap, material, or rear face.
- Hypothesis: advancing only the center of the breastplate front by `0.007` and
  smoothing its seven-triangle fan will create a restrained continuous convex
  highlight, improving front-visible neural similarity while preserving the
  exact outline, overlay depth order, rear surface, and geometric diagnostics.
- Change boundary: add exactly this helper after `prism`:
  ```py
  def domed_prism(name, points, depth, center, bulge,
                  used_material, root):
      front_y = -depth / 2
      back_y = depth / 2
      count = len(points)
      vertices = ([(x, front_y, z) for x, z in points]
                  + [(x, back_y, z) for x, z in points]
                  + [(center[0], front_y - bulge, center[1])])
      front_center = 2 * count
      faces = []
      for index in range(count):
          following = (index + 1) % count
          faces.append((front_center, following, index))
      faces.append(tuple(range(count, 2 * count)))
      for index in range(count):
          following = (index + 1) % count
          faces.append((index, following,
                        count + following, count + index))
      mesh = bpy.data.meshes.new(name + "_mesh")
      mesh.from_pydata(vertices, [], faces)
      mesh.update()
      obj = bpy.data.objects.new(name, mesh)
      bpy.context.scene.collection.objects.link(obj)
      obj = finish(obj, name, used_material, root, 0.0)
      for polygon in obj.data.polygons[:count]:
          polygon.use_smooth = True
      modifier = obj.modifiers.new(name + "_soft_edges", "BEVEL")
      modifier.width = 0.025
      modifier.segments = 3
      modifier.limit_method = "ANGLE"
      modifier.angle_limit = math.radians(30)
      return obj
  ```
  Replace only the accepted `prism("breastplate", ...)` call with
  `domed_prism("breastplate", ...)`, using the byte-identical seven points,
  depth `0.075`, `center=(0, 1.235)`, `bulge=0.007`, `steel`, and `root`, then
  retain the unchanged `.location.y = -0.215`. Keep the cuirass mass,
  `breastplate_shadow`, all four ridges, cross-body strap/rivets, gorget, every
  other object/material/helper/caller, landmarks, cameras, lights, references,
  annotations, renderer, exporter, and metric fixed. The center fan, 7 mm bulge,
  front smoothing, and angle-limited accepted-width perimeter bevel are one
  indivisible front-curvature construction.
- Geometry/control: the seven-point order makes the direct back polygon face
  positive Y; each front triangle `(center, following, index)` faces negative Y
  and the side quads wind outward. The mesh is a closed 15-vertex, 15-face solid.
  X/Z outline and the rear face remain exact. World perimeter front stays
  Y `-.2525`; the center reaches only `-.2595`. Near Z `1.20`, the interpolated
  surface remains about 1.4 mm behind the shadow's rear surface, and the strap
  and all ridges remain clearly in front. The 30-degree bevel limit preserves
  the accepted 25 mm perimeter bevel while excluding the shallow internal fan
  spokes. Only the seven front triangles are smooth; rear and sides stay flat.
- Expected movement: front, front-left, and front-right should lead through
  DreamSim, LPIPS, and highlight response. Profiles should change little and
  the rear three should be effectively invariant. Parts, silhouette, raw
  landmarks, and canonical crop/bounds should remain fixed; palette/texture may
  move slightly with the changed front highlight.
- Reject if: aggregate improvement is less than `0.001`; front-three mean
  improves less than `0.001`; either DreamSim or LPIPS regresses; absolute
  rear-three mean movement exceeds `0.0003`; absolute parts or silhouette
  movement exceeds `0.001`; any raw landmark or canonical bound moves; the
  `breastplate_shadow` shortens, disappears, or breaks; any ridge clips, floats
  at an inconsistent depth, or changes order; the strap tunnels, floats, or is
  swallowed; the center reads as a nipple, navel, tent, pyramid, gemstone, fan,
  or badge; radial pinwheel/star shading, internal triangle spokes, a center
  normal pinch, wavy normals, or a perimeter normal seam appears; the outline
  becomes a razor/cardboard rim; the angle-limited bevel touches internal
  spokes, changes accepted perimeter width, or fails export; winding,
  manifoldness, publication, or GLB validation changes; the effect is
  imperceptible; or movement cannot be attributed to the shallow front dome.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.674218809139035`
- Absolute delta: `+0.00014042301945871305`
- Relative delta: `+0.0208319%`
- Baseline report SHA-256: `03ebef706288b25e935a81f9ec8e0e71ffc573e4cd37f6c76f5f65f74d6c319a`
- Candidate report SHA-256: `b49f09ed0174ce156ae355050d5eda284ad9e7972c31c5cd76381fcfd5576d42`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: reject. Aggregate distance and DreamSim regressed, direct front and
  front-right worsened, and the registered front-three mean regressed instead
  of improving `0.001`. The clean construction did not produce a coherent
  enough signal to clear the experiment margin.

## Diagnostics and visual review

- Component deltas (candidate minus baseline): DreamSim
  `+0.0010044127702713013`, landmarks `0`, LPIPS
  `-0.0004111826419830322`, palette/texture `+0.00011402876843596976`, parts
  `+0.00003912834889607808`, silhouette `-0.000000631908859405339`.
- View deltas: front `+0.00337747310392722`, front-left
  `-0.003752826240540297`, front-right `+0.0014959987282028298`, back
  `+0.000019223461379502815`, back-left `-0.000017832306362652872`, back-right
  `-0.00010136293283247166`, left `-0.00007187567692423791`, and right
  `+0.0004977848403638907`. Front-three was `+0.0003735485305299176`,
  rear-three `-0.000033323925938540576`, and profiles
  `+0.0002129545817198264`.
- All eight beauties and overlays were reviewed against baseline. Raw and
  canonical landmark JSON was byte-identical; parts, silhouette, crop, and
  authored bounds stayed fixed. Rear views were visually invariant and all
  movement localized to front-face shading.
- Construction and production safety passed: the shadow bar remained complete;
  all four ridges and the strap retained coherent depth order; the accepted
  perimeter bevel remained readable; no fan spokes, star, nipple, apex, pinched
  normal, cardboard rim, tunnel, z-fight, rear leak, winding, or publication
  defect appeared. The front dome was restrained and visually clean, but subtle
  at gallery scale. Direct front and front-right moved the wrong way while only
  front-left improved, matching the neural disagreement.

## Protocol reflection

- The corrected 7 mm dome isolated front curvature successfully without
  disturbing overlays or classical geometry. Its null/regressive result is
  therefore meaningful rather than contaminated.
- The safe amplitude is too weak or view-dependent to create useful forged
  curvature. The originally proposed larger dome is not a valid nearby option
  because it analytically swallows the shadow and tunnels into the strap.
- Close shallow center-fan breastplate doming without tuning center, bulge,
  smoothing, or bevel. Any future breastplate form change would need a complete
  authored plate-and-overlay assembly, not another center-fan adjustment.

## Next question

Test a forearm-aligned asymmetric gauntlet plate as a new hand-form question;
do not continue breastplate doming.

---

# 0071: Replace spherical gauntlets with forearm-aligned plates

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: both accepted gauntlets remain bright UV ellipsoids. Experiment
  0037 showed the bright material is necessary, while 0063's same-envelope,
  axis-aligned rounded blocks failed as robot cuffs and oven mitts. The remaining
  single-solid discriminator is a smaller asymmetric palm/knuckle plate aligned
  to the forearm rather than the world axes.
- Hypothesis: replacing each spherical gauntlet with one mirrored, forearm-
  aligned, asymmetric beveled plate will preserve bright hand separation and
  wrist/shield overlap while converting the toy-ball highlight into a compact
  plated-hand contour, improving hand-exposed neural similarity.
- Change boundary: add exactly this helper after `prism`:
  ```py
  def gauntlet_plate(name, elbow, hand, side_sign, used_material, root):
      elbow = Vector(elbow)
      hand = Vector(hand)
      forward = (hand - elbow).normalized()
      across = side_sign * forward.cross(Vector((0, 1, 0))).normalized()
      normal = forward.cross(across).normalized()
      outline = ((-0.070, -0.070), (0.070, -0.070),
                 (0.085, 0.020), (0.065, 0.085),
                 (0.020, 0.095), (-0.025, 0.088),
                 (-0.075, 0.070), (-0.090, 0.000))
      half_depth = 0.055
      vertices = []
      for depth_offset in (-half_depth, half_depth):
          for width, length in outline:
              vertices.append(tuple(hand + across * width + forward * length
                                    + normal * depth_offset))
      count = len(outline)
      faces = [tuple(range(count)),
               tuple(reversed(range(count, 2 * count)))]
      for index in range(count):
          following = (index + 1) % count
          faces.append((index, count + index,
                        count + following, following))
      mesh = bpy.data.meshes.new(name + "_mesh")
      mesh.from_pydata(vertices, [], faces)
      mesh.update()
      obj = bpy.data.objects.new(name, mesh)
      bpy.context.scene.collection.objects.link(obj)
      return finish(obj, name, used_material, root, 0.006)
  ```
  Replace only `sphere(side + "_gauntlet", hand, (0.11, 0.10, 0.13),
  bright, root)` with `gauntlet_plate(side + "_gauntlet", elbow, hand,
  -1 if side == "left" else 1, bright, root)`. Keep arm points, upper arms,
  vambraces, pauldrons/rivets, sword/shield geometry and pose, bright material,
  every other object/helper/caller, landmarks, cameras, lights, references,
  annotations, renderer, exporter, and metric fixed. Do not add a palm core,
  fingers, cuff, seams, rotation offset, or equipment correction. The mirrored
  outline, forearm frame, `.110` total depth, and `.006` bevel form one
  indivisible final single-solid gauntlet test.
- Construction/control: in the local basis, `across x forward = -normal`; the
  outline is counter-clockwise in width/length, so the negative-depth face,
  reversed positive-depth face, and side quads wind outward. Each plate is a
  closed 16-vertex, 10-face manifold. `side_sign` makes the asymmetric outline
  bilateral. Approximate bounds are left X `-.57479..-.39884`, Y
  `-.20451..-.04415`, Z `.72065.. .91966`; right X `.40918.. .58518`, Y
  `-.28166..-.10951`, Z `.68979.. .88964`. These are intentionally smaller
  than the accepted spheres, not same-envelope. The proximal 70 mm intersects
  the radius-.12 vambrace; the right plate still overlaps the shield body. The
  already-separated left sword grip gains about 15 mm more depth gap, which is
  registered and may not become visually more legible.
- Expected movement: front, front-left, front-right, left, and right should lead
  through DreamSim, LPIPS, body-armour parts, and local silhouette. Rear views
  may move less. Palette may move through flatter highlights despite fixed
  material. Raw hand/equipment landmarks stay fixed; canonical movement must
  localize to changed hand contours.
- Reject if: aggregate improvement is less than `0.001`; the exposed five-view
  mean improves less than `0.001`; either DreamSim or LPIPS regresses;
  rear-three mean regresses more than `0.001`; parts or silhouette regresses
  more than `0.003` without a larger coherent neural gain; any raw landmark or
  equipment anchor moves, canonical movement is unexplained, or bilateral
  chirality differs; a wrist gap opens, the vambrace cap forms a visible annulus
  or protrudes through the plate, the right plate loses shield overlap, shield
  depth order changes, or the existing left sword-grip gap becomes more
  conspicuous; either plate clips torso/equipment or becomes buried; the result
  reads as a cube, die, oven mitt, robot cuff, soap bar, badge, shield-on-wrist,
  paddle, shovel, luggage, or flat lid rather than hand armour; edges are razor
  sharp, bevels pinch/balloon, winding/manifoldness/normals fail, publication or
  GLB validation changes; or movement cannot be attributed to the paired
  forearm-aligned plates. On rejection, close all single-solid gauntlet forms;
  do not tune width, length, depth, bevel, or offsets nearby.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6732882233220076`
- Absolute delta: `-0.0007901627975687164`
- Relative delta: `-0.1172212%`
- Baseline report SHA-256: `7b4fe6bc74a8a202dbeca29da08792138d1dfd235ea139e7e2d426abe344cc42`
- Candidate report SHA-256: `07906604e7dd458772d56992fe6ad963ca8ce9a18a439a93b222701f80bdf904`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: reject. The candidate improves, but misses the registered `0.001`
  aggregate margin by about `0.000210`. Both neural means and the exposed-view
  mean improve, yet the plates trigger the explicit paddle/cuff and more-visible
  sword-gap gates. Restore the accepted 0032 source without partial retention.

## Diagnostics and visual review

DreamSim improves `-0.003544539213180542`, LPIPS
`-0.0009595602750778198`, parts `-0.0006607585623894519`; palette regresses
`+0.00010304647403019951`, silhouette `+0.0003402862481838853`, and landmarks
remain exactly fixed. View deltas are back `-0.00048557634917034687`,
back-left `+0.001346327015392057`, back-right `-0.0009946820784872967`, front
`-0.0003738829581294567`, front-left `-0.000948361871841108`, front-right
`-0.0025661393634991425`, left `-0.0018165301870513018`, and right
`-0.0012946871168248997`. The exposed-five mean is
`-0.0013999202994691817`; rear-three is `-0.00004464380408852886`.

All eight beauties and overlays were inspected at full resolution. Movement is
cleanly localized to the hands and immediate equipment occlusion. Raw and
canonical landmark files are byte-identical; bilateral construction, wrist
closure, shield overlap, semantic publication, and mesh integrity are sound.
The production read nevertheless fails: broad vambraces terminate in small flat
tabs or scalloped nubs, the bright fist mass disappears, and the sword grip looks
more conspicuously unsupported. The shield-side plate is mostly hidden or reads
as an unrelated sliver. These are the preregistered paddle, flat-lid, cuff, and
sword-gap failures, not renderer noise.

## Protocol reflection

0063 showed that a same-envelope rounded monolith becomes an oven mitt; 0071
shows that a smaller aligned monolith becomes a disappearing cuff or paddle.
The useful directional clue is that reducing spherical hand mass improves both
neural means and the exposed views. It is not sufficient evidence for a
production hand. Close all single-solid gauntlet replacements. Any future hand
rebuild must use a palm plus overlapping knuckle/finger plates and must repair
physical weapon contact as one preregistered assembly.

## Next question

Can a low, staggered four-sector gorget replace the bright torus with readable
collar plates without repeating the rejected high funnel or creating petal,
pouch, crown, or overlap artifacts?

---

# 0072: Add attached anatomical ears

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: the accepted narrowed head assembly from 0025 has no ears,
  leaving the face/hair transition as an uninterrupted ellipsoid in front
  diagonals and profiles. No prior experiment has tested ear geometry; prior
  head work changed complete width/depth or hair, so this is a new localized
  facial-silhouette question.
- Hypothesis: two small skin ellipsoids half-seated into the accepted head at
  ear height will improve the adult head silhouette and front/profile neural
  and head-part similarity without reopening cranium scale, hair, face
  placement, or landmarks.
- Change boundary: immediately after the unchanged accepted `head` sphere, add
  only:
  ```py
  sphere("head_ear_left", (-.118, -.025, 1.650),
         (.018, .030, .045), skin, root, 20)
  sphere("head_ear_right", (.118, -.025, 1.650),
         (.018, .030, .045), skin, root, 20)
  ```
  Extend only the dependent `part_group` head branch with
  `or name.startswith("head_ear_")`, so both new skin meshes publish as
  `head_hair`. Keep the accepted head, nose/eyes/beard, hair shell/tufts,
  crown/chin and every other landmark, object, material, helper, camera, light,
  reference, renderer, exporter, and metric fixed. The paired geometry and
  required semantic routing are one indivisible addition.
- Construction/control: each ear center lies just inside the accepted head
  surface. Each 36 mm-wide ear buries about 18.7 mm and exposes about 17.3 mm,
  producing a robust half-seated join. Ear bounds are X `-.136..-.100` and
  `.100.. .136`, Y `-.055.. .005`, Z `1.605..1.695`; cranium, crown/chin, and
  overall shield-dominated bounds remain fixed. Ears clear eyes, nose, beard,
  gorget, and crown tufts; posterior edges intentionally tuck partly beneath
  hair. Existing sphere construction exports safely. The routing change is a
  mandatory publication dependency, not a metric change.
- Expected movement: front, front-left, front-right, left, and right should lead
  through DreamSim, LPIPS, `head_hair` parts, and local silhouette. Rear views
  should move less because hair buries the ears. Palette may move slightly from
  added skin pixels. Raw landmarks stay fixed; canonical movement may occur only
  at paired ear contours.
- Reject if: aggregate improvement is less than `0.001`; exposed-five mean
  `(front,front_left,front_right,left,right)` improves less than `0.001`; either
  DreamSim or LPIPS regresses; front regresses more than `0.001`; rear-three
  mean regresses more than `0.001`; head-hair parts or silhouette regresses more
  than `0.003` without a larger coherent neural gain; raw landmark JSON changes
  or canonical movement is unexplained; ears publish as body armour; either ear
  detaches, opens a seam, becomes fully buried, clips an eye/beard/tuft, creates
  a black hair/root crescent or scalp gap, or differs bilaterally; both ears show
  conspicuously through rear hair; local head width becomes childlike or comic;
  either reads as a bead, button, coin, bolt, stud, handle, horn, antenna,
  mouse/monkey/elf ear, earmuff, or smooth skin bubble rather than a restrained
  human ear; countable primitive highlights dominate; bevel, normals, GLB, or
  publication fail; or movement cannot be attributed to the paired ears. On
  rejection close primitive ellipsoid ears and do not tune nearby.

## Result

- Baseline distance: `0.6740783727964181`
- Candidate distance: `0.6719273240511668`
- Absolute delta: `-0.002151048745251294`
- Relative delta: `-0.3191096%`
- Baseline report SHA-256: `7e830de260cb0bb7ef338d4753b9716d0c5432b729ae6cc66b0d94ba35cb73c4`
- Candidate report SHA-256: `09da04fc6e2e43040235f65f39b96492cd2853a0428c454811eb86a794848311`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: reject. The aggregate and both neural means improve strongly, but
  direct front strictly exceeds its registered regression bound and the ears
  trigger several independent production hard gates. Restore accepted 0032
  without partial retention.

## Diagnostics and visual review

DreamSim improves `-0.01377442479133606`, LPIPS
`-0.0010607391595840454`, palette/texture `-0.000578510029360213`, and
silhouette `-0.0001840501474010825`; parts regresses only
`+0.0001760356321269807`, while landmarks remain exact. View deltas are back
`+0.0001306380148249353`, back-left `-0.0022500556279768658`, back-right
`-0.002000861700245826`, front `+0.0010125347966836173`, front-left
`-0.0010317230828845725`, front-right `-0.005520454799870955`, left
`-0.001891557986703929`, and right `-0.011741407602707699`. Exposed-five mean
is `-0.0038345217350967075` and rear-three `-0.0013734264377992522`. Direct
front nevertheless fails its `+0.001` maximum by `0.0000125348`.

All eight beauties and overlays were inspected at full resolution. Changes are
localized to the paired ear contours; publication is correctly `head_hair`,
raw/canonical landmark files are byte-identical, and there is no unrelated
crop, geometry, or export contamination. Both joins are physically closed and
bilateral. Production still fails decisively: front shows two comic lateral
tabs; diagonals and profiles expose smooth coin/button patches with countable
primitive highlights; direct back exposes paired skin tips; and rear-right
shows hair cutting through an ear as a dark crescent. These trigger the
registered coin/button/monkey/smooth-bubble, rear-visibility, and root-crescent
gates independently of the narrow numeric front failure.

## Protocol reflection

The strong DreamSim, profile, and diagonal response is credible evidence that
the head is missing useful lateral anatomy. It does not validate an ellipsoid
ear. The fixed front bound and production review prevented a score-friendly
primitive from becoming a permanent cartoon cue. Close primitive ellipsoid
ears and do not tune their centers or scales. A future revisit would require an
authored auricle integrated with the hair/head surface.

## Next question

Can a multipart palm plus overlapping knuckle/finger assembly retain 0071's
smaller-hand neural gain while restoring a readable sword grasp and shield-side
contact without moving either equipment item or any hand anchor?

---

# 0073: Replace spherical fists with layered plate gauntlets

Status: rejected
Keep this status until both evidence stages and the complete decision narrative
exist. The decision command changes it to `accepted` or `rejected`.

## Pre-registration

- Observation: 0063's same-envelope rounded blocks became oven mitts. 0071's
  smaller aligned monolith improved both neural means and the exposed-five mean,
  but disappeared into the vambrace as a paddle/cuff and made the existing
  unsupported sword gap more obvious. The remaining primitive-level question is
  whether retained palm volume plus genuinely overlapping backhand plates can
  reduce the bright ball read without becoming fingers, a block, or a flat lid.
- Hypothesis: replacing each bright spherical fist with a compact black
  under-palm and two seated steel dorsal/knuckle plates will preserve wrist and
  shield contact while creating a readable armoured-hand hierarchy, improving
  both neural distances and exposed-hand views without moving any arm or
  equipment anchor.
- Change boundary: add only this helper after `prism`:
  ```py
  def hand_plate(name, origin, forward, across, front, outline,
                 back_depth, front_depth, used_material, root, bevel):
      profile = list(outline)
      if across.cross(forward).dot(front) < 0:
          profile.reverse()
      count = len(profile)
      vertices = []
      for depth in (back_depth, front_depth):
          for width, length in profile:
              vertices.append(tuple(origin + across * width
                                    + forward * length + front * depth))
      faces = [tuple(reversed(range(count))),
               tuple(range(count, count * 2))]
      for index in range(count):
          following = (index + 1) % count
          faces.append((index, following,
                        count + following, count + index))
      mesh = bpy.data.meshes.new(name + "_mesh")
      mesh.from_pydata(vertices, [], faces)
      mesh.update()
      obj = bpy.data.objects.new(name, mesh)
      bpy.context.scene.collection.objects.link(obj)
      return finish(obj, name, used_material, root, bevel)
  ```
  Inside the unchanged `arm_points` loop, replace only the accepted gauntlet
  sphere with:
  ```py
  sphere(side + "_gauntlet", hand, (0.100, 0.090, 0.115), black, root, 24)
  forward = (Vector(hand) - Vector(elbow)).normalized()
  across = forward.cross(Vector((0, 1, 0))).normalized()
  front = forward.cross(across).normalized()
  if front.y > 0:
      front = -front
  dorsal_outline = ((-.070, -.050), (.070, -.050),
                    (.078, .015), (.056, .078),
                    (-.056, .078), (-.078, .015))
  knuckle_outline = ((-.058, .048), (.058, .048),
                     (.064, .076), (.045, .105),
                     (-.045, .105), (-.064, .076))
  hand_origin = Vector(hand)
  hand_plate(side + "_gauntlet_dorsal", hand_origin,
             forward, across, front, dorsal_outline,
             .072, .100, steel, root, .006)
  hand_plate(side + "_gauntlet_knuckle", hand_origin,
             forward, across, front, knuckle_outline,
             .090, .114, steel, root, .005)
  ```
  Keep arm points, pauldrons/rivets, upper arms, vambraces, sword/shield geometry,
  materials and pose, every other object/helper/caller, landmarks, cameras,
  lights, references, annotations, renderer, exporter, and metric fixed. Do not
  add digits, grip wraps, cuffs, seams, fasteners, palm offsets, or equipment
  corrections. The paired black palms, four steel plates, local frames, overlaps,
  and bevels are one indivisible layered-hand construction.
- Construction/control: each palm remains centered on its exact hand anchor,
  stays close to the accepted fist envelope, and remains embedded in the
  radius-.12 vambrace. `front` points toward world negative Y/equipment on both
  arms. The dorsal inner face at `.072` embeds in the palm and its outer face
  reaches `.100`; the knuckle plate spans `.090.. .114`, overlapping the dorsal
  by 10 mm in depth and by 30 mm along the hand. The left outer plate restores
  approximately the accepted fist's camera-forward reach without pretending to
  repair the pre-existing physical sword gap. The right palm/plates overlap the
  shield slab while remaining behind its decorated field. Local handedness is
  corrected by reversing a profile whenever necessary; each plate is a closed
  manifold. Names publish as `body_armour`; standard mesh plus bevel export is
  established.
- Expected movement: front, both front diagonals, and profiles should lead
  through DreamSim, LPIPS, body-armour parts, and local silhouette. Rear views
  may move modestly where hands clear the torso/equipment. Palette may move from
  the black-palm/steel-plate hierarchy. Raw hand/equipment landmarks stay fixed;
  canonical movement must localize to the hands and their equipment occlusion.
- Reject if: aggregate improvement is less than `0.001`; exposed-five mean
  `(front,front_left,front_right,left,right)` improves less than `0.0015`; either
  DreamSim or LPIPS regresses; either profile regresses more than `0.001`;
  rear-three mean regresses more than `0.001`; parts or silhouette regresses more
  than `0.003` without a larger coherent neural gain; any raw anchor moves or
  canonical movement is unexplained; a vambrace cap/annulus appears or wrist
  daylight opens; the palm becomes a ball, mitten, boxing glove, cuff, or stump;
  either plate floats, sinks, z-fights, becomes a badge, paddle, turtle shell,
  mini-shield, flat lid, luggage stack, keyboard, caterpillar, or loose tab; the
  overlap seam disappears or becomes a decorative stripe; the sword gap becomes
  more conspicuous or the hand appears not to grasp it; shield contact is lost,
  the right hand disappears entirely, tunnels through the decorated field, or
  changes shield depth order; left/right construction differs beyond fixed
  equipment occlusion; geometry clips torso/equipment; bevels pinch/balloon,
  winding/manifoldness/normals fail, publication or GLB validation changes; or
  movement cannot be attributed to the complete layered assembly. On rejection
  close primitive/procedural gauntlet reconstruction rather than tuning plate or
  palm literals.

## Result

- Baseline distance: `0.6740783861195763`
- Candidate distance: `0.6743061891017611`
- Absolute delta: `+0.00022780298218483264`
- Relative delta: `+0.0337947%`
- Baseline report SHA-256: `abcae8fa70e79935cb23a7360dd596f973de9e517f48beb6dae59ffc6ca2220d`
- Candidate report SHA-256: `9abcff1143d4f1cd54e32f6b19bf64368e1fcf36768d628fdea14d0cf5c30324`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: reject. Aggregate and DreamSim regress, the exposed-view mean
  regresses, and the layered forms fail the registered stump/tab/equipment-read
  gates. Restore accepted 0032 without partial retention.

## Diagnostics and visual review

DreamSim regresses `+0.002616330981254555`, while LPIPS improves only
`-0.00003062188625346818`; palette/texture improves
`-0.0006170565327376363`, parts `-0.0005946275060642119`, silhouette
`-0.0006294952927894864`, and landmarks remain exact. View deltas are back
`+0.00035938467090557147`, back-left `+0.0005114412578292038`, back-right
`-0.0006050533040518058`, front `+0.0003622664750599913`, front-left
`+0.000004690059247858258`, front-right `+0.0028426718465135448`, left
`-0.0017141108496275814`, and right `-0.0002897508016537209`. Exposed-five
mean regresses `+0.0002411533459080184`; rear-three regresses
`+0.00008859087489432316`.

All eight beauties and overlays were inspected. Movement is localized to hand,
wrist, and immediate equipment occlusion; raw landmarks stay fixed and no
unrelated geometry, crop, semantic, or renderer contamination is visible.
Wrist seating and bilateral construction are mechanically closed. The black
palms nevertheless merge with the vambraces and read as blunt mittens or stumps
from the rear. The two steel layers collapse into tiny square tabs, hooks, or
prongs around the sword and leak below the shield as unrelated hardware. Their
overlap never becomes legible articulation; sword grasp remains unsupported and
the shield-side hand largely disappears. These trigger the registered stump,
mitten, loose-tab, disappearing-hand, and equipment-contact gates.

## Protocol reflection

0063, 0071, and 0073 triangulate the failure: rounded volume becomes an oven
mitt, a smaller monolith becomes a paddle, and layered generator primitives
become a dark stump plus tiny tabs. Favorable classical component movement is
not evidence for a production hand. Close primitive/procedural gauntlet work;
future hands require a genuinely authored modeled/rigged asset rather than more
generator literal tuning.

## Next question

Can assigning only the two accepted upper-arm sleeves a cooler, rougher,
export-safe dark-mail material reduce their glossy tube cue while leaving all
geometry diagnostics exactly invariant?
