# The skeleton's art

The crypt skeleton is drawn with Blender Studio's realistic human skeleton, cut into rigid pieces,
one per part of the body, each carried by the core segment its bones belong to. The art is
cosmetic: it collides with nothing, is not pickable and decides nothing. The skeleton's colliders
are its core segments, which stay thin by the owner's choice, so a blow that passes between the
drawn ribs still meets the trunk.

## Source and licence

`assets/art/environment/skeleton/skeleton.glb` is adapted from the "Skeleton - Realistic" collection of
Blender Studio's Human Base Meshes bundle, v1.4.1 (`human_base_meshes_bundle.blend`, from
<https://download.blender.org/demo/asset-bundles/human-base-meshes/>), released under CC0 1.0.
The adaptation groups the bones by part, fits them onto the parts' joints, closes the hands into
fists, and bakes occlusion and grime into vertex colours. There is no texture. The GLB is compiled
losslessly to web delivery
from this repository and makes no third-party request; Blender Studio does not endorse the game.

## What the file holds

One mesh per part, named by the part's key: `head.head`, `head.neck`, `trunk.core`,
`trunk.waist`, `legs.pelvis`, `legs.thighL` and `R`, `legs.shinL` and `R`, `legs.footL` and `R`, `primary.collar`,
`primary.upperArm`, `primary.forearm`, `primary.wrist`, `primary.wrist.bare`, `primary.fist`, and
the same for `secondary`. `primary` is the body's right (+X), `secondary` its left; a leg's `L` is
-X.

- **Frame.** A piece's vertices are in its part's own frame, in the game's left-handed
  coordinates: +Y up, +Z forward, +X the body's right. The runtime converts nothing, so a standard
  glTF viewer shows the model mirrored; `extras.frame` says so.
- **Winding.** Triangles wind the way Babylon's `MeshBuilder` winds them. The source's right-side
  bones are the left's meshes under a negative scale, a reflection, so the compiler reverses their
  triangles; a piece that skips this draws inside out, which a Blender Workbench preview does not
  show.
- **Hands.** `*.wrist` is the whole closed hand. `*.wrist.bare` (the palm) and `*.fist` (the
  fingers) split that same hand. The game shows the split pair and not the whole hand
  (`SKELETON_UNSHOWN`).
- **Eyes.** `head.head` carries `extras.eyes`, the eye sockets' centres in the head's frame.
- **Colour.** Occlusion and grime are baked into `COLOR_0`.

## How it rides the core

The core skeleton (`src/core/human/skeleton.ts`, model `crypt-skeleton`) is built by the human
body-plan code from a figure read out of the art's bind, `assets/skeleton/bind.json`: for each
part, its position and turn in the body frame and its box in its own frame, as the art was fitted
to it. `skeletonFigure` takes the rows of the fist build:

- the joint centres are the parts' ends along each part's y (the thigh's top is the hip, the
  upper arm's bottom the elbow, the neck's bottom the cervicale);
