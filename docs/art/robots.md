# Warrior robot shells

Industrial, Relic and Duelist are cosmetic appearances of the Warrior. They use his body,
colliders, joints, muscles, held items and damage rules. Metal-looking plates do not confer metal
contact behavior, armour or a different sound. The Arena and Lab offer these appearances; the
Dungeon and authored-animation character workshop keep their existing choices.

## Construction

`src/render/robot-skin.ts` generates the meshes without external assets. Each rigid piece is
authored in a core segment's local frame and parented to that segment's node. There is no rig
retargeting and no transform-copying observer for rigid pieces. A detached segment keeps its
shell. The renderer creates no physics objects and its meshes are not pickable.

The fitting measurements are the built body's segment lengths, capsule radii, foot boxes and
trunk hull bounds. Three separate trunk housings leave room for the spine; a central frame and
spindles connect their joint locations. Plates narrow towards the distal ends of the limbs.
Bearings, trim and housings are combined into one mesh per segment and finish. Finger links stay
separate so they can curl. Each instance owns four PBR materials and its meshes; disposing it
never disposes another body's materials or the segment nodes.

The hand's knuckle and little-finger landmarks locate the fingers. Occupied fingers close around
the held item's actual origin and grip radius. Their three equal links follow a semicircle
around the handle; their centreline radius is the grip radius plus a quarter of the hand's
capsule radius. Unoccupied fingers interpolate from a relaxed pose to a fist using the same
closure input as the human skin. This is visual articulation, not a simulated grasp.

## Design choices

These are authored art choices for the owner's requested robot shells, not anatomical or solver
measurements. `DESIGNS` holds the differences:

| Shell | Plate / trim / light | Distal taper | Limb coverage | Corner cut | Roughness |
|---|---|---:|---:|---:|---:|
| Industrial | `#9c7439` / `#70797c` / `#ffb64b` | 0.90 | 0.84 | 0.12 | 0.48 |
| Relic | `#393e42` / `#a9844e` / `#ffc26b` | 0.78 | 0.90 | 0.22 | 0.40 |
| Duelist | `#bbc5c5` / `#71828c` / `#9de1e3` | 0.66 | 0.69 | 0.28 | 0.32 |

Industrial uses a box sensor head and round lens. Relic adds an arched helmet, ridge and narrow
visor. Duelist uses a tapered faceplate with less limb coverage. The common frame is `#242d33`,
metallicity 0.78 and roughness 0.58. Painted plates use metallicity 0.22; Relic's plates keep 0.78.
Indicator materials are unlit so a small colored indicator remains readable under different
lighting. Cylinders have sixteen sides; housings have eight-sided cross sections and end bevels
one tenth of their smallest dimension. Each housing face retains a flat normal.

Fitting ratios leave clearance: limb housings are 1.76 radii wide and 1.65 radii deep; the trunk's
plate width is 0.86 of its envelope width, depth 0.80 of envelope depth and height 0.84 of segment
length. Foot housings stay within the foot box. The remaining trim and sensor dimensions in the
builder are proportions of these fitted housings. They affect only the drawing.

## Appearance ownership and checking

`appearance.ts` owns compatibility and labels. `dresserFor` resolves assets and returns a factory
whose per-instance inputs are body, clothing and hand closure. Human assets are cached per scene;
clothing and closure are never captured by an asset cache. `skinSlot` owns replacement in the Lab
and previews, discarding stale requests and applying current clothing and visibility to a newly
loaded instance. Arena fights use the same factory. Clothing is hidden while a shell is selected,
and its values are retained for returning to the original skin.

`tests/robot-skin.test.mjs` checks attachment, independent ownership, grip geometry and unchanged
ordered-bout snapshots (Node stand, Rapier, 120 Hz). Address and replacement tests cover URL
compatibility, asynchronous loading and disposal. The production browser check exercises the
selectors, previews, paused playback, Tactical view and replacement without rebuilding a body:

```powershell
npm exec --yes --package=playwright -- node scripts/robot-browser-check.mjs http://127.0.0.1:5188
```

It writes screenshots under `.review/robots/`. Review those alongside actual movement; geometric
attachment tests do not judge silhouette, lighting or panel intersections.
