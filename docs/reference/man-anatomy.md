# Man: contact anatomy

Man's hands and feet meet the world through surfaces measured from the Warrior's skin, not
through the boot box and capsule hand of the workshop fighter. This record says what was measured,
by which rule, what is approximated, and the numbers. The geometry is
`assets/humanoid/man-contact-geometry.json` (`SOURCES["man-contact-geometry"]`), written by
`node scripts/core/man-envelope.mjs --write` and measured again by `tests/man-envelope.test.mjs`.
The hands are measured by `scripts/core/hand-envelope.mjs` for both workshop humans, which share
the rig and the skin mesh: `assets/humanoid/workshop-fighter-hands.json` and
`workshop-rogue-hands.json` (`SOURCES["workshop-fighter-hands"]`, `["workshop-rogue-hands"]`),
written by `node scripts/core/hand-envelope.mjs --write` and measured again by
`tests/hand-envelope.test.mjs`; `man-envelope.mjs` takes the Warrior's from it. Figures below are the left side at the authored size; the spec scales them by `FIT_SCALE`
(0.9412). The right side mirrors it within 0.5 % (the foot's hull has one corner fewer).

## Inputs

- `public/assets/humanoid/workshop-fighter.glb`: the bare hands (the skin's hand mesh) and the
  bare feet (`bare__feet`), skinned in the bind pose; `workshop-rogue.glb` for the Rogue's hands.
- `assets/humanoid/workshop-fighter.json` (and `workshop-rogue.json` for the Rogue's hands): the rig, for the wrist, knuckles, the ball head and the
  relaxed hand (`grips.empty`).
- `FIST` (`src/render/fist.ts`): the renderer's fitted fist, turned by `fistTurns`; `FIST` moved
  there from `skin.ts` so that a script can read it without the renderer.

## Rules

**Palm.** The open hand's convex hull, fingers straight as the bind pose has them. The palmar
direction is square to the wrist-to-middle-knuckle line and the index-to-pinky knuckle line, on
the side the relaxed middle finger curls toward. The skinned palm is hollow: the most palmar plane
of the hull touches it in a sliver (0.7 cm²). The patch is instead the hull's largest face within
45° of palmar (coplanar triangles merged), which bridges the hollow from the heel of the hand to
the finger pads as a flat ground meets it; its outline is the corners within `PATCH` of that
face's plane, laid on it. `PATCH` = 5 mm is a chosen tolerance for skin flattening under load,
not a measurement. The hand artifacts add the patch's `centre`, the outline's area centroid on
its plane, where an open hand bears; the Man artifact leaves it out.

**Fist.** The hull of the hand skinned in `FIST`. `knuckles` is the rig's middle knuckle (MET3);
`strike` is where the wrist-to-knuckle line through that knuckle leaves the hull: the fist's
surface just ahead of the middle knuckle, about 5 mm at the authored size.

**Foot and toes.** The vertices of `bare__feet` that the foot's bones weigh most on, cut by the
vertical plane through the rig's ball head, square to the ball bone's horizontal direction. Each
piece's hull holds the vertices on its side and the points where the mesh's edges cross the plane,
so the two pieces share the cut face. `sole` and `pad` are the corners within `PATCH` of each
piece's lowest point, normal down. `rigidFoot` is the uncut foot's hull and sole, the envelope for
a body without a toe joint.

**Hinge.** `mtp` is the metatarsophalangeal axis: through the ball head's horizontal position, at
the middle of the cut's height, along the horizontal square to the ball bone. The rig's ball head
stands 9 mm above the ground, inside the sole's skin, so its height is not used; the mid-height of
the section is an approximation of the joint centre.

**Mass.** A shape carries no mass. Each piece's `solid` is its hull as a uniform solid (volume,
centre, inertia per unit mass about the centre), which splits the de Leva foot's mass by volume
when a body gives the toes their own segment. The volume share assumes uniform density through
the foot.

**Toe joint** (used by research and by Man's spec, not by the geometry): a passive rotational
spring about the neutral rest of the bind pose, 25 N m/rad with 2 N m s/rad of damping
(`SOURCES["falisse-2022-toes"]`), with bounds of about ±90° (`SOURCES["opensim-gait2392-mtp"]`).
The bounds are the musculoskeletal model's coordinate range, a prototype choice rather than a
measured range of motion.

## Numbers

| Part | Corners | Extent x · y · z (cm) | Patch | Solid |
|---|---|---|---|---|
| Palm | 151 | 13.9 · 18.0 · 21.4 | 12 corners, 163.2 cm², normal (0.653, -0.684, -0.326) | — |
| Fist | 173 | 10.2 · 13.7 · 16.1 | — | — |
| Rigid foot | — | 10.5 · 10.6 · 28.2 | sole 10 corners, 130.1 cm² | — |
| Foot (cut) | 106 | — | sole 10 corners, 103.2 cm² | 1113 cm³, centre (-21.52, 4.11, 5.80) |
| Toes | 109 | z 8.0 | pad 6 corners, 21.4 cm² | 172 cm³, centre (-20.77, 1.84, 18.16) |

- Hinge: centre (-21.39, 2.34, 15.33) cm, axis (0.9983, 0, -0.0582): turned 3.3° about the vertical from the body's
  right, as the ball bone turns.
- The toes are 13.4 % of the foot's volume; with the 79 kg Warrior's de Leva foot (1.08 kg),
  0.145 kg.
- Inertia per unit mass about the centre, diagonal (cm²): toes 4.54, 9.49, 6.80; foot 31.9, 30.9,
  10.7.
- Fist: `knuckles` (-58.37, 110.62, 31.52), `strike` (-58.60, 110.37, 31.93) cm in the bind pose.

**Both workshop humans' hands**, left side, authored size (cm):

| Model | Palm corners | Palm extent x · y · z | Patch | Patch centre | Fist corners | Fist extent | `knuckles` | `strike` |
|---|---|---|---|---|---|---|---|---|
| Warrior | 151 | 13.9 · 18.0 · 21.4 | 12 corners, 163.2 cm² | (-53.08, 109.87, 27.83) | 173 | 10.2 · 13.7 · 16.1 | (-58.37, 110.62, 31.52) | (-58.60, 110.37, 31.93) |
| Rogue | 154 | 11.4 · 15.8 · 18.1 | 11 corners, 104.7 cm² | (-45.55, 99.36, 22.19) | 171 | 8.5 · 12.1 · 13.8 | (-49.88, 100.10, 25.05) | (-50.06, 99.88, 25.37) |

The strike stands 5.3 mm (Warrior) and 4.3 mm (Rogue) ahead of the knuckle, and the patch centre
65 and 52 mm behind it, toward the wrist and palmar. Both figures take `FIT_SCALE`.

## Approximations

- The surfaces are convex hulls: the palm's hollow, the arch and the gaps between toes are
  bridged. Contact on a flat ground is what they are for.
- The hand is one rigid piece per pose; the fingers do not bend under load.
- The bind pose's skin is the unloaded skin; nothing models its compression beyond `PATCH`.
- The hinge's height is a mid-section estimate (see **Hinge**).
