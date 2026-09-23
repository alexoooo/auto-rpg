# Skeleton art -- 00 overview

## Why

The skeleton family (`src/golem/skeleton/`) is drawn by `src/golem/bone-shells.ts` from
low-tessellation `MeshBuilder` primitives -- 8-segment spheres, 10-sided cylinders, torus ribs, a
sphere skull with a box jaw -- under hidden colliders. The owner asked on 2026-09-23 for about ten
times the art: a skeleton that reads like a real one, with a skull, ribcage, vertebrae, pelvis,
long bones, hands and feet, in aged bone.

## Source

`.tools/human-base-meshes/human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend` is
Blender Studio's "Human Base Meshes" bundle (CC0). Its collection **"Skeleton - Realistic"** holds
135 separate, UV-mapped bone objects named `GEO-skeletion.*` (sic): 33.9k base vertices, 11.7k of
them the skull, standing about 1.62 m at the skull -- the game skeleton's own height. `.tools/` is
git-ignored, so session 01 checks in a stripped copy. Blender 4.5.12 runs headless from
`.tools/blender-4.5.12/blender-4.5.12-windows-x64/blender.exe`.

## Shape of the solution

**Rigid, not skinned.** A bone does not deform. Each physics part gets one rigid mesh parented to
its host at the identity local transform, which is how the primitive shells hang today. Every host
has scaling 1 with its size baked into the vertices, so a child inherits no scale. There is no
Babylon `Skeleton`, no per-frame copy and no CPU skinning -- unlike the human skin in
`src/golem/humanoid/appearance.ts`, which needs all three because flesh bends.

**What must not move.** Colliders, masses, joints, health and every bout number. The art is
cosmetic ("Cosmetics never carry authority"). Headless harnesses never fetch the asset, so
`tests/harness/body-fingerprint.mjs` reads `same` trivially -- a null check, not evidence;
session 02's in-process test is the evidence. `bone-shells.ts` stays as the fallback for an absent
or failed asset.

## Sessions

| File | Lands |
|---|---|
| `-01-compiler.md` | bind dump, stripped source, Blender compiler, `skeleton.glb`, preview renders. No runtime change. |
| `-02-runtime-skin.md` | `src/golem/skeleton/appearance.ts`, the hook in `dressGolemPart`, loading on three pages, `tests/skeleton-art.test.mjs`. |
| `-03-look-in-play.md` | the owner looks; fit and curl tables tuned; AGENTS.md paragraph. |
| `-04-costume.md` | only if the owner wants it after 03: rigid cloth, belt, bracers, pauldron. |

## The part map

Verified against a headless build of every `SKELETON_BUILDS` entry plus
`skeletonSetup("fist", "whip")`.

**Keys.** A part id is `<prefix>.<slot>.<segment>`; the prefix varies (`left.golem.`,
`right.golem.`, `hero.golem.`, `golem.bench.`) and so does an arm's module id
(`effector.skeletal.<terminal>`). A template key is therefore `skeleton:<slot>:<segment>` with the
prefix stripped, `slot` one of `legs`, `trunk`, `head`, `primary`, `secondary`, `trailing`.

**Sides.** `primary` is +X, the body's right; `secondary` and `trailing` (the maul's second arm)
are the left. Legs: L is -X.

**Axes.** Capsules run along Y. The foot box's length runs along **Z**. Pelvis, core and head boxes
are Y-up, +Z forward.

| Key segment(s) | Collider | Source bones | Fit tolerance |
|---|---|---|---|
| `head.head` | box 0.16x0.20x0.20 | `skull`, decimated; rune eye spheres kept in the orbits | centre inside, extent 0.7-1.3 |
| `head.neck` | capsule 0.10 | `spine_cervical_c1..c7` | Y 0.7-1.3 |
| `trunk.core` | box 0.30x0.38x0.20 | `ripcage`, `spine_thoracic_*` | centre inside, extent 0.7-1.3 |
| `trunk.waist` | capsule 0.22 | `spine_lumbar_*` | Y 0.7-1.3 |
| `legs.pelvis` | box 0.28x0.12x0.16 | `hip`, `sacral`, `coccygeal` | centre inside; Y up to 2.0 |
| `legs.thighL/R` | capsule 0.40 | `leg_femur` | Y 0.8-1.2 |
| `legs.shinL/R` | capsule 0.39 | `leg_tibula`, `leg_fibula`, `leg_patella` | Y 0.8-1.2 |
| `legs.footL/R` | box 0.09x0.05x0.24 | tarsals, metatarsals, toe phalanges | Z 0.8-1.2; toes +Z |
| `*.collar` | capsule 0.10 | `shoulder_scapula`, `clavicle` | centre within 120 mm |
| `*.upperArm` | capsule 0.30 | `arm_humerus` | Y 0.8-1.2 |
| `*.forearm` | capsule 0.25 | `arm_radius`, `arm_ulna` | Y 0.8-1.2 |
| `*.rollRing` | capsule 0.05 | none -- the radius and ulna are stretched across forearm and ring together | declared empty |
| `*.wrist` (weapon builds) | capsule 0.08 | the whole closed hand: carpals, metacarpals, phalanges | centre within 60 mm |
| `*.wrist.bare` (fist builds) | capsule 0.08 | carpals and metacarpals of the same closed hand | centre within 60 mm |
| `*.fist` | sphere r 0.05 | the phalanges of the same closed hand | centre within 60 mm |

A weapon is welded to the wrist link and held along the forearm's line, so a weapon build's hand is
drawn as a closed fist with the handle leaving it forward -- a punch-dagger grip. A fist build draws
the same hand split in two, so a severed fist takes its fingers with it.

Excluded on purpose: `blade`, `plate`, `mace`, `maul`, `whip.*`, `whip.weight`. Weapons fall
through to their forge or primitive art.

## Owner's decisions, and ones they may reverse

- Bare bones first; costume only after seeing them (the owner's "try the simplest version first").
- Shading is baked occlusion and grime in vertex colours, with no texture at all. The planned
  tiling grain map was left out as the simpler version; add it in session 03 if the look needs it.
- The drawn bones are not the colliders. Thin colliders stay thin by the owner's choice; a blow
  that passes between drawn ribs still hits the solid core box.