- the body is its bones ([below](#the-body-fitted-to-the-bones));
- what the bones do not give (strength tables, hit points, balance, the fists' turn) is a named
  placeholder, `skeleton-placeholders` in `SOURCES`.

The skeleton's reference pose is the bind itself: standing, elbows at a right angle, forearms
forward, fists thumb up. Postures are joint angles measured from each body's reference pose, so a
posture written for the humans (`GUARD`) bends the skeleton's elbows into their stops.

`src/render/skeleton-skin.ts` draws it. `parseSkeletonArt` reads the GLB's meshes directly (no
glTF loader); `loadSkeletonArt` fetches it once per page. `SKELETON_PIECES` names the segment that
carries each piece: the neck rides the head; the ribcage and both collars the upper trunk; the
lumbar spine the middle trunk; the pelvis the lower trunk; the palm and the fingers the hand; the
arm and leg pieces their own segments. The forearm's roll ring has no piece: the radius and ulna
span it. `piecesOnSegments` holds each piece at its bind relative to its segment's reference
frame, so at the reference pose every piece is exactly where it was authored. `dressSkeleton`
builds the meshes with their own bone and rune materials, sets each piece from its segment's
`position` and `rotationQuaternion` before every render, and places small rune spheres in the eye
sockets. The arena (`src/arena/main.ts`), the crypt (`src/dungeon/main.ts`) and the lab
(`src/lab/main.ts`) all dress the skeleton this way.

`bind.json` is fixed: nothing in the repository regenerates it, and both the art and the core
skeleton read it. Moving a joint means refitting the art as well.

## The body fitted to the bones

The owner's decision (`owner-skeleton-body`, 2026-10-29): human-shaped, 15 kg, its body fitted to
its bones, approximate and low-polygon. `scripts/skeleton/bone-fit.mjs --write` measures the art
at its bind and writes `assets/skeleton/bones.json` (`skeleton-bones`); `skeletonFigure` reads it
into the figure's `fitted` segments, and the human body plan (`src/core/human/segments.ts`) builds
from it:

| What | From the bones |
| --- | --- |
| Mass | 15 kg in men's shares (de Leva's): the walk carries them ([below](#mass-in-the-bones-shares)) |
| Centre of mass, inertia | the bones' solid's centroid and spread about the segment's axes, at the segment's mass |
| Head, upper arms, forearms, thighs | the hull of the bones' farthest vertices along 42 directions (30 to 39 corners, about 90 % of the bones' whole convex hull) |
| Trunk | the same hulls: the ribcage with the collars and shoulder blades, the lumbar spine, the pelvis |
| Shanks | capsules as wide as the bones' spread (2.9 cm): a knee bears on a shank's end in the rise |
| Hands | open or a fist, the closed hand's hull, the art's hand being always closed; it bears at the palmar patch and strikes where the line from the wrist through the middle knuckle leaves it; the grip's capsule is as wide as the bones' spread (3.4 cm) |
| Feet | the box on the foot bones, heel to toe |

Its strength is men's at the body's 15 kg, so each torque is 15/79 of the typical man's at the same
reach, driven by [motors](#motors-not-muscles). Its standing centre of mass is 0.85 m up, the Warrior's 1.01.

Asked to crouch 0.43 m or more (`Intent.lower`), it folds at the hips until its ribcage rests on its
thighs, its head under its pelvis, and does not settle; at 0.35 m it holds. Its foot's heel, the
bones', is 5 cm behind the ankle (the bind's box: 7.7).

Weight x1.1 fits; at x1.2 the broadened pelvis meets a forearm, and the character resolver
refuses it.

### Mass in the bones' shares

Tried and not kept: each segment's share of the 15 kg as its bones' share of their solid volume
(5.78 l, 2.6 g/cm3): head 16 %, upper trunk 19 %, middle trunk 2.8 %, pelvis 15 %, each upper arm
3.3 %, forearm 2.4 %, hand 1.0 %, thigh 6.7 %, shank 7.0 %, foot 3.4 %. In bouts on the Node stand
(Rapier, 120 Hz, `duellist` both sides, 12 s, gaps 3 to 6 m, against the Warrior and a skeleton),
it fell before any contact in 2 of the 8 starts, walking in, at 3.5 and 3.9 s, drifting sideways
until it went over; with men's shares and the bones' centres and inertia, in none. The old skeleton
(a 79 kg man on the bind's boxes) fell in none of the six 15 s bouts at 3 to 5 m, the bones' shares
in five (two before contact), men's shares in three (all after contact).

## Motors, not muscles

The owner's decision (`owner-skeleton-motor`, 2026-10-29): the skeleton's joints are robot-like
motors. `skeletonMotors` (`src/core/human/skeleton.ts`) turns each freedom's muscle into one
motor, still driven by the muscle driver:

| What | Muscle (the humans) | Motor (the skeleton) |
| --- | --- | --- |
| Peak | each side its own | the stronger side's, both ways |
| Torque with speed | Hill's hyperbola, curvature 0.25 (Thelen's) for most | a straight line, curvature 1000 |
| Unloaded speed | each side its own, 34 to 68 rad/s | the speed at which the line gives the muscle's peak power, 0.38 of the muscle's at curvature 0.25: 9.4 to 26 rad/s |
| Turned back | up to 1.4 x the peak | no more than the peak |
| Tendons | none | none |

| Joint | Peak, N m | Unloaded speed, rad/s |
| --- | --- | --- |
| Neck flexion | 10.1 | 26.0 |
| Thoracic flexion | 24.1 | 26.0 |
| Shoulder flexion | 18.7 | 19.8 |
| Elbow flexion | 14.3 | 24.4 |
| Hip flexion / abduction | 103.1 / 109.8 | 20.6 |
| Knee flexion | 77.7 | 23.1 |
| Ankle dorsiflexion | 79.4 | 15.3 |

In bouts on the Node stand (Rapier, 120 Hz, `duellist` both sides, 15 s, gaps 3 to 6 m, against
the Warrior and a skeleton, 8 bouts), the skeleton fell 4 times on muscles and 3 on motors, every
fall after contact.

Vanguard's Skeleton fails its [standing miss return](../reference/vanguard.md#standing-miss-return)
on motors: after the left-hand miss its feet slide 11 to 15 cm while its stance stands, and
its hand settles 0.114 m from its guard at the 1.2 s deadline (0.03 m/s, planted). On muscles its
feet slide 0.3 m on the same miss and its hand passes within 0.05 m of the guard it left.

### Tried and not kept

On the same miss fixture (Node stand, Rapier, 120 Hz, `vanguard-skeleton`):

| Change | Result |
| --- | --- |
| The straight line at the muscle's unloaded speed | its feet rock, never both flat: 0.108 m, 0.60 m/s at the deadline |
| Curvature 1, 2 | falls at 4.8 s, 3.0 s |
| Curvature 4, 10, 30 | 0.10 to 0.12 m at the deadline |
| Turned back up to 1.4 x, 1.8 x the peak | falls at 4.0 s, 3.3 s |
| Vanguard's Skeleton punch: the plain punch's lead, a 0.05 s or no lead, no drive anchor | falls, or 0.10 to 0.11 m |
| Its punch's trunk turn and hips at 0.4 / 0.2, 0.3 / 0.15, 0.2 / 0.1, 0 / 0 | falls; passes; 0.098 m; 0.084 m |

The one pass sits between a fall and two misses, so it is not kept.

## Rebuilding the GLB

Blender 4.5 LTS, from the repository root. The build starts from the checked-in, stripped source:

```powershell
blender --background --disable-autoexec assets/skeleton/skeleton-source.blend --python scripts/skeleton/build-assets.py -- assets/skeleton/bind.json assets/art/environment/skeleton/skeleton.glb .tmp/skeleton
```

The last argument is optional; with it the script also renders front, side, three-quarter, hand
and skull previews over the part boxes to `.tmp/skeleton/skeleton-*.png`. The part map (which source
bones go on which part), the landmarks each fit uses and the finger curl (`CURL`) are data at the
top of their sections in `scripts/skeleton/build-assets.py`.

`assets/skeleton/skeleton-source.blend` is the bundle reduced to the skeleton collection, with its
mirror modifiers applied and subdivision removed. `scripts/skeleton/prepare-source.py` makes it
from the original download:

```powershell
blender --background --disable-autoexec human_base_meshes_bundle.blend --python scripts/skeleton/prepare-source.py -- assets/skeleton/skeleton-source.blend
```

After a rebuild, look at the skeleton in the lab and the crypt.

## Where the art and the colliders differ

The colliders are convex: a hull spans the gaps between the ribs, the pelvis's basin and the
femur's neck, so a blow meets them where the drawn bone shows a gap. The shanks' capsules are rounder
than the tibia, and the foot's box squarer than its bones. The hand's segment line still runs to
the fist box's far side, but its collider is the drawn hand.
