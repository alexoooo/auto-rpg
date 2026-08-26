# phase-02 full experiment ledger

This file preserves the complete text of the individual phase-01 records after
their consolidation. Headings are separated by horizontal rules; original source
and evidence hashes remain in each record and in `manifest.json`.

---

# 0074: Dedicated dark-mail upper-arm material

Status: rejected
## Pre-registration

- Observation: rigid-v2 localizes large residuals to both upper-arm underlayers, while phase 01 established that changing arm primitives produces tubes, beads, or fins. The accepted sleeves still share glossy blackened iron with rigid pieces and have no exportable flexible-material hierarchy.
- Hypothesis: a cooler, rougher, moderately metallic material assigned only to both unchanged upper-arm sleeves will improve region-local neural and material appearance without changing their structural masks, silhouette, landmarks, contacts, or publication.
- Change boundary: add one `dark_mail` Principled material `(0.060, 0.065, 0.064)`, metallic `0.55`, roughness `0.64`, and replace only the two upper-arm uses of `black` with it. No geometry, topology, coordinates, lighting, cameras, annotations, scoring weights, or other material assignments move.
- Expected movement: both upper-arm region montages and material-conditioned appearance should improve across exposed front, diagonal, profile, and rear views. Structural, silhouette, landmark, and contact diagnostics must remain numerically invariant aside from raster determinism.
- Reject if: rigid-v2 aggregate improves by less than `0.002`, the combined upper-arm affected-region mean improves by less than `0.005`, either neural component regresses, unaffected regions regress by more than `0.003`, or the sleeves read as rubber, neoprene, painted cylinders, gray plate, or disappear into adjacent armour in any of all eight views.

## Result

- Baseline distance: `0.621632684510433`
- Candidate distance: `0.6222940270611355`
- Absolute delta: `+0.0006613425507024928`
- Relative delta: `+0.1063879952%`
- Baseline report SHA-256: `b75b85b05855656450ebfc3419779d5c82c6b0e1c2f92595d25e7c5f6628cfb2`
- Candidate report SHA-256: `66e5f6eba70a6440bbded345ed27aa818bbd5f937346be06d4e26a49f5a4c89c`
- Progress frame: `progress/0074-dark-mail-upper-arms.png`
- Decision: reject. The candidate regressed the rigid-v2 aggregate and the registered material term, so it cannot clear either quantitative gate.

## Diagnostics and visual review

All eight views were inspected at full size. Geometry, contacts, silhouettes,
region IDs, and landmarks remained invariant as intended. The cooler roughness
change is subtle, but the still-smooth cylinders read more like matte rubber or
neoprene than woven mail in front, both profiles, and the rear diagonals. Seven
of eight views regress; only right improves by `0.000229`. Global neural
appearance regresses `0.003986`, material appearance regresses `0.002255`, and
the mail-underlayer material-cell mean regresses `0.012528`. Region neural alone
improves `0.001297`, which is not coherent evidence for retention.

## Protocol reflection

Rigid-v2 correctly makes this local material failure visible while proving the
structural invariants exactly. Flat PBR scalars cannot create chainmail language
on a smooth cylinder; future mail work requires exported relief or an authored
surface, not another colour/roughness sweep.

## Next question

Use the atlas to choose a broad authored structural subsystem whose representation
exists in `asset-src/v2`; do not reopen flat upper-arm material tuning.

---

# 0075: Compact the complete head assembly

Status: rejected
## Pre-registration

