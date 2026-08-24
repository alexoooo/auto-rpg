# Session 10 -- adapt real CC0 armour to the severable rig

## Outcome

Warrior wears recognisable pre-built armour rather than the current welded geometric design.
The source is freely licensed, locally pinned and buildable offline. Imported meshes remain
render-only rigid pieces attached to the existing physics bones, preserve team readability,
and fall back cleanly when the GLB is absent.

## Source decision

Evaluate these official CC0 sources before editing geometry:

- [Quaternius Animated Knight Pack](https://quaternius.com/packs/knightcharacter.html) --
  knight, helmets and accessories in FBX/OBJ/Blend.
- [Quaternius Modular Character Outfits - Fantasy](https://quaternius.com/packs/modularcharacteroutfitsfantasy.html)
  -- modular humanoid outfits in glTF/FBX/OBJ/Blend; confirm that every chosen file is in the
  freely downloadable portion.
- [Quaternius Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html)
  -- CC0 humanoid bases and a consistent rig if an outfit needs a body reference.

Prefer the modular outfit source if its free archive contains a complete readable armour set.
Otherwise use the Animated Knight pieces. Do not select by thumbnail alone: inspect archive
license text, topology, material slots, armour separability and fit to the current bones.

## Implement

1. Add `asset-src/armour-sources.json` with source URL, author, exact license, retrieval date,
   original archive SHA-256, selected object names and every adaptation performed. Add a
   digest-pinned fetch command; runtime/build must not require network access.
2. Update `asset-src/build_warrior.py`, `src/figure.ts:115-260` and the dimensions sidecar so
   imported armour is segmented/baked into the exact `costumePieces()` rigid-piece contract.
   A generic skinned character is not a drop-in replacement: severing still removes one
   physics-bone child and cosmetics remain non-authoritative.
3. Preserve open face, both arms, waist overlap, weapon clearance and side-colour cloth.
   Reuse the established PBR registry where compatible; any source textures receive their
   own provenance/digest/colour-space rows rather than being copied anonymously.
4. Update `scripts/run-blender.mjs:35-230`, `scripts/check-warrior.mjs:1-560` and asset tests.
   This session alone updates the `warrior.glb` digest, and its commit message names why.
5. Record triangle count, material/draw submissions, texture memory and control -> subject ->
   control frame cost. Cosmetics-on/off fight records must remain identical.

## Tests first

Extend `tests/warrior-textures.test.mjs` and material/integration tests:

- `every_imported_character_source_has_a_pinned_cc0_license_record`
- `the_adapted_armour_preserves_every_runtime_piece_and_bone_contract`
- `the_new_costume_has_no_dead_payload_or_competing_authoritative_material`
- `severing_each_armour_bearing_part_removes_only_that_render_piece`
- `the_new_costume_remains_cosmetic_and_side_readable`

Corrupt the archive digest, omit one rigid piece, add a physics aggregate to imported art and
merge team cloth into one material. Each mutation must fail its own gate.

## Acceptance

At both zoom clamps in Fixed and Overhead cameras, compare fallback, old committed GLB and
candidate armour while standing, walking, crouching, leaning, twisting and severed. "Better"
requires a human verdict: recognisable armour, cleaner silhouette and joints, readable sides,
no UV crawl/gap and no obscured weapon. Pin only the accepted candidate.

```powershell
npm run texture:verify
npm run asset:verify
npm test
npm run check
npm run build
```
