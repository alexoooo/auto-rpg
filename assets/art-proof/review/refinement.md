# Stone and bronze refinement — 2026-09-18

The golem now uses narrow chamfers, four varied inward chips on eligible stone blocks,
angular mineral fractures with per-part UV offsets, and turned bronze covers with shallow
cap recesses and stepped rims. Corner-domain vertex colors darken the grooves without
darkening the cap centers. The metal blade has a narrower bevel and directional roughness.
The rune emission is warmer and stronger; pavement roughness and normals are independent
of the walls. Light placement and exposure are unchanged. Shadow bias was adjusted to
remove diagonal self-shadow striping exposed by the flat stone faces.

New normal and ORM images are saved as non-color data. Existing environment textures stay
on walls and braziers. Six additional 2K maps bring the art-proof asset payload to
33,992,977 bytes (excluding engine, Havok, and the shared environment HDR).

## Geometry and correctness

- 61 visible pieces and 631 scene meshes, unchanged.
- Golem geometry: 16,472 → 16,632 triangles, a 0.97% increase; below the 20% budget.
- 193 meshes with physics bodies, unchanged. Collision shapes and control are untouched.
- Imported vertex colors are explicitly opaque: glTF's default vertex-alpha flag otherwise
  excludes these bronze pieces from depth and shadow passes despite all colors having alpha 1.
- Bounds, outward winding, opaque rendering, attachment coverage, 48-second stability, and
  original/modeled physical-equivalence checks pass against the exported GLB.
- Type checking and production build pass. Full suite: 544/547 pass, with the same three
  pre-existing failures documented in `validation.md`. The targeted asset suite passes after
  the final shading and opacity changes.

## Visual comparisons

`refine-before-{front,rear,left,right,close}.jpg` and the matching `refine-after-*` images
are direct 1920×1080 browser captures. Both use simulation time 3 seconds, camera target
(0, 1.15, 0), beta 1.16, radius 4.7 (2.9 for close), and alpha -π/2 + 0.4 plus
0 / π / -1.4 / +1.4 / 0 respectively. No retouching or Blender beauty renders.

Front, rear, and side inspection confirms solid limbs and caps, readable cap grooves,
and intact joint clearance. The darker stone fissures are deliberately subtle at arena
distance and more visible close up. This is a refinement of the running game model,
not a claim of matching the reference render's cinematic lighting or depth of field.

## Performance limitation

Production preview, Chrome 153 / Intel Iris Xe, 1920×1080, the same camera and motion:

| Run | Duration | Frame intervals | Median | p95 | Draw calls |
|---|---:|---:|---:|---:|---:|
| Before refinement | 60.0865 s | 795 | 54.9 ms | 187.5 ms | 152 |
| Final opaque rendering | 62.6473 s | 43 | 1151.1 ms | 2421.7 ms | 152 |

The measured final run fails the 10% frame-pacing target. Both runs reported a visible tab,
but browser pacing became unstable during this session: a subsequent fresh navigation and
paused simulation still reported roughly 0.4–1 fps, while an explicit frozen render plus
WebGL completion took 58.1 ms. This is insufficient evidence to attribute the slowdown to
the asset change or to rule out a regression. The frame-pacing budget remains **unverified**
and needs an isolated rerun; no claim of a speedup or 60 fps is made. An intermediate result
with incorrectly transparent bronze was discarded because it omitted their shadow/depth work.

The reliable structural measurements are unchanged draw calls and physics bodies, 0.97% more
golem triangles, and six additional 2K texture maps. The extra texture memory is a real cost.
