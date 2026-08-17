# Concept production 04 -- production Fighter and Brute

**Status:** planned. Combatant asset pins move; room pins and Rust hashes do not.

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
