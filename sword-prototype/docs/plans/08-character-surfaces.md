# Session 08 -- cloth, skin and armour read apart

## Outcome

Apply authored texture families to both warriors so skin, cloth, leather and metal read as
different materials while crimson and blue remain distinct at Fixed-camera range.

## Implement

1. Add CC0 neutral albedo/detail, normal and ORM families for cloth, leather, skin and worked
   steel to `asset-src/textures.json`. Keep resolution at 1024 unless a bracketed screenshot
   proves 2048 changes the shipped view.
2. In `asset-src/build_warrior.py:253-508`, unwrap pieces by material family with consistent
   texel density. Seams belong at garment/armour boundaries; the open face, surcoat panels and
   skirt need explicit islands so they do not smear at a walk.
3. In `src/figure.ts:367-418`, make side colour a tint over a near-neutral cloth albedo.
   Because Babylon multiplies `albedoTexture` by `albedoColor`, prove the chosen base does not
   darken crimson/blue to a third of their current value. Share base textures; clone only the
   per-side tint material and dispose it with `Figure`.
4. Map costume pieces at `src/figure.ts:172-354` to skin, cloth, leather or armour descriptors.
   Do not infer material from mesh-name substrings at runtime; the total `CostumePiece` table
   remains the authority.
5. Extend `scripts/check-warrior.mjs` with expected material family per node and verify no
   exported material silently replaces the runtime palette. Record triangle/texture memory
   and draw calls before/after.
6. Update `README.md` and close the character-surface portion of owed items 5 and 9 only after
   a visible comparison at both zoom clamps.

## Tests that must exist first

Add to `tests/view.test.mjs` or `tests/materials.test.mjs`:

- `every_costume_piece_names_one_known_surface_family`
- `left_and_right_share_maps_but_keep_distinct_cloth_tints`
- `rebuilding_a_bout_disposes_side_material_clones`
- `the_costume_fallback_uses_the_same_surface_assignments_as_the_glb`

Remove the surcoat's `side` assignment and leak a clone across rebuild; the tint and disposal
tests must fail.

## Acceptance

Take matched Fixed-camera screenshots at both zoom clamps, with crimson on each side in turn.
The open face, armour plates, leather straps and cloth must read without the HUD, and team
colour must survive shadow. Walk, crouch, lean and twist: no new seam may expose a missing
texture or obvious UV crawl.

This is cosmetic. The standard corpus must remain identical.

```powershell
npm run texture:verify
npm run asset:verify
npm test
npm run check
npm run build
npm run measure -- --seed 20260823
```
