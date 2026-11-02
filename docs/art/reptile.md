# The reptile's art

The reptile is drawn with a photogrammetry scan of a Japanese grass lizard, posed as the reptile
stands and skinned to its segments so the scales bend at the joints. The art is cosmetic: it
collides with nothing, is not pickable and decides nothing. The reptile's colliders are its
segments ([the body](#the-body-fitted-to-the-art)).

## Source and licence

`assets/art/environment/reptile/` is adapted from **CC0 Japanese grass lizard** by ffish.asia /
floraZia.com, on Sketchfab
(<https://sketchfab.com/3d-models/cc0-japanese-grass-lizard-8ec4811184f34fc5b6699eca34008f68>),
released under CC0 1.0 (<https://creativecommons.org/publicdomain/zero/1.0/>): the published scan's
mesh posed, shortened, decimated, mirrored into the game's frame and skinned, and its photographs
baked onto new texture coordinates. The art compiler serves it from this repository and makes no
third-party request; the authors do not endorse the game.

Sketchfab serves the download only to a signed-in account, so the rebuild does not fetch it: its
**gltf, Original** download (`cc0-japanese-grass-lizard.zip`, 91,492,712 bytes) is placed by hand in
`.cache/art/downloads/grass_lizard/`, and `scripts/reptile/source.mjs` checks it against its
SHA-256 and reads the scan from it.

## Rebuild

`node scripts/reptile/build-assets.mjs` poses the scan, decimates it and bakes its look in Blender
4.5 (`scripts/reptile/retopo.py`, the pinned Blender of `scripts/art/tools.mjs`; work files in
`.cache/art/build/reptile/`), and writes `reptile.glb` and the two maps. `npm run assets` then
compiles them for the web (`assets/art/catalog.json`: `reptile/reptile.glb` and the
`reptile/grass_lizard_*_1k.jpg` textures). The body is fitted to the same pose by
`node scripts/reptile/fit.mjs --write`; run it first when the pose changes, since the skin's
weights read the body's segment names.

## What the file holds

`reptile.glb`: one primitive, 25,390 vertices and 19,981 triangles, no material;
`grass_lizard_diff_1k.jpg`, its colour, and `grass_lizard_nor_gl_1k.jpg`, its OpenGL normal map.

- **Posed** (`scripts/reptile/pose.mjs`). The scan (383,771 triangles, its body and tail two
  parts) lies curled, its legs splayed unevenly. Its spine is traced (per slice along the body,
  the dorsal ridge and the mid height, smoothed) and straightened; each leg turns rigidly with its
  girdle's spine and is set by two links, symmetric (the two sides' average) and wide, every paw
  .26 m from the middle; the body stands until its front leg reaches .95 of its length
  (`EXTEND`). A vertex blends what the spine and its nearest leg bones do to it, by its distance
  from each.
- **Tail.** Behind the vent, .28 of the scan's length (`TAIL`), lowered toward the floor: the
  footprint the Crypt places packs by ([the grass lizard](../reference/reptile.md#the-grass-lizard)).
- **Decimated and baked.** The scan's own texture seams stop a simplifier near 106,000 triangles,
  and relaxing them scrambles its photographs. Blender collapses the posed scan to 20,000
  triangles (`TRIANGLES`), unwraps it afresh, and bakes the full scan's colour (no lighting) and
  tangent-space normals onto it at 2048 pixels; the maps are written at 1024 (`MAP`).
- **Frame.** The body frame at the reptile's reference pose, in the game's left-handed
  coordinates: +Y up, +Z forward, +X the body's right, the origin midway between the girdles. The
  scale keeps the front leg's reach, girdle to wrist, at .2715 m (`REACH`). Blender's copy is
  right-handed; the skin step mirrors x and reverses each triangle's winding, so a glTF viewer shows
  it mirrored, and the normal map's x is inverted where it is drawn.
- **Head.** The head and jaw turned up .3 rad about the neck (`HEAD_RAISE`), each vertex by its
  head and jaw weight, as the body carries them.
- **Bones.** One a segment of `assets/reptile/body.json`, named by it, each at the body frame's
  origin with an identity inverse bind.
- **Weights.** Up to four segments a vertex, in 255ths. Head, trunk and the tail's two segments
  each take a span of the centreline (the tail's base from the vent to .4 of the tail), the legs
  their posed pieces, the paw a fan of five toward the toes; a vertex's cost for a segment is its
  distance from the nearest piece less its thickness, and its weights fall off exponentially,
  .0094 m of cost a factor of e, behind its cheapest segment's. The jaw takes, out of the head's
  share, what lies below the mouth's line and ahead of the hinge.

## How it rides the body

As the rat's ([how it rides the body](rat.md#how-it-rides-the-body)): `dressSkinnedArt`
(`src/render/skinned-art.ts`) sets each bone to its segment's reference frame inverted times the
segment's achieved transform. The material is non-metallic at roughness .55, its colour and normal
maps the baked ones, double-sided.

## The body fitted to the art

`node scripts/reptile/fit.mjs --write` writes `assets/reptile/body.json` from the posed lizard:

| What | From the art |
| --- | --- |
| trunk | a capsule from the vent to the shoulders, inside the body's ends, its radius the body's half height midway |
| head | a capsule behind the eyes to the snout, radius .035 m |
| jaw | the hinge where the mouth's line ends to the lower jaw's tip; the authored teeth and mouth, scaled and tipped onto them |
| head and jaw raised | .3 rad about the neck (`HEAD_RAISE`) |
| legs | the posed girdle, elbow or knee and wrist or ankle; each elbow and knee bends about its leg's plane's normal |
| paws | under the ankles, the authored footprint |
| tail | two capsules resting on the floor by their radius: vent to .4 of the tail, and on to the tip |

Masses, torques, joint ranges and the teeth are the authored quadruped's, but for a light tail:
[the grass lizard](../reference/reptile.md#the-grass-lizard).
