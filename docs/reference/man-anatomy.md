# Man: contact anatomy

The surfaces through which the humans' hands and feet meet the world, measured from the workshop
skins: what was measured, by which rule, what is approximated, and the numbers.

- Feet and the Warrior's hands: `assets/humanoid/man-contact-geometry.json`
  (`SOURCES["man-contact-geometry"]`), written by `node scripts/core/man-envelope.mjs --write`.
- Both humans' hands (one rig, one skin mesh): `assets/humanoid/workshop-fighter-hands.json` and
  `workshop-rogue-hands.json` (`SOURCES["workshop-fighter-hands"]`, `["workshop-rogue-hands"]`),
  written by `node scripts/core/hand-envelope.mjs --write`; `man-envelope.mjs` takes the Warrior's
  from it.

Figures are the left side at the authored size; the spec scales them by `FIT_SCALE` (0.9412). The
right side mirrors the left within 0.5 % (the foot's hull has one corner fewer).

## Inputs

- `public/assets/humanoid/workshop-fighter.glb@44790a14`: the bare hands (the skin's hand mesh) and bare feet
  (`bare__feet`), skinned in the bind pose; `public/assets/humanoid/workshop-rogue.glb@44790a14` for the Rogue's hands.
- `assets/humanoid/workshop-fighter.json` (`workshop-rogue.json` for the Rogue's hands): the rig, for
  the wrist, knuckles, the ball head and the relaxed hand (`grips.empty`).
- `FIST` (`src/render/fist.ts`): the renderer's fitted fist, turned by `fistTurns`.

## Rules

**Palm.** The open hand's convex hull, fingers straight as in the bind pose. The palmar direction is
square to the wrist-to-middle-knuckle line and the index-to-pinky knuckle line, on the side the
relaxed middle finger curls toward. The skinned palm is hollow (its most palmar plane touches 0.7 cm²),
so the patch is the hull's largest face within 45° of palmar (coplanar triangles merged), bridging
heel of hand to finger pads as flat ground meets it; its outline is the corners within `PATCH` of
that face's plane. `PATCH` = 5 mm is a chosen tolerance for skin flattening under load, not a
measurement. The hand files add the patch's `centre` (the outline's area centroid), where an open
hand bears; the Man file leaves it out.

**Fist.** The hull of the hand skinned in `FIST`. `knuckles` is the rig's middle knuckle (MET3);
`strike` is where the wrist-to-knuckle line through it leaves the hull, about 5 mm ahead.

**Foot and toes.** The vertices of `bare__feet` the foot's bones weigh most on, cut by the vertical
plane through the rig's ball head square to the ball bone's horizontal direction. Each piece's hull
holds its side's vertices and the mesh edges' crossings of the plane, so the pieces share the cut
face. `sole` and `pad` are the corners within `PATCH` of each piece's lowest point, normal down.
`rigidFoot` is the uncut foot's hull and sole, for a body without a toe joint.

**Hinge.** `mtp`, the metatarsophalangeal axis: through the ball head's horizontal position, at the
middle of the cut's height, along the horizontal square to the ball bone. The ball head stands 9 mm
above the ground, inside the sole's skin, so the mid-height of the section stands in for the joint
centre.

**Mass.** A shape carries no mass. Each piece's `solid` is its hull as a uniform solid (volume,
centre, inertia per unit mass), which splits the de Leva foot's mass by volume, assuming uniform
density, when the toes are a segment of their own.

**Toe joint** (research and Man's spec, not the geometry): a passive spring about the bind pose's
rest, 25 N m/rad with 2 N m s/rad damping (`SOURCES["falisse-2022-toes"]`), bounds about ±90°
(`SOURCES["opensim-gait2392-mtp"]`), the model's coordinate range rather than a measured range. It
fails on the solver ([passive toes](man-passive-toes.md)).

## Numbers

| Part | Corners | Extent x · y · z (cm) | Patch | Solid |
|---|---|---|---|---|
| Rigid foot | — | 10.5 · 10.6 · 28.2 | sole 10 corners, 130.1 cm² | — |
| Foot (cut) | 106 | — | sole 10 corners, 103.2 cm² | 1113 cm³, centre (-21.52, 4.11, 5.80) |
| Toes | 109 | z 8.0 | pad 6 corners, 21.4 cm² | 172 cm³, centre (-20.77, 1.84, 18.16) |

- Hinge: centre (-21.39, 2.34, 15.33) cm, axis (0.9983, 0, -0.0582), turned 3.3° about the vertical
  from the body's right, as the ball bone turns.
- The toes are 13.4 % of the foot's volume: 0.145 kg of the 79 kg Warrior's de Leva foot (1.08 kg).
- Inertia per unit mass about the centre, diagonal (cm²): toes 4.54, 9.49, 6.80; foot 31.9, 30.9,
  10.7.

Hands, left side, authored size (cm), positions in the bind pose:

| Model | Palm corners | Palm extent x · y · z | Patch | Patch centre | Fist corners | Fist extent | `knuckles` | `strike` |
|---|---|---|---|---|---|---|---|---|
| Warrior | 151 | 13.9 · 18.0 · 21.4 | 12 corners, 163.2 cm², normal (0.653, -0.684, -0.326) | (-53.08, 109.87, 27.83) | 173 | 10.2 · 13.7 · 16.1 | (-58.37, 110.62, 31.52) | (-58.60, 110.37, 31.93) |
| Rogue | 154 | 11.4 · 15.8 · 18.1 | 11 corners, 104.7 cm² | (-45.55, 99.36, 22.19) | 171 | 8.5 · 12.1 · 13.8 | (-49.88, 100.10, 25.05) | (-50.06, 99.88, 25.37) |

The strike stands 5.3 mm (Warrior) and 4.3 mm (Rogue) ahead of the knuckle, and the patch centre 65
and 52 mm behind it, toward the wrist and palmar, before `FIT_SCALE`.

## Approximations

- The surfaces are convex hulls: the palm's hollow, the arch and the gaps between toes are bridged.
  They are for contact on flat ground.
- A hand is one rigid piece per pose; the fingers do not bend under load.
- Rapier merges adjacent triangles within about 1.5° into one face and drops corners inside it (4 to
  7 of a hand hull's 151 to 173, each within 0.005 mm of the rest's hull), so the collider is the
  hull. Its point query (`gapTo`) reads some corners up to 11 mm off a surface a ray meets exactly
  there, so `tests/core-hand-poses.test.mjs@2a1b29ac` compares the collider's corners instead.
- The bind pose's skin is the unloaded skin; nothing models its compression beyond `PATCH`.
- The hinge's height is a mid-section estimate (**Hinge**).