- Observation: the accepted head, beard, rear hair, and tuft assembly occupies a childlike fraction of the total figure in every view. The target presents a substantially smaller adult head above broader armour; phase 01 narrowed the cranium but never scaled the complete head assembly as one unit.
- Hypothesis: uniformly scaling the complete head/hair assembly to `0.85` around `(0, -0.035, 1.63)` will improve head-to-body proportion and local head/hair neural agreement across all eight views without changing its internal feature placement, topology, materials, or body/equipment geometry.
- Change boundary: after creating the seven accepted hair tufts, scale the local mesh coordinates and pivot-relative object locations of exactly `head`, `nose`, both eye sockets, `beard`, `hair_back`, and `hair_tuft_0..6` by `0.85`. No individual feature receives an independent offset or scale. Keep landmarks, cameras, lights, references, metric, every material, and every non-head object unchanged.
- Expected movement: global and region neural terms should improve, led by front, diagonals, and profiles; head/hair structural boundary and silhouette should improve without contact changes. Torso, limbs, equipment, waist, and their region diagnostics must remain invariant.
- Reject if: rigid-v2 aggregate improves by less than `0.002`, combined `head_skin`/`hair_beard` affected-region evidence improves by less than `0.005`, either neural term regresses, unaffected spill exceeds `0.003`, or the result reads pinheaded, exposes a scalp seam, disconnects beard/hair/neck, makes the gorget oversized, or introduces feature overlap in any view.

## Result

- Baseline distance: `0.6216320174221142`
- Candidate distance: `0.6213719593483316`
- Absolute delta: `-0.0002600580737825986`
- Relative delta: `-0.0418347296%`
- Baseline report SHA-256: `a4e6b40829bc2b7a6e104f58f70fb4d3f324aec80dd3142f1dcb7180f261efee`
- Candidate report SHA-256: `848d3ff0b82cb721032380c12d57680705ab145153b135e996da6ae84ce055f8`
- Progress frame: `progress/0075-compact-adult-head-assembly.png`
- Decision: reject. The improvement is far below the `0.002` global margin and structural agreement regresses.

## Diagnostics and visual review

All eight views were inspected. The head remains connected, symmetric, and free
of scalp or gorget gaps. It reads somewhat less childlike, but the gorget and
shoulder masses become comparatively oversized. Global neural improves
`0.004489` and region neural improves `0.016746`, while silhouette regresses
`0.003849` and structure regresses `0.011769`. Front regresses `0.003366`; the
two profiles improve about `0.00379` each. This is directional evidence for
adult proportions, but not a coherent production or metric win.

## Protocol reflection

Uniform head compaction improves appearance embeddings but harms the bootstrap
structural target, which inherits the accepted head scale. Future proportion
work should address the body/leg ratio rather than continue shrinking the head.

## Next question

Lengthen the lower-body proportion while keeping the accepted head and upper
body assembly unchanged.

---

# 0076: Lengthen the lower-body proportion

Status: rejected
## Pre-registration

- Observation: the accepted figure remains squat: the waist sits only `0.89m` above ground and the torso/head dominate the silhouette, while the target has a longer adult leg-to-torso ratio. Experiment 0075 showed that shrinking the head alone improves neural appearance but harms structural agreement.
- Hypothesis: raising the complete waist, torso, arms, head, cloth, shield, and sword assembly by `0.10m`, while raising only the thigh start points from `0.83` to `0.93`, will create an adult vertical proportion without changing upper-body construction or opening hip/equipment contacts.
- Change boundary: change both thigh start Z literals from `0.83` to `0.93`. After all objects are created, add `0.10` to world Z for objects whose rigid-v2 region is torso, waist, collar, either arm/pauldron/vambrace/hand, head/hair, shield, sword, or ignored cloth. Keep knees, shins, greaves, bands, boots, cameras, materials, X/Y coordinates, object scales, references, metric, and landmarks fixed. The upper assembly translation plus connected thigh extension is indivisible.
- Expected movement: silhouette, global neural, and front/rear/profile body proportions should improve broadly; leg-region structure should remain coherent and all contacts should stay closed. Material appearance should be nearly invariant apart from changed screen ownership.
- Reject if: aggregate improvement is less than `0.002`, front/rear/profile means do not improve coherently, either neural term regresses, unaffected spill exceeds `0.003`, or the candidate opens a hip gap, makes the thighs tubularly overlong, detaches equipment, raises the sword/shield implausibly, clips the head/crop, or loses grounded boots.

## Result

