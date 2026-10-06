# Warrior robot shells

Industrial, Steampunk and Futuristic are cosmetic appearances of the Warrior. They use his body,
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
separate so they can curl. Each instance owns its PBR materials and its meshes; disposing it
never disposes another body's materials or the segment nodes.

The hand's knuckle and little-finger landmarks locate the fingers. Occupied fingers close around
the held item's actual origin and grip radius. Their three equal links follow a semicircle
around the handle; their centreline radius is the grip radius plus a quarter of the hand's
capsule radius. Unoccupied fingers interpolate from a relaxed pose to a fist using the same
closure input as the human skin. This is visual articulation, not a simulated grasp.

## Design choices

These are authored art choices for the owner's requested robot shells, not anatomical or solver
measurements. Independent builders own each silhouette and palette; the shared renderer owns
attachment, geometry batching, disposal and finger articulation. The stable appearance IDs are
`industrial`, `relic` (Steampunk) and `duelist` (Futuristic), so existing links retain their choices.

### Industrial

`industrialRobot` uses box housings with eight-sided cross sections and bevels one tenth of the
smallest dimension. The distal taper is 0.90, limb coverage 0.84 and corner cut 0.12. Limb housings
are 1.76 radii wide and 1.65 radii deep; trunk width is 0.86 of its envelope, depth 0.80 and height
0.84 of segment length. The head has one circular lens, and the abdomen has three straight bars.
The recorded geometry-and-material fingerprint in `tests/robot-skin.test.mjs` holds this design
including its palm and finger poses (Node stand, Rapier, unstepped Warrior).

| Finish | Color | Metallic | Roughness | Emission |
|---|---|---:|---:|---:|
| Frame | `#242d33` | 0.78 | 0.58 | 0 |
| Plate | `#9c7439` | 0.22 | 0.48 | 0 |
| Edge | `#70797c` | 0.78 | 0.48 | 0 |
| Light | `#ffb64b` | 0.10 | 0.48 | 0.75, unlit |

### Steampunk

`steampunkRobot` builds an oval boiler chest with brass bands, a round dial and routed pipes.
Its head is a brass dome with twin green optics. Five iron bellows form the abdomen, cylindrical
copper housings leave room for side pistons, and rounded copper boots sit on dark soles. Pipes
belong entirely to one segment; no decorative pipe restrains or spans a physical joint.

The chest fills 0.91 of its envelope width, 0.87 of depth and 0.83 of segment length; the widest
limb section spans 1.72 radii, with exposed joints at either end. Profiles and the remaining
fittings use fractions of these dimensions, allowing the pressure-vessel silhouette to remain
recognizable at Arena distance.

| Finish | Color | Metallic | Roughness | Emission |
|---|---|---:|---:|---:|
| Frame | `#272b29` | 0.68 | 0.54 | 0 |
| Plate | `#914827` | 0.72 | 0.38 | 0 |
| Edge | `#b48a43` | 0.80 | 0.32 | 0 |
| Glass | `#173b38` | 0.30 | 0.18 | 0 |
| Light | `#ffc66b` | 0.10 | 0.36 | 0.45 |

### Futuristic

`futuristicRobot` builds a continuous visor, a swept chest with a narrow cyan chevron, three
interleaved abdominal shells, split hip armour and teardrop limb plates around round graphite
joints. Smooth cross sections and tapered boots distinguish it from both the box housings and
pressure vessels. The body uses satin white ceramic with restrained cyan details.

The chest fills 0.94 of its envelope width, 0.87 of depth and 0.87 of segment length. Limb plates
reach 1.87 radii at their widest point and taper to 0.39 radii near their distal end. Elliptical
profiles use 24 sides; spheres use 12 segments. Foot profiles rise along local -z, with local y
along the foot, so the sole stays under the whole foot. The local profile and trim fractions
are art proportions, not changes to anatomy.

| Finish | Color | Metallic | Roughness | Emission |
|---|---|---:|---:|---:|
| Frame | `#17222e` | 0.42 | 0.43 | 0 |
| Plate | `#d6e1e5` | 0.12 | 0.27 | 0 |
| Edge | `#506f82` | 0.64 | 0.32 | 0 |
| Glass | `#071b29` | 0.35 | 0.14 | 0 |
| Light | `#29cfe5` | 0.05 | 0.32 | 0.60 |

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
