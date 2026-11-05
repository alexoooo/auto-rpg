# The skeleton's art

The crypt skeleton is drawn with Blender Studio's realistic human skeleton, cut into rigid pieces,
one per part of the body, each carried by the core segment its bones belong to
(`src/app/browser/render/skeleton-skin.ts`). The art is cosmetic: it collides with nothing, is not pickable
and decides nothing. The core skeleton (`src/core/bodies/human/skeleton.ts`) reads the art's bind,
`assets/skeleton/bind.json`, and its bones' measure, `assets/skeleton/bones.json`
(`scripts/skeleton/bone-fit.mjs`). `bind.json` is fixed: nothing regenerates it, and moving a
joint means refitting the art as well.

## Source and licence

`assets/art/environment/skeleton/skeleton.glb` is adapted from the "Skeleton - Realistic" collection of
Blender Studio's Human Base Meshes bundle, v1.4.1 (`human_base_meshes_bundle.blend`, from
<https://download.blender.org/demo/asset-bundles/human-base-meshes/>), released under CC0 1.0
(<https://creativecommons.org/publicdomain/zero/1.0/>).
The adaptation groups the bones by part, fits them onto the parts' joints, closes the hands into
fists, and bakes occlusion and grime into vertex colours. There is no texture. The GLB is compiled
losslessly to web delivery from this repository and makes no third-party request; Blender Studio
does not endorse the game.

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
  fingers) split that same hand. The game shows the split pair and not the whole hand.
- **Eyes.** `head.head` carries `extras.eyes`, the eye sockets' centres in the head's frame.
- **Colour.** Occlusion and grime are baked into `COLOR_0`.

## Rebuilding the GLB

Blender 4.5 LTS, from the repository root. The build starts from the checked-in, stripped source:

```powershell
blender --background --disable-autoexec assets/skeleton/skeleton-source.blend --python scripts/skeleton/build-assets.py -- assets/skeleton/bind.json assets/art/environment/skeleton/skeleton.glb .tmp/skeleton
```

The last argument is optional; with it the script also renders front, side, three-quarter, hand
and skull previews over the part boxes to `.tmp/skeleton/skeleton-*.png`. The part map (which source
bones go on which part), the landmarks each fit uses and the finger curl (`CURL`) are data at the
top of their sections in `scripts/skeleton/build-assets.py`.

`assets/skeleton/skeleton-source.blend` is the bundle reduced to the skeleton collection, with its
mirror modifiers applied and subdivision removed. `scripts/skeleton/prepare-source.py` makes it
from the original download:

```powershell
blender --background --disable-autoexec human_base_meshes_bundle.blend --python scripts/skeleton/prepare-source.py -- assets/skeleton/skeleton-source.blend
```

After a rebuild, run `node scripts/skeleton/bone-fit.mjs --write` and look at the skeleton in the
lab and the crypt.

## Where the art and the colliders differ

The colliders are convex: a hull spans the gaps between the ribs, the pelvis's basin and the
femur's neck, so a blow meets them where the drawn bone shows a gap. The shanks' capsules are rounder
than the tibia, and the foot's box squarer than its bones.
