# Session 07 -- prove one textured surface end to end

## Outcome

Build a local, digest-pinned CC0 texture pipeline and prove it on one arena primitive and one
authored warrior piece before any broad art pass. Close the earlier failure where adding a
normal map made every material carrying it fail readiness and disappear.

## Implement

1. Add `asset-src/textures.json` as the source registry: logical name, authoritative CC0
   source URL, license URL, SHA-256, colour-space per channel and intended material family.
   Extend `scripts/fetch-polyhaven.mjs` or add `scripts/fetch-textures.mjs`; downloads go only
   to `public/assets/textures/`, are refused on digest mismatch and are never fetched by the
   browser at build time.
2. Add `npm run texture:fetch` and `npm run texture:verify` to `package.json`. Verification
   checks every registry row in both directions: every declared file exists with its digest,
   and every committed texture has a declaration and license.
3. In `asset-src/build_warrior.py:103-239`, generate/export `TEXCOORD_0` for the warrior.
   Avoid the previous n-gon tangent failure: triangulate before tangent generation, verify
   every textured primitive has UVs, and export tangents only where a normal map needs them.
4. Extend `scripts/check-warrior.mjs:175-315` to inspect UV accessors, finite `[0,1]` bounds,
   non-zero UV area and required tangents. Keep dimensional validation intact.
5. Replace `surface()` at `src/arena.ts:57-87` with a material descriptor that can attach
   albedo, normal and ORM channels with correct `gammaSpace`, invert-Y and sampling settings.
   Loading failure must fall back to the current untextured PBR values, never make the mesh
   disappear.
6. Prove the descriptor on `ground` and one armour piece. Because `Figure` replaces imported
   glTF materials at `src/figure.ts:523-579`, textures belong to the arena palette or its side
   clone, not to a second material authority embedded in the GLB.
7. Add a tiny local test texture fixture; do not make `npm test` depend on network. Record a
   visible-browser material-readiness table before HMR and after a full navigation.

## Tests that must exist first

Add `tests/materials.test.mjs` with:

- `every_texture_has_a_digest_license_colour_space_and_consumer`
- `a_missing_texture_falls_back_to_a_drawable_colour_material`
- `normal_and_orm_maps_are_not_sampled_as_srgb`
- `a_textured_palette_is_shared_instead_of_minted_per_mesh`

Extend the asset verifier fixture with:

- `every_textured_warrior_primitive_has_non_degenerate_uvs`
- `a_normal_mapped_primitive_has_tangents`

Delete one UV accessor and flip one digest; each verifier must fail by asset/material name.

## Acceptance

In a freshly navigated visible page, inspect the ground and the chosen armour piece from both
cameras: both draw, texture dimensions are non-zero, material readiness is true during a
render pass, and stripping/reapplying the map at the console changes only surface detail.
Outcomes and damage totals must be identical before/after.

```powershell
npm run texture:verify
npm run asset:verify
npm test
npm run check
npm run build
npm run measure -- --seed 20260823
```
