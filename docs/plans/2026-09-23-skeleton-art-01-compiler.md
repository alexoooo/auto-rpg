# Skeleton art -- 01 compiler

Landed as 9bc528f. No runtime change. See `-00-overview.md` for the part map.

## What it does

1. `scripts/skeleton/export-bind.mjs` builds a skeleton at the origin, facing 0, in
   `createHeadlessArena`, for `skeletonSetup("fist", "fist")` and `skeletonSetup("blade", "maul")`,
   and writes every visual part's host position, rotation and local bounding box to
   `assets/skeleton/bind.json`.
2. `scripts/skeleton/prepare-source.py` reduces the Human Base Meshes bundle to the "Skeleton -
   Realistic" collection. It makes shared meshes single-user (a MIRROR on multi-user data will not
   apply), applies MIRROR, removes SUBSURF and clears materials, then saves
   `assets/skeleton/skeleton-source.blend`.
3. `scripts/skeleton/build-assets.py` runs in Blender on that file:
   - `load` maps Blender to game coordinates, `(-(x - SX), z, -y)`. This is a reflection, and it
     is applied to every bone alike.
   - A source object whose world matrix is itself a reflection has its triangles reversed as well.
     The right side's bones are the left's meshes under a negative object scale. This step was
     added in session 02, after the winding test found every right-side piece inside out.
   - Pieces are fitted by landmark:
     - Pelvis: femoral heads to the hip joints, with a width-only stretch.
     - Long bones: joint to joint, along the host's Y.
     - Ribcage: humeral heads to the shoulders.
     - Skull: its top at 1.62, over C1.
     - Feet: the talus over the ankle, with the sole on the floor.
   - The hand is closed into a fist. The thumb is folded, then each phalanx is rotated about the
     head of the bone before it. The hand is fitted onto the wrist joint with the palm facing
     medially.
   - Occlusion comes from 20 hemisphere rays per vertex, and grime from fractal noise. Both are
     baked into `COLOR_0`.
   - The GLB is written by hand, one mesh per key. `head.head` carries `extras.eyes`, the orbit
     centres in the head's frame.
   - An optional third argument renders Workbench previews to `.review/`. Workbench does not cull
     back faces, so a preview cannot show a winding defect. `tests/skeleton-art.test.mjs` does.

## Rebuild

`public/assets/skeleton/README.md` gives the commands. The result is 2,661,340 bytes and 57,665
vertices per full set.
