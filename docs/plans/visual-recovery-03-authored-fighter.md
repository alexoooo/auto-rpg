# Visual recovery 03 -- a recognizable authored Fighter and Brute

**Status:** planned. Depends on session 02. No simulation hash moves. Combatant asset
pins are expected to move.

The current GLB satisfies skeleton closure but its recipe at
`tools/art/combatants.py#L222` is visibly primitive: boxes, low-sided cylinders,
spheres and a thin box weapon. At gameplay scale the result does not read as a person.
This session preserves the rig/loader contract and replaces the mesh, proportions and
materials.

## Ground cue first

`client/src/render/actors.ts#L223` places the torus centre at `y = 0.055`, while the
authored room floor reaches `y = 0.080`. Replace the magic height with:

```text
floor maximum Y + scaled torus half-thickness + clearance epsilon
```

Source the floor bound from the loaded room contract or a shared documented constant;
do not sample presentation meshes every frame. Test minimum and maximum supported body
radii. If depth conflict persists, use a thin projected decal/mesh with explicit depth
bias instead of raising a thick neon tube.

Red-first test:

```text
the_full_faction_cue_clears_every_supported_authored_floor_and_body_radius
```

Lower the cue by one epsilon and observe failure.

## Reauthor the combatants

Extend the Blender target in `tools/art/combatants.py` without changing the exact
semantic names in `docs/reference/combatant-asset-contract.md`:

- Fighter: readable helmet/head, shoulder line, breastplate-to-waist taper, separated
  upper/lower arms, hands, two legs and boots, broad shield, believable sword;
- Brute: heavier torso, forward head, distinct arms/legs, readable two-handed club;
- preserve the two 16-bone skins, sockets, region nodes and clips `idle`, `walk`,
  `stagger`, `fall`;
- keep hands, weapon, shield and region transforms driven by the publication after
  cosmetic clip sampling;
- use rough charcoal steel, worn umber leather/cloth and restrained warm skin; cyan
  and red remain gameplay cues, not body paint.

Model for the actual camera. At 100 to 250 vertical pixels the head, torso, two arms,
two legs and held equipment must be separately readable. At the 40 px shrink test the
archetype must still be identifiable as Fighter versus Brute by silhouette.

## Contract tests and visual gates

Keep all existing skeleton, clip, bound, abort, clone, fog, shadow and disposal tests.
Add:

```text
fighter_and_brute_bounds_have_human_proportions_and_distinct_silhouettes
weapon_and_shield_have_minimum_projected_area_at_gameplay_scale
authored_combatant_parts_form_one_connected_body_after_pose_copy
the_40_pixel_shrink_test_distinguishes_fighter_from_brute
```

Break shoulder width, head height and shield area separately to prove teeth. Geometry
metrics are necessary, not sufficient: render pinned Blender turntable and game-camera
previews and compare them beside `CONCEPT.png`.

Expected pin moves: combatant build-input SHA, GLB, sidecar, validator, byte/count/GPU
budgets and generated TypeScript identity. Room asset pins and every Rust golden must
remain unchanged.

Run:

```powershell
node tools/check_toolchain.js
blender --background --factory-startup --python tools/art/build_slice.py -- --target combatants --verify
node tools/validate_combatants.js web/assets3d/combatants.glb
node --test tools/validate_combatants.test.js
node --test client/test/render-contract.test.mjs
npm run check
npm run build
node tools/check_docs.js
git diff --check
```

Foreground acceptance requires reset/idle, walk in four screen directions, weapon and
shield visible, ring fully above floor, fog disappearance/reappearance, and a Brute in
the Arena. Do not close on a NullEngine or loader-only pass.
