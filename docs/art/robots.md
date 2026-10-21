# Warrior robot shells

Industrial, Steampunk and Futuristic are cosmetic appearances of the Warrior, offered in the Arena
and the Lab. They keep his body, colliders, joints, muscles, held items and damage rules: a
metal-looking plate gives no metal contact, armour or sound. Their appearance IDs are
`industrial`, `relic` (Steampunk) and `duelist` (Futuristic). Everything is generated in code,
with no external asset.

## Construction

`src/render/robot-skin.ts` builds each rigid piece in a core segment's local frame and parents it
to that segment's node: no rig retargeting, no transform copying, no physics objects, nothing
pickable. A detached segment keeps its shell. Each builder owns its silhouette and palette; the
shared renderer owns attachment, batching by segment and finish, disposal and the fingers. An
instance owns its PBR materials and meshes and never disposes another body's.

- **Fit.** The shells are sized from the built body: segment lengths, capsule radii, foot boxes
  and the trunk hull's bounds. Three trunk housings leave room for the spine, joined by a central
  frame and spindles; plates narrow toward the limbs' distal ends.
- **Fingers.** The hand's knuckle and little-finger landmarks place three equal links a finger,
  kept as separate meshes. A finger on a held item follows a semicircle about the item's origin,
  at the grip radius plus a quarter of the hand's capsule radius; a free one goes from relaxed to
  a fist on the same closure input as the human skin. It is drawn, not a simulated grasp.

## The three designs

Every proportion below is an authored art choice, not anatomy or a solver measurement.

### Industrial

`industrialRobot` uses box housings with eight-sided cross sections and bevels one tenth of the
smallest dimension. The distal taper is 0.90, limb coverage 0.84 and corner cut 0.12. Limb housings
are 1.76 radii wide and 1.65 radii deep; trunk width is 0.86 of its envelope, depth 0.80 and height
0.84 of segment length. The head has one circular lens, and the abdomen has three straight bars.
`tests/robot-skin.test.mjs` holds this design, its palm and finger poses included, to a recorded
fingerprint (Node stand, Rapier, unstepped Warrior).

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
along the foot, so the sole stays under the whole foot.

| Finish | Color | Metallic | Roughness | Emission |
|---|---|---:|---:|---:|
| Frame | `#17222e` | 0.42 | 0.43 | 0 |
| Plate | `#d6e1e5` | 0.12 | 0.27 | 0 |
| Edge | `#506f82` | 0.64 | 0.32 | 0 |
| Glass | `#071b29` | 0.35 | 0.14 | 0 |
| Light | `#29cfe5` | 0.05 | 0.32 | 0.60 |

## Checking

`tests/robot-skin.test.mjs` checks attachment, independent ownership, grip geometry, unchanged
ordered-bout snapshots, and a geometry-and-material fingerprint of Industrial (Node stand, Rapier,
120 Hz). The browser check exercises the selectors, previews, paused playback, Tactical view and
replacement without rebuilding a body, and writes screenshots under `.review/robots/`:

```powershell
npm exec --yes --package=playwright -- node scripts/robot-browser-check.mjs http://127.0.0.1:5188
```

The geometric tests do not judge silhouette, lighting or panel intersections: look at the
screenshots and at the shells in motion.