- Baseline distance: `0.6216320147399053`
- Candidate distance: `0.6961405383287107`
- Absolute delta: `+0.07450852358880544`
- Relative delta: `+11.9859533972%`
- Baseline report SHA-256: `1ec961389d9c95205a3e6e68075854c9526193dd6c79dd5b033ddbfcf9b31ae0`
- Candidate report SHA-256: `69fc86d76497d6025cf4a935caff1f5e96520f196bb40d731317559031a13406`
- Progress frame: `progress/0076-lengthen-lower-body-proportion.png`
- Decision: reject. Every view and every moving component regressed dramatically.

## Diagnostics and visual review

All eight views were inspected. Contacts remain closed and the boots remain
grounded, but the thighs become conspicuous long black tubes and the translated
equipment/upper body no longer occupies the frozen target registration. Every
view regresses by `0.0572..0.1056`. Structure regresses `0.256079`, silhouette
`0.058309`, global neural `0.017013`, and region neural `0.002489`.

## Protocol reflection

Fixed registration correctly makes global vertical translations expensive.
Adult proportions cannot be obtained by translating the complete upper
assembly; future work must reshape a localized broad region without moving all
screen-space ownership.

## Next question

Reduce the accepted cuirass/torso width while keeping shoulders, waist, head,
limbs, and equipment anchors fixed.

---

# 0077: Narrow the torso core

Status: rejected
## Pre-registration

- Observation: the accepted cuirass and padded torso form a broad barrel between a much smaller target waist and head. Experiment 0076 proved that translating the full upper assembly is invalid; the remaining broad proportional question is localized torso width.
- Hypothesis: scaling only rigid-v2 `torso` mesh geometry to `0.88` in world X around the centerline will improve the adult chest/waist silhouette and torso-region neural agreement without moving shoulder, waist, limb, head, shield, or sword anchors.
- Change boundary: after construction, transform every vertex of objects published as rigid-v2 `torso` so its world X coordinate is multiplied by `0.88`. Preserve world Y/Z, object origins, all other regions, topology, materials, cameras, references, metric, and landmarks. This includes the padded torso, cuirass, breastplate, ridges, shadow, cross-body strap, and its rivets as one fitted torso assembly.
- Expected movement: torso structure, silhouette, and local/global neural terms should improve in front, rear, diagonals, and profiles while equipment and all non-torso region diagnostics remain invariant.
- Reject if: aggregate improvement is less than `0.002`, torso affected-region evidence improves by less than `0.005`, either neural term regresses, unaffected spill exceeds `0.003`, or narrowing opens shoulder/waist/gorget gaps, makes the breastplate pinched or wasp-waisted, detaches strap/rivets, exposes the padded core, or creates asymmetric clipping.

## Result

- Baseline distance: `0.6216320147399053`
- Candidate distance: `0.63016311976638`
- Absolute delta: `+0.008531105026474695`
- Relative delta: `+1.3723722112%`
- Baseline report SHA-256: `1ec961389d9c95205a3e6e68075854c9526193dd6c79dd5b033ddbfcf9b31ae0`
- Candidate report SHA-256: `1b6ef7ec33f6cb35721bb425f767fa2363112179dccf5c808b67a7ccd9bd58bd`
- Progress frame: `progress/0077-narrow-torso-core.png`
- Decision: reject. The aggregate and every component that could move regressed.

## Diagnostics and visual review

All eight views were inspected. The torso becomes less barrel-like but now reads
as a small pinched breastplate suspended between oversized pauldrons and belt;
thin blue padded-core slivers appear beside it. Every view regresses. Structure
regresses `0.023223`, region neural `0.013741`, global neural `0.005693`, and
silhouette `0.001411`. No metric or production gate passes.

## Protocol reflection

The target needs authored torso layering, not a uniform width compression of all
existing torso pieces. World-space isolation worked technically and should be
reused only where the current shape vocabulary is already valid.

## Next question

Test a localized depth reduction of the oversized spherical cuirass mass while
leaving the fitted front plate and world-X silhouette fixed.

---

# 0078: Reduce torso depth behind the breastplate

Status: rejected
## Pre-registration

