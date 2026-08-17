# Visual recovery 05 -- painterly material composition

**Status:** implemented on 2026-08-17. No simulation hash moved. Generator v5 owns
the seamless full-tile floor geometry, four deterministic floor presentations,
concept-directed atlas, and final room pin/residency record.

The present room chooses `floor_a` or `floor_b` from one bit at
`client/src/render/room-environment.ts#L58`, repeats one wall source, and embeds two
512-square crops from one atlas. The result exposes obvious tiling, deep black seams
and little material hierarchy. This session reauthors the surfaces after wall counts
and torch origins are stable.

## Material set

Extend the room asset contract with a small declared family, not unbounded procedural
variation:

- four seamless flagstone variants sharing scale and edge closure;
- at least two coursed-wall face variants plus compatible coping/end treatment;
- aged door wood and iron distinct from stone in hue and roughness;
- bounded decal families for cracks, grime, roots and rubble placed only on disclosed
  open tiles;
- per-variant deterministic selection from generator seed and tile coordinates;
- no runtime texture generation, network fetch, random walk or presentation-to-sim
  feedback.

Rebuild the source atlas in `tools/art/textures/` and generation in
`tools/art/materials.py` and `tools/art/room.py`. Adjacent floor edges must be seamless
under every allowed rotation. Variation must avoid a checkerboard and must not turn
into visual noise at the default zoom.

## Value and lighting hierarchy

Calibrate the actual game camera rather than a material ball:

1. unknown remains near-black;
2. remembered floor is legible but subordinate;
3. current floor separates from raised masonry;
4. far/back walls form the darkest continuous architecture;
5. torch pools reveal nearby hue/roughness without bleaching the room;
6. Fighter face/steel reads above stone while gameplay cyan remains confined to cues.

Use warm upper-right key, restrained neutral/cool fill and warm local fire. Avoid
outlines, cel bands, glossy plastic, cute proportions and full-screen brown fog. Only
flame, blood and gameplay cues may carry strong saturation.

## Red-first automated gates

Add validator and render-contract tests:

```text
every_floor_variant_is_edge_seamless_under_declared_rotations
the_room_variant_selector_is_repeatable_uses_every_variant_and_avoids_checkerboards
wall_face_coping_door_and_floor_material_roles_remain_distinct
concept_value_bands_are_ordered_under_the_shipped_light_rig
the_stress_room_stays_inside_asset_and_gpu_budgets_after_variation
```

Corrupt one border texel, force one variant, and swap wood/stone roles to observe the
three relevant tests fail. Pixel/value tests defend gross regressions only; they do
not replace foreground review.

## Pins and verification

Update room GLB/sidecar/validator/generated TypeScript, Vite hashes, exact piece and
texture counts, payload/GPU estimates, `docs/reference/room-asset-contract.md`, asset
architecture, and room evidence. Record every old/new SHA-256 and count. No combatant
pin or registered Rust hash moves.

Run pinned Blender double export, all room validator tests, direct validation,
render/studio tests, TypeScript, production build, toolchain/dependency/docs checks and
`git diff --check`.

Foreground acceptance uses the four overview captures plus a 48 x 32 stress view.
Reject visible repeated clusters, black grid trenches, floor-like coping, uniform
brown response, unreadable doors or torch pools that flatten the whole room.
