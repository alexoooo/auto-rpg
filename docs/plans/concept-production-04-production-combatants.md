# Concept production 04 -- production Fighter and Brute

**Status:** implemented and verified 2026-08-17. Combatant asset pins moved;
room pins and Rust hashes did not.

Reauthor `tools/art/combatants.py` while preserving the exact rig nodes, sockets,
regions and `idle`, `walk`, `stagger`, `fall` clips. Fighter/Brute budgets are
45k/55k triangles high, 14k/18k mid, and 3k/4k low. Bake painterly 2048 albedo,
normal and ORM maps per archetype plus a shared 1024 equipment set. LOD selection is
by projected height; First Person uses high-detail arms/equipment.

The meshes must have connected anatomy, readable hands/boots/faces, layered armour,
cloth/leather, believable sword/shield/club, contact shadow and restrained light
response. Animation never overrides authoritative hands, equipment or regions.
Replace the thick torus with a thin depth-biased ground marker above every supported
floor bound.

Red-first tests:

```text
fighter_and_brute_lods_preserve_rig_socket_and_region_closure
the_game_camera_reads_head_hands_feet_and_equipment_at_100_pixels
the_40_pixel_silhouette_distinguishes_fighter_from_brute
the_ground_marker_clears_every_authored_floor_without_depth_clipping
```

Run pinned Blender double export, combatant validator/tests, render/studio tests,
TypeScript, build, toolchain, docs and diff gates.

The landed v6 asset has 177 nodes, 135 semantic LOD meshes, 206,060 vertices,
76,220 triangles, 12 materials, eight clips and two skins. A final readability
correction widened the Fighter face from `0.172` m to `0.188` m so it occupies
at least 10 pixels on a 100-pixel body. The deterministic identities are build
inputs `5a330f273d69c88c180a5d3f4294284ace3cb507b6ddaf641ce559abc706c657`,
GLB `6b4e3225feb49799b0c73a057acf498342eed63461ca63509973d2cd016a84c5`,
sidecar `315fca274cad90f423c547c63a0758696be1cb697cd026ea24737a600d06dc92`,
and validator `41c905bb1e90a798d8e8679203f1e2b23bf4e12f747d93d256951d2f22ea096a`.
Payload is 46,209,989 bytes and conservative GPU residency is 159,154,536
bytes. Runtime rendering consumes each rigid joint-local piece directly: it
normalises Babylon's loader closure, clears the clone mesh skin, and parents the
piece to its semantic joint under one standing-height scale. NullEngine regressions
compose current world matrices and bound every dressed piece, specifically the
visible face/plume pair, around the published actor root; removing the semantic
parent makes the face regression fail.
