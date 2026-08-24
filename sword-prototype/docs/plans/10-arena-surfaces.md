# Session 10 -- a room rather than a featureless solver floor

> Code-complete 2026-08-24; browser acceptance remains open. The invisible 60 m ground slab
> and fourteen post bodies retain their exact session-09 dimensions, placement, masks and
> mass. A separate body-free owner builds a matching 60 m slate floor plus translucent wall
> scrims, overhead timber beams, flat rack/debris markings and cloth banners: 48 environment
> meshes total, 27 of them instances, over the same 15 world bodies.
> The registry contains 33 digest-pinned CC0 maps and records physical repeats of 2.4 m floor,
> 2.1 m wall, 2.0 m timber and 0.4 m cloth. `__sword.arena.audit()` reports owned resources
> and fifteen named visual-to-collider pairs through one frozen stable getter view. Authority
> alignment, reach admission, instancing, UV density, translated geometric camera rays,
> shadow lifecycle and destructive rack/clone mutations are automated. Visible-camera
> occlusion, material judgement and bracketed frame cost remain owed to the coordinated
> browser pass; this session is not accepted until that evidence exists.

## Outcome

Texture the floor, walls and room objects and add cosmetic dressing that improves scale,
motion and projectile readability while leaving the current collision arena authoritative.

## Implement

1. In `src/arena.ts:147-190`, split visual room construction from the existing ground/post
   physics. Keep the 60 m ground box and collision posts unchanged unless a separately
   measured gameplay change is proposed; visual floors/walls may sit on those shapes but own
   no body.
2. Add stone floor/wall, timber and cloth-banner texture families to the registry. Use UV
   scale in metres so texel size is consistent across floor and wall meshes.
3. Build a visible perimeter with translucent wall scrims, overhead beams, banners, racks and
   non-interactive debris as instanced cosmetic meshes. Opaque objects without a collider are
   admitted only above the conservative reach height. Distance is not safety for an animated
   fighter; floor-level rack/debris detail is flat marking rather than a pass-through volume.
4. Keep colour/value hierarchy: fighters are the strongest mid-value colour contrast, arrow
   accents remain the brightest moving marks, and room detail stays below them. Update lights,
   reflection and shadow receivers only with matched screenshots.
5. Add `ArenaAudit` to the existing console handle: mesh/material/texture/instance/body counts
   and named visual-to-collider pairs. The audit is diagnostic and returns one frozen view
   over private counters rather than allocating a caller-mutable result.
6. Capture frame cost with control -> subject -> control brackets in the visible browser on
   both available machines, as required by `AGENTS.md`; do not quote hidden-tab rAF.

## Tests that must exist first

Add `tests/arena.test.mjs`:

- `cosmetic_room_dressing_creates_no_physics_body`
- `every_reachable_solid_visual_names_an_existing_collider`
- `room_instances_share_materials_and_textures`
- `an_arena_rebuild_returns_every_audit_count_to_its_baseline`

Promote one flat rack marking to a solid without a collider, lower an overhead beam, break a
visual/collider name or overlap, and replace instancing with clones; the admission, alignment
and sharing tests must fail.

## Acceptance

From both cameras and zoom clamps, the room must provide scale and motion reference without
occluding either fighter or an arrow trail. Record bracketed median frame-cost delta and
range; if the subject exceeds the agreed budget, remove props or texture variants before
landing rather than promising a later optimization.

This is cosmetic. The headless corpus must remain identical.

```powershell
npm run texture:verify
npm run asset:verify
npm test
npm run check
npm run build
npm run measure -- --seed 20260823
```
