# Workshop rogue in the game

Select **Human → Workshop rogue** in the arena, or **workshop rogue** in the dungeon.
The default loadout is a two-handed bow. Boots, armour, Size (×0.8–×1.1), and the
existing supported sword/shield/empty-hand combinations remain selectable.

## Assets to retain through a refactor

- `assets/character-lab/rogue.blend` and the original character-lab GLB: original
  workshop model and preview animation, unchanged by integration.
- `public/assets/humanoid/workshop-rogue.glb`: animation-free game derivative with
  the original skin, clothing, hair, textures and equipment.
- `assets/humanoid/workshop-rogue.json`: anatomy, physical attachment frames,
  equipment geometry, finger poses and original source SHA256.
- `assets/humanoid/workshop-rogue-size-grips.json`: finger fitting for fixed-size
  equipment on scaled bodies.

Re-export with Blender opening `assets/character-lab/rogue.blend`, then running
`scripts/humanoid/export-workshop.py -- rogue`. Run
`scripts/humanoid/fit-workshop-size-grips.py -- rogue` for size fitting. Neither
script saves the source Blender file. The body provenance is recorded in the JSON;
the anatomy originates from CC0 MakeHuman/MPFB, with workshop clothing and equipment.

## Runtime boundaries

`workshop-profile.ts`, `body.ts` and `workshop-appearance.ts` share the fighter's
physical-to-skin adapter. Rendered bones follow achieved physical segments; preview
animations never pose combat limbs. Fingers use exported grips. Equipment stays
fixed size; anatomy and its physical drive laws follow Size.

`bow.ts` owns one coordinated two-socket module: two constrained anatomical arms,
a rigid bow, and a quiver. `EffectorCommand.ranged` requests a target, draw and
release. `BodyView.ranged` publishes achieved readiness. Raising, drawing and
recovery take simulation time; release requires an aligned, settled draw and a
clear line through world geometry. A severed or disabled module cannot release.
The string is a visual connection between achieved bow tips and the drawing
fingers, not a simulated elastic string. Launch speed comes from achieved draw.

`arrows.ts` preallocates twelve physical arrows. Ammunition is unlimited; only
spent arrows are recycled. Flight runs on the physics clock independently of the
archer's living controller. Swept shaft collisions and solver contacts enter the
existing `Combat` path with stable pool/shot identity and pre-impact evidence.
Shields and walls intercept shots; friendly collision exclusions remain unchanged.
Dungeon targeting additionally withholds shots through a party member.

`archer-policy.ts` approaches to range, stops and turns side-on to draw, leads
moving targets, compensates gravity, and retreats when an opponent closes. It keeps
the bow when threatened. Obstructed shots trigger lateral repositioning. Dungeon
movement orders override shooting while travelling. Head turning uses a bounded
neck motor, not a cosmetic rotation.

## Validation

`tests/rogue-archer.test.mjs` checks source preservation, loadout/Size persistence,
real projectile damage and shield interception, thin walls, pool exhaustion,
interruption after release, dungeon shooting, and exact mid-draw fork restoration.
The integration's Node bout-runner comparison of the existing human-duelist mirror
(seeds 17/29, supported locomotion, eight seconds) was byte-identical before/after.

The bow uses simplified physical draw mechanics rather than elastic stave/string
simulation. The character-lab walking/attack clip remains a preview; the game uses
its existing locomotion and physical arm controllers.