- Observation: strict profiles show the accepted padded torso and cuirass sphere as a deep rounded barrel, while the fitted front breastplate already carries the intended front plane. Experiment 0077 proved that narrowing the entire torso assembly destroys front seating.
- Hypothesis: reducing only the Y radii of `padded_torso` from `0.20` to `0.17` and `cuirass_mass` from `0.205` to `0.165` will improve side/rear torso volume and neural agreement while preserving the front breastplate, X/Z silhouette, shoulder/waist interfaces, and all authored overlays.
- Change boundary: change exactly those two Y scale literals. Keep their centers, X/Z radii, the breastplate/shadow/ridges/strap/rivets, all non-torso geometry and materials, cameras, landmarks, references, and metric fixed.
- Expected movement: left/right and rear diagonals should lead through torso-region and global neural terms; front should remain nearly invariant; structural movement must remain localized to the rear/profile torso contour.
- Reject if: aggregate improvement is less than `0.002`, profile mean improves by less than `0.005`, either neural term regresses, unaffected spill exceeds `0.003`, or the front plate floats, the back becomes flat/hollow, pauldrons or belt detach, rear cloth floats, or a torso seam/gap appears.

## Result

- Baseline distance: `0.6216320147399053`
- Candidate distance: `0.6268116036598551`
- Absolute delta: `+0.005179588919949851`
- Relative delta: `+0.8332242866%`
- Baseline report SHA-256: `1ec961389d9c95205a3e6e68075854c9526193dd6c79dd5b033ddbfcf9b31ae0`
- Candidate report SHA-256: `ebb72d27b7dc7af6931e53dad2c036af67ccc2e6950a6fdcf309148903f34eca`
- Progress frame: `progress/0078-reduce-torso-depth.png`
- Decision: reject. Aggregate, both profiles, front, back, and global neural regress.

## Diagnostics and visual review

All eight views were inspected. The breastplate stays seated and no literal gap
opens, but the side silhouette still reads as a stacked barrel while losing
useful mass behind the shoulders. Only the two front diagonals improve slightly.
Structure regresses `0.017766`, silhouette `0.003468`, and global neural
`0.002203`; region neural improves only `0.000972`.

## Protocol reflection

The depth residual is not separable from the complete torso construction. Both
uniform width and depth edits fail; close scalar torso scaling and require an
authored replacement before revisiting this region.

## Next question

Use the fixed atlas on the large shield subsystem, testing one coherent outline
scale around its accepted center without changing depth or material.

---

# 0079: Narrow the complete shield outline

Status: rejected
## Pre-registration

- Observation: the accepted heater shield retains a broad toy-like width in front/rear and diagonal views relative to the target's taller, slimmer field. Its height, side assignment, depth, and hand relationship were already established by phase 01.
- Hypothesis: scaling the complete shield assembly to `0.84` in world X around `x=0.535` will improve shield silhouette, structural, and neural agreement without changing height, depth, material hierarchy, boss seating, or hand/equipment order.
- Change boundary: after construction, multiply `(world_x - 0.535)` by `0.84` for every vertex published as `shield_field` or `shield_rim_boss`. Keep world Y/Z, object origins, all non-shield objects, shield depth and materials, cameras, references, landmarks, and metric fixed.
- Expected movement: front, back, and four diagonals should lead through shield structural/silhouette and both neural terms; profiles may move modestly. Non-shield diagnostics must remain invariant.
- Reject if: aggregate improvement is less than `0.002`, combined shield affected-region evidence improves by less than `0.005`, either neural term regresses, unaffected spill exceeds `0.003`, or the shield becomes too narrow, loses the heater silhouette, detaches from the hand, clips the body, floats its boss/field, or differs across front/back exposures.

## Result

- Baseline distance: `0.6216320147399053`
- Candidate distance: `0.6219558139093994`
- Absolute delta: `+0.0003237991694940989`
- Relative delta: `+0.0520885607%`
- Baseline report SHA-256: `1ec961389d9c95205a3e6e68075854c9526193dd6c79dd5b033ddbfcf9b31ae0`
- Candidate report SHA-256: `c1b5711c16cc16b5b71c97ff25b70466d90fc6c303f63177953c5ff27a109732`
- Progress frame: `progress/0079-narrow-shield-outline.png`
- Decision: reject. Silhouette improves, but aggregate, structure, region neural, and the primary front views regress.

