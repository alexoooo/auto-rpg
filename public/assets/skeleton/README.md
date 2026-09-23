# Skeleton

`skeleton.glb` is adapted from the **"Skeleton - Realistic"** collection of **Human Base Meshes
v1.4.1** by **Blender Studio**.

- Source: https://developer.blender.org/docs/features/asset_system/asset_bundles/human_base_meshes/ (download: https://download.blender.org/demo/asset-bundles/human-base-meshes/, `human_base_meshes_bundle.blend`; the skeleton was added in v1.4.0)
- Licence: **CC0 1.0 Universal**, https://creativecommons.org/publicdomain/zero/1.0/
- Adaptation: the bones are grouped by physics part, fitted onto the game skeleton's joints, the
  hands closed into fists, and shaded with baked occlusion and grime in vertex colours.

The GLB is served locally. Loading it needs no Blender installation and makes no third-party
request. Blender Studio does not endorse this game.

## What the file holds

The file has one mesh per physics part, named by its template key: `legs.pelvis`, `legs.thighL`,
`trunk.core`, `head.head`, `primary.upperArm`, `secondary.wrist.bare`, and so on. The runtime
parents each mesh at the identity transform to the hidden collider of that part.

- **Coordinates.** Vertices are in the host's local frame, in the game's own **left-handed**
  coordinates: +Y up, +Z forward, +X the body's right. The runtime therefore converts nothing, but a
  standard glTF viewer shows the model mirrored. `extras.frame` records this.
- **Wrist and fist pieces.**
  - `*.wrist` is the whole closed hand, for an arm that holds a weapon.
  - `*.wrist.bare` and `*.fist` split that same hand for the fist terminal. The palm rides the wrist
    link and the fingers ride the fist, so a severed fist takes its fingers with it.
- **Roll ring.** The `*.rollRing` part has no piece. The radius and ulna already span it.
- **Eyes.** `head.head` carries `extras.eyes`, the two eye-socket centres in the head's frame. The
  rune eyes are moved there.
- **Colour.** Occlusion and grime are baked into `COLOR_0`. The material is the scene's own
  `palette.bone`.

Only Blender and the importer in `src/golem/skeleton/appearance.ts` read this subset.

## Rebuild

The rebuild uses Blender 4.5 and starts from the checked-in, stripped source:

```powershell
node scripts/skeleton/export-bind.mjs assets/skeleton/bind.json
blender --background --disable-autoexec assets/skeleton/skeleton-source.blend --python scripts/skeleton/build-assets.py -- assets/skeleton/bind.json public/assets/skeleton/skeleton.glb .review
```

The last argument is optional. With it, the script also renders front, side, three-quarter, hand
and skull previews, drawn over the collider boxes, to `.review/skeleton-*.png`.

`assets/skeleton/skeleton-source.blend` is the bundle reduced to the skeleton collection, with its
MIRROR modifiers applied and SUBSURF removed. `scripts/skeleton/prepare-source.py` reproduces it
from the original download:

```powershell
blender --background --disable-autoexec human_base_meshes_bundle.blend --python scripts/skeleton/prepare-source.py -- assets/skeleton/skeleton-source.blend
```

The part map (which source bones go on which physics part), the landmarks each fit uses, and the
finger curl are all data at the top of the sections in `scripts/skeleton/build-assets.py`.
