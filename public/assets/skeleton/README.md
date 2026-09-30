# Skeleton

`skeleton.glb` is adapted from the "Skeleton - Realistic" collection of Blender Studio's Human
Base Meshes bundle, v1.4.1, released under CC0 1.0
(<https://creativecommons.org/publicdomain/zero/1.0/>). The bones are grouped by part, fitted onto
the crypt skeleton's joints, the hands closed into fists, and occlusion and grime baked into vertex
colours. The file is served from this repository and makes no third-party request; Blender Studio
does not endorse this game.

It holds one rigid piece per part of the body, in that part's frame and the game's left-handed
coordinates. `src/render/skeleton-skin.ts` reads it and carries each piece on the core segment
its bones belong to. `scripts/skeleton/build-assets.py` rebuilds it from
`assets/skeleton/skeleton-source.blend` and `assets/skeleton/bind.json`. What the file holds, how
it rides the core and how to rebuild it: [docs/art/skeleton.md](../../../docs/art/skeleton.md).