## Diagnostics and visual review

All eight views were inspected. The shield stays seated and gains a more adult
tall-heater proportion, but the boss becomes horizontally compressed and the
front field undershoots its target width. Back, both rear diagonals, and right
improve; front, both front diagonals, and left regress. Silhouette improves
`0.006098`, while structure regresses `0.006876` and region neural regresses
`0.001068`.

## Protocol reflection

The fixed atlas exposes a real cross-sheet inconsistency: narrower shield width
helps all rear views but hurts all front views. One rigid outline cannot satisfy
both, so nearby width tuning is closed rather than choosing a sheet-specific
shortcut.

## Next question

Test the sword blade's overly broad triangular silhouette by narrowing its
widths without changing endpoints, pose, guard, grip, or equipment side.

---

# 0080: Narrow the sword blade

Status: rejected
## Pre-registration

- Observation: the accepted sword blade forms a broad dark triangle from its `0.055` root half-width, while the target uses a slimmer straight blade. Its endpoints, side, angle, and hilt were already established by phase 01.
- Hypothesis: reducing blade half-widths from `0.055/0.006` to `0.036/0.004` will improve sword silhouette and local neural agreement without changing pose, length, depth, grip, guard, pommel, or hand contact.
- Change boundary: change exactly the two width arguments in the existing `sword_blade` call. Keep endpoints `(-0.50,0.78)` and `(-0.20,0.08)`, depth `0.045`, all hilt geometry/materials, every non-blade object, cameras, references, landmarks, and metric fixed.
- Expected movement: front, front diagonals, profiles, and back-right should improve through sword structure, silhouette, and neural terms; occluded rear views should remain bounded.
- Reject if: aggregate improvement is less than `0.002`, sword affected-region evidence improves by less than `0.005`, either neural term regresses, unaffected spill exceeds `0.003`, or the blade becomes needle-like, loses guard seating, shows a broken bevel, looks shorter, or weakens the sword silhouette in any exposed view.

## Result

- Baseline distance: `0.6216320147399053`
- Candidate distance: `0.6225541178257226`
- Absolute delta: `+0.0009221030858173052`
- Relative delta: `+0.1483358424%`
- Baseline report SHA-256: `1ec961389d9c95205a3e6e68075854c9526193dd6c79dd5b033ddbfcf9b31ae0`
- Candidate report SHA-256: `58092aa816949aca84f3ed082c6957c31a3349f6e0d4f94c9043a6f6457df834`
- Progress frame: `progress/0080-narrow-sword-blade.png`
- Decision: reject. The candidate regresses aggregate, structure, both neural summaries, and the most exposed front-right view.

## Diagnostics and visual review

All eight views were inspected. The blade stays straight, seated at the guard,
and free of bevel or contact defects, but the reduced mask loses target overlap
in front and front-right. Silhouette improves `0.000838` and material appearance
improves `0.000391`, while structure regresses `0.005039`; front-right regresses
`0.005747`. The cleaner visual blade is not a similarity improvement.

## Protocol reflection

The sword outline is another cross-view/annotation tradeoff already near the
best available primitive fit. Close blade-width tuning; later sword work needs
an authored weapon/contact subsystem, not another scalar width.

## Next question

Test whether reducing the oversized spherical pauldron volumes uniformly can
improve shoulder proportion without changing their centers or arm contacts.

---

# 0081: Reduce pauldron width

Status: rejected
## Pre-registration

