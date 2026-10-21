# Skeleton

`skeleton.glb` is adapted from the "Skeleton - Realistic" collection of Blender Studio's Human
Base Meshes bundle, v1.4.1, released under CC0 1.0
(<https://creativecommons.org/publicdomain/zero/1.0/>): the bones grouped by part and fitted onto
the crypt skeleton's joints, the hands closed into fists, occlusion and grime baked into vertex
colours. It is served from this repository and makes no third-party request; Blender Studio does
not endorse this game.

`src/render/skeleton-skin.ts` carries each piece on its core segment.
`scripts/skeleton/build-assets.py` rebuilds it from `assets/skeleton/skeleton-source.blend` and
`assets/skeleton/bind.json`. What the file holds and how to rebuild it:
[docs/art/skeleton.md](../../../docs/art/skeleton.md).
