# The rat's art

The rat is drawn with Poly Haven's Street Rat, one mesh skinned to the rat's segments so the fur
bends at the joints. The art is cosmetic: it collides with nothing, is not pickable and decides
nothing. The rat's colliders are its segments ([the body](#the-body-fitted-to-the-art)).

## Source and licence

`assets/art/environment/rat/` is adapted from **Street Rat** by Sean Buckley, Poly Haven
(<https://polyhaven.com/a/street_rat>), released under CC0 1.0
(<https://creativecommons.org/publicdomain/zero/1.0/>): the published 2k glTF's mesh, simplified,
scaled, mirrored into the game's frame and skinned, and its 1k colour, normal and packed maps
unchanged. The art compiler serves it from this repository and makes no third-party request; Poly Haven
does not endorse the game.

## Rebuild

`node scripts/rat/build-assets.mjs` fetches the pinned published files (each one's URL and SHA-256
in the script, kept in `.cache/art/downloads/street_rat/`), and writes `rat.glb` and the three maps.
`npm run assets` then compiles them for the web (`assets/art/catalog.json`: `rat/rat.glb` and the
`rat/street_rat_*_1k.jpg` textures).

## What the file holds

`rat.glb`: one primitive, 7,410 vertices and 12,000 triangles, no material.

- **Simplified.** The published 57,216 triangles to 12,000 (`TRIANGLES`), the UV seams and
  normals weighed, within 0.04% of the mesh's extent; at 8,000 the silhouette holds but single
  triangles span the elbows and knees, which then bend coarsely.
- **Frame.** The body frame at the rat's reference pose, in the game's left-handed coordinates:
  +Y up, +Z forward, +X the body's right; the source's x is mirrored and each triangle's winding
  reversed with it. The runtime converts nothing, so a glTF viewer shows it mirrored.
- **Pose.** The head and jaw turned up .5 rad about the neck (`HEAD_RAISE`,
  `scripts/rat/landmarks.mjs`), each vertex by its head and jaw weight, as the body carries them
  ([the body](#the-body-fitted-to-the-art)). The body stands .08 m above the art (`LEG_RAISE`,
  `standing`): the trunk, head and tail raised, and each leg's bones lengthened along their axes
  from the shoulder or hip so the paw stays on the floor, keeping their thickness; a vertex moves
  by each of its segments' poses by its weight, its normal with them. The rest is the art's pose.
- **Scale.** The source's height (33.86 mm) at the rat's stature, 0.325 m, ×9.6
  (`scripts/rat/landmarks.mjs`).
- **Bones.** One a segment of `assets/rat/body.json`, named by it, each at the body frame's origin
  with an identity inverse bind.
- **Weights.** Up to four segments a vertex, in 255ths. Each segment has line pieces through the
  art's limbs with their half thickness (`influences` in the build script); a vertex's cost for a
  segment is its distance from the nearest piece less its thickness, and its weights fall off
  exponentially, 1.2 mm of the source's cost a factor of e, behind its cheapest segment's. The
  lower jaw is the chin under the snout, from 28 mm forward.

## How it rides the body

`dressSkinnedArt` (`src/render/skinned-art.ts`, the reptile's too) reads the GLB without a glTF
loader (`src/render/glb.ts`), builds a Babylon skeleton of one bone a segment, and before each
render sets each bone to its segment's reference frame inverted (`skinReference`) times the
segment's achieved transform. At the reference pose every bone is the identity and the mesh is the
art as authored. The material is the published one: the colour map, the OpenGL normal map,
occlusion, roughness and metalness packed red, green and blue, double-sided for the whiskers and
ears. A part cut off is drawn apart as the humans' skin is ([a part cut off](characters.md#how-the-core-uses-them),
`skinApart`): the mesh is split at the cut, its seam vertices drawn once on each side.

## The body fitted to the art

`node scripts/rat/fit.mjs --write` writes `assets/rat/body.json` from the art's landmarks
(`scripts/rat/landmarks.mjs`, read off orthographic views of the source mesh):

| What | From the art |
| --- | --- |
| trunk | a capsule rump to shoulders at the back's height, its radius the body's half height |
| head | a capsule behind the eyes to the snout; the neck where it leaves the shoulders |
| jaw | the hinge under the ear to the lower incisors; the reptile's teeth and mouth, scaled and tipped onto them |
| head and jaw raised | .5 rad about the neck (`HEAD_RAISE`): the art holds its mouth about .05 m off the floor, where the jaw, opened to the bite's gape, drops the incisors into it; raised, the mouth stands at about .17 m and the open incisors .09 m clear |
| legs | the shoulder or hip, elbow or knee and wrist or ankle where the legs bend, stretched to stand the body .08 m higher; bending about x |
| paws | under the ankles, the reptile's footprint (0.075 by 0.1 m), wider than the art's paws |
| tail | two capsules, root to the taper's end and on to the tip |

Joint ranges and the teeth are the reptile's; the legs' muscles and the head's and tail's weights
the rat's own: [the rat](../reference/reptile.md#the-rat).