- Observation: both accepted spherical pauldrons dominate the front/rear shoulder width and reinforce a toy-ball silhouette. Prior angular replacement failed as plaques, but simple width has not been isolated while retaining the accepted sphere, depth, height, and rivets.
- Hypothesis: reducing only each pauldron X radius from `0.16` to `0.14` will improve shoulder proportion and neural/silhouette agreement without altering depth highlights, vertical arm coverage, centers, rivet seating, or arm pose.
- Change boundary: change exactly the X scale literal in the bilateral pauldron sphere call to `(0.14, 0.145, 0.12)`. Keep pauldron centers, Y/Z scale, steel material, four rivets, arms, torso, head, equipment, cameras, references, landmarks, and metric fixed.
- Expected movement: front, back, diagonals, and shoulder-exposed profiles should improve through pauldron structure, silhouette, and neural terms; contacts and non-pauldron regions remain invariant.
- Reject if: aggregate improvement is less than `0.002`, combined pauldron evidence improves by less than `0.005`, either neural term regresses, unaffected spill exceeds `0.003`, or either shoulder becomes undersized, exposes an arm cap, floats a rivet, detaches from torso/arm, or creates asymmetric shoulder language.

## Result

- Baseline distance: `0.6216320147399053`
- Candidate distance: `0.6204503342172984`
- Absolute delta: `-0.0011816805226068094`
- Relative delta: `-0.1900932537%`
- Baseline report SHA-256: `1ec961389d9c95205a3e6e68075854c9526193dd6c79dd5b033ddbfcf9b31ae0`
- Candidate report SHA-256: `f0e63508d447ce7d7435c2daf7814639994263b1a5e83ab8a44786b94a606fe0`
- Progress frame: `progress/0081-reduce-pauldron-width.png`
- Decision: reject. The candidate improves broadly but misses the preregistered and enforced `0.002` acceptance margin.

## Diagnostics and visual review

All eight views were inspected. Rivets remain seated, arm roots stay covered,
and the narrower shoulders are visually coherent. Six views improve; only
back-right and right regress. Global neural improves `0.007976`, region neural
`0.006381`, silhouette `0.000645`, and material appearance `0.000315`, while
structure regresses `0.006880`. The global gain of `0.001182` is real but below
the phase-02 retention threshold.

## Protocol reflection

This is the first strongly coherent directional result in the batch, but the
protocol correctly prevents post-hoc retention or nearby radius tuning. Preserve
the evidence for a future authored pauldron subsystem; do not change the literal
again in this run.

## Next question

Test a similarly isolated reduction of the oversized spherical gauntlet mass,
keeping hand anchors and all equipment geometry fixed.

---

# 0082: Compact the spherical gauntlet mass

Status: rejected
## Pre-registration

- Observation: the accepted bright gauntlet spheres are visibly larger than the target's compact armoured fists. Prior replacement solids failed as paddles or mitts; this experiment retains the accepted continuous sphere and isolates mass only.
- Hypothesis: reducing both gauntlet scales from `(0.11,0.10,0.13)` to `(0.095,0.09,0.115)` will improve hand proportion and neural/silhouette agreement without moving hand anchors, changing equipment, or introducing new construction vocabulary.
- Change boundary: change exactly the bilateral gauntlet scale tuple. Keep centers, material, topology, bevel/smoothing, vambraces, sword, shield, cameras, references, landmarks, and metric fixed.
- Expected movement: front, diagonals, profiles, and rear views with exposed hands should improve through hand-region and neural terms; equipment order and all non-hand diagnostics remain invariant.
- Reject if: aggregate improvement is less than `0.002`, combined hand evidence improves by less than `0.005`, either neural term regresses, unaffected spill exceeds `0.003`, or a vambrace cap appears, a wrist gap opens, either hand disappears, sword/shield purchase weakens, or the fists read as beads/stumps.

## Result

- Baseline distance: `0.6216320147399053`
- Candidate distance: `0.6230492617320431`
- Absolute delta: `+0.001417246992137855`
- Relative delta: `+0.2279880956%`
- Baseline report SHA-256: `1ec961389d9c95205a3e6e68075854c9526193dd6c79dd5b033ddbfcf9b31ae0`
- Candidate report SHA-256: `735ded50551719d02721d567b7cc295abe5435cd29197e55a6e7367dd13f9d7c`
- Progress frame: `progress/0082-compact-gauntlet-mass.png`
- Decision: reject. Every view regresses and both structural/material evidence move the wrong way.

## Diagnostics and visual review

