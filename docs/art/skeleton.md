# The skeleton's art

The crypt skeleton is drawn with Blender Studio's realistic human skeleton, cut into rigid pieces,
one per part of the body, each carried by the core segment its bones belong to. The art is
cosmetic: it collides with nothing, is not pickable and decides nothing. The skeleton's colliders
are its core segments, which stay thin by the owner's choice, so a blow that passes between the
drawn ribs still meets the trunk.

## Source and licence

`public/assets/skeleton/skeleton.glb` is adapted from the "Skeleton - Realistic" collection of
Blender Studio's Human Base Meshes bundle, v1.4.1 (`human_base_meshes_bundle.blend`, from
<https://download.blender.org/demo/asset-bundles/human-base-meshes/>), released under CC0 1.0.
The adaptation groups the bones by part, fits them onto the parts' joints, closes the hands into
fists, and bakes occlusion and grime into vertex colours. There is no texture. The GLB is served
from this repository and makes no third-party request; Blender Studio does not endorse the game.

## What the file holds

One mesh per part, named by the part's key: `head.head`, `head.neck`, `trunk.core`,
`trunk.waist`, `legs.pelvis`, `legs.thighL` and `R`, `legs.shinL` and `R`, `legs.footL` and `R`, `primary.collar`,
`primary.upperArm`, `primary.forearm`, `primary.wrist`, `primary.wrist.bare`, `primary.fist`, and
the same for `secondary`. `primary` is the body's right (+X), `secondary` its left; a leg's `L` is
-X.

- **Frame.** A piece's vertices are in its part's own frame, in the game's left-handed
  coordinates: +Y up, +Z forward, +X the body's right. The runtime converts nothing, so a standard
  glTF viewer shows the model mirrored; `extras.frame` says so.
- **Winding.** Triangles wind the way Babylon's `MeshBuilder` winds them. The source's right-side
  bones are the left's meshes under a negative scale, a reflection, so the compiler reverses their
  triangles; a piece that skips this draws inside out, which a Blender Workbench preview does not
  show.
- **Hands.** `*.wrist` is the whole closed hand. `*.wrist.bare` (the palm) and `*.fist` (the
  fingers) split that same hand. The game shows the split pair and not the whole hand
  (`SKELETON_UNSHOWN`).
- **Eyes.** `head.head` carries `extras.eyes`, the eye sockets' centres in the head's frame.
- **Colour.** Occlusion and grime are baked into `COLOR_0`.

## How it rides the core

The core skeleton (`src/core/human/skeleton.ts`, model `crypt-skeleton`) is built by the human
body-plan code from a figure read out of the art's bind, `assets/skeleton/bind.json`: for each
part, its position and turn in the body frame and its box in its own frame, as the art was fitted
to it. `skeletonFigure` takes the rows of the fist build:

- the joint centres are the parts' ends along each part's y (the thigh's top is the hip, the
  upper arm's bottom the elbow, the neck's bottom the cervicale);
- the trunk segments are the hull of the core and pelvis boxes' corners, sliced at de Leva's trunk
  landmarks;
- the feet are the foot boxes;
- what the art does not give (mass, strength tables, hit points, the fists' turn) is a named
  placeholder, `skeleton-placeholders` in `SOURCES`.

The skeleton's reference pose is the bind itself: standing, elbows at a right angle, forearms
forward, fists thumb up. Postures are joint angles measured from each body's reference pose, so a
posture written for the humans (`GUARD`) bends the skeleton's elbows into their stops.

`src/render/skeleton-skin.ts` draws it. `parseSkeletonArt` reads the GLB's meshes directly (no
glTF loader); `loadSkeletonArt` fetches it once per page. `SKELETON_PIECES` names the segment that
carries each piece: the neck rides the head; the ribcage and both collars the upper trunk; the
lumbar spine the middle trunk; the pelvis the lower trunk; the palm and the fingers the hand; the
arm and leg pieces their own segments. The forearm's roll ring has no piece: the radius and ulna
span it. `piecesOnSegments` holds each piece at its bind relative to its segment's reference
frame, so at the reference pose every piece is exactly where it was authored. `dressSkeleton`
builds the meshes with their own bone and rune materials, sets each piece from its segment's
`position` and `rotationQuaternion` before every render, and places small rune spheres in the eye
sockets. The arena (`src/arena/main.ts`), the crypt (`src/dungeon/main.ts`) and the lab
(`src/lab/main.ts`) all dress the skeleton this way.

`bind.json` is fixed: nothing in the repository regenerates it, and both the art and the core
skeleton read it. Moving a joint means refitting the art as well.

## Rebuilding the GLB

Blender 4.5 LTS, from the repository root. The build starts from the checked-in, stripped source:

```powershell
blender --background --disable-autoexec assets/skeleton/skeleton-source.blend --python scripts/skeleton/build-assets.py -- assets/skeleton/bind.json public/assets/skeleton/skeleton.glb .review
```

The last argument is optional; with it the script also renders front, side, three-quarter, hand
and skull previews over the part boxes to `.review/skeleton-*.png`. The part map (which source
bones go on which part), the landmarks each fit uses and the finger curl (`CURL`) are data at the
top of their sections in `scripts/skeleton/build-assets.py`.

`assets/skeleton/skeleton-source.blend` is the bundle reduced to the skeleton collection, with its
mirror modifiers applied and subdivision removed. `scripts/skeleton/prepare-source.py` makes it
from the original download:

```powershell
blender --background --disable-autoexec human_base_meshes_bundle.blend --python scripts/skeleton/prepare-source.py -- assets/skeleton/skeleton-source.blend
```

After a rebuild, run `tests/core-skeleton-skin.test.mjs` (every piece shown or named as unshown,
each sitting on its segment and following it) and `tests/core-skeleton.test.mjs` (the figure the
bind gives), then look at the skeleton in the lab and the crypt.

## Known gaps

- The hand's collider runs to the fist box's far side, about 7 cm past the drawn knuckles, so a
  punch lands ahead of the visible fist.
- An optional costume (a loincloth and belt on the pelvis, bracers, one shoulder plate) is the
  owner's call after seeing the bare bones in play; see [the roadmap](../roadmap.md).
