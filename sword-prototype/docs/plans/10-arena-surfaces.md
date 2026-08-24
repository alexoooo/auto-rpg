# Session 10 -- a room rather than a featureless solver floor

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
3. Build a bounded room/ring with walls, beams, banners, racks and non-interactive debris as
   instanced cosmetic meshes. Objects a fighter can reach must either sit outside the combat
   envelope or visibly align with an existing world collider; a mesh that looks solid and can
   be walked through is refused by placement, not excused in prose.
4. Keep colour/value hierarchy: fighters are the strongest mid-value colour contrast, arrow
   accents remain the brightest moving marks, and room detail stays below them. Update lights,
   reflection and shadow receivers only with matched screenshots.
5. Add `ArenaAudit` to the existing console handle: mesh/material/texture/instance/body counts
   and named visual-to-collider pairs. The audit is diagnostic and creates nothing.
6. Capture frame cost with control -> subject -> control brackets in the visible browser on
   both available machines, as required by `AGENTS.md`; do not quote hidden-tab rAF.

## Tests that must exist first

Add `tests/arena.test.mjs`:

- `cosmetic_room_dressing_creates_no_physics_body`
- `every_reachable_solid_visual_names_an_existing_collider`
- `room_instances_share_materials_and_textures`
- `an_arena_rebuild_returns_every_audit_count_to_its_baseline`

Move one solid rack into the envelope without a collider and replace instancing with clones;
the reachability and sharing tests must fail.

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