All eight views were inspected. Wrist geometry remains closed, but the hands
lose readable volume behind equipment and approach the disappearing-stump
failure seen in phase 01. Global neural improves `0.001719` and region neural
`0.000692`, but material appearance regresses `0.003729`, structure `0.005006`,
and silhouette `0.000548`. Every view regresses, led by left `0.004008`.

## Protocol reflection

Reduced round hand mass is repeatedly rewarded by neural terms but rejected by
contact/readability and structured appearance. This confirms the phase-01
closure: future hands require authored grasp geometry, not scale or primitive
replacement tuning.

## Next question

Test modest knee-mass reduction, a previously untouched bilateral lower-body
region with broad diagonal/profile exposure and no equipment contact.

---

# 0083: Compact the knee masses

Status: rejected
## Pre-registration

- Observation: the accepted knee spheres create broad polished balls between straight thighs and greaves. The target has compact fitted knee cops; this bilateral lower-body region has not been isolated under rigid-v2 and has no equipment-contact confound.
- Hypothesis: reducing each knee scale from `(0.145,0.13,0.13)` to `(0.13,0.12,0.12)` will improve knee proportion, silhouette, and neural agreement while retaining the accepted ridge, stance, shin/greave overlap, and material hierarchy.
- Change boundary: change exactly the bilateral knee sphere scale tuple. Keep centers, knee ridges, thighs, shins, greaves/bands, boots, all other geometry/materials, cameras, references, landmarks, and metric fixed.
- Expected movement: front, rear, diagonals, and profiles with exposed knees should improve through knee-region, silhouette, and neural terms; non-knee diagnostics remain invariant.
- Reject if: aggregate improvement is less than `0.002`, combined knee evidence improves by less than `0.005`, either neural term regresses, unaffected spill exceeds `0.003`, or the ridge floats, thigh/shin caps appear, a leg gap opens, knees become childlike beads, or bilateral stance reads inconsistently.

## Result

- Baseline distance: `0.6216320147399053`
- Candidate distance: `0.6292748381360981`
- Absolute delta: `+0.007642823396192822`
- Relative delta: `+1.2294771207030942%`
- Baseline report SHA-256: `1ec961389d9c95205a3e6e68075854c9526193dd6c79dd5b033ddbfcf9b31ae0`
- Candidate report SHA-256: `987c256199525373db2ed1f8d7426a43cb62694e5d232c4088be4faa810d2a60`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: rejected. The candidate regressed by `0.007643`, every fixed view
  worsened, and the structural component alone regressed `0.029327`.

## Diagnostics and visual review

All eight fixed views were inspected. View regressions ranged from back
`+0.004043` to left `+0.010847`; no view supported the registered hypothesis.
Global neural regressed `+0.003917`, silhouette `+0.000193`, and structure
`+0.029327`. Region neural was effectively flat (`-0.000040`) and material
appearance improved only `-0.000570`. The smaller knees remained bilateral and
mechanically seated: both ridges overlapped, thigh and shin ends stayed covered,
and no gap or equipment interaction appeared. The failure is therefore a
proportion mismatch rather than broken construction.

## Protocol reflection

The broad accepted knee masses are compensating for the generator's straight,
thin adjacent limb primitives. Compacting only the balls reveals more of those
transitions and sharply damages hierarchical structure. This repeats the phase's
central lesson: scalar shrinking of isolated body masses is not a route to the
target's fitted articulation. Close knee-radius tuning under this representation.

## Next question

Can rigid-v2 validate the historically strong, visually coherent fitted
elliptical belt that formula-v1 rejected only because an exposure-blind
improved-view count overruled its large profile gains?

---

# 0084: Re-evaluate the fitted elliptical belt under rigid-v2

Status: rejected
## Pre-registration

- Observation: experiment 0057 replaced the accepted circular belt puck with a fitted elliptical leather band. Formula-v1 improved by `0.005238`, all six component means improved, the two exposed profiles improved by `0.013050` and `0.046404`, and full-resolution review found the buckle, faulds, tabards, and torso continuously seated. It was rejected only because an exposure-blind requirement that five views improve counted small occluded-view regressions equally with the much larger profile gains. Rigid-v2 now supplies hierarchical waist structure, local neural evidence, fixed registration, and bounded spill diagnostics, so this is a prospective replication under the successor ruler rather than a post-hoc reversal.
- Hypothesis: replacing only the solid circular belt with the previously frozen fitted elliptical band will remove the waist-puck shelf and improve global and waist-local similarity under rigid-v2 while preserving every attachment and non-waist region.
- Change boundary: extend `torus()` with optional final `scale=(1,1,1)`, apply that scale before the unchanged `finish()` call, and replace only `cylinder("belt",(0,0,0.89),0.300,0.072,leather,...)` with `torus("belt",(0,0,0.89),0.250,0.050,leather,root,scale=(1.0,0.84,0.72))`. Existing callers retain identity scale. This preserves outer X radius `.300` and Z envelope `.854..926`, contracts outer Y radius `.300→.252`, and creates an inner ellipse approximately X `.200`, Y `.168`. Keep buckle, faulds, tabards, torso, strap, legs, every other object/material/name/publication, landmarks, cameras, references, and metric fixed. The hollowing and elliptical fit are one indivisible belt construction, using byte-for-byte 0057 literals without tuning from its evidence.
- Expected movement: left/right profiles and diagonals should lead through waist structure, silhouette, and both neural terms; front/back may be smaller because their belt width and vertical envelope remain fixed. Material appearance should remain bounded because leather and approximate visible area are retained. Raw landmarks and fixed registration remain invariant.
- Reject if: aggregate improvement is less than `0.002`; waist structural evidence or the mean of the two profiles fails to improve by at least `0.005`; either neural term regresses; unaffected spill exceeds `0.003`; an existing torus caller changes; the opening exposes a torso/fauld gap; the belt floats, sinks, clips, or reads as an inner tube/disconnected ring; buckle, tabard, or fauld attachment degrades; or full-resolution review finds a production failure. Do not relax these rigid-v2 gates from the favorable v1 history.

## Result

- Baseline distance: `0.6216320147399053`
- Candidate distance: `0.6242053818060631`
- Absolute delta: `+0.00257336706615785`
- Relative delta: `+0.4139695197704003%`
- Baseline report SHA-256: `1ec961389d9c95205a3e6e68075854c9526193dd6c79dd5b033ddbfcf9b31ae0`
- Candidate report SHA-256: `695f16cafac39bd0ffa2afe44dbd2a359e78ed8e3b1f08234668f38b7d5f071f`
- Progress frame: [phase contact sheet](front-contact-sheet.png)
- Decision: rejected. Rigid-v2 regressed `0.002573`; region neural and
  structure both worsened, and the registered profile improvement was far below
  its threshold.

## Diagnostics and visual review

All eight fixed views were inspected at full resolution. The construction was
clean: the broad profile shelf disappeared, the torso concealed the opening,
and buckle, faulds, both tabards, and strap relationship stayed seated. No torus
caller changed unexpectedly and the belt did not read as a detached inner tube.
The metric nevertheless rejects it coherently. Only left (`-0.000094`) and right
(`-0.002116`) improved; the other six views regressed from front `+0.001199` to
back `+0.004836`. Global neural improved `-0.005748` and silhouette improved
`-0.000161`, but region neural regressed `+0.000573`, material appearance
`+0.001681`, and hierarchical structure `+0.010234`. The profile mean improved
only `0.001105`, well below the preregistered `0.005` requirement.

## Protocol reflection

The replication resolves phase 1's false-negative ambiguity without changing
its historical decision. Formula-v1 strongly rewarded removal of the profile
puck, but rigid-v2 shows that the hollow elliptical band loses target-like waist
structure across six views and does not improve local appearance. The earlier
gain was not robust to fixed registration and hierarchical segmentation. The
right profile remains useful directional evidence, but this exact construction
must remain rejected rather than being rescued by its visually tidy mechanics.

## Next question

The ten-iteration block is complete. Its strongest coherent near-margin signal
was narrower pauldrons in 0081; further progress should begin with authored
regional geometry and residual-atlas-guided variants rather than scalar edits to
the primitive generator.
