# Rootbound Crypt reference room

Open `/?play=dungeon&scene=reference`, or select **The Rootbound Crypt** in dungeon setup. The generated dungeon remains the default. The room starts with the workshop fighter, no companions, and three existing skeleton warriors; the workshop rogue and her bow are also supported. Existing character assets and combat tuning are unchanged.

This is the first playable room toward the supplied art direction, not a pixel match or a replacement for the procedural dungeon kit. It adds beveled flagstones, staggered masonry, blind arches, coping, roots, wet patches, a sarcophagus, warm shadowed torch pools and a diagonal orthographic camera. Foreground walls are cut down to capped sills in presentation; they remain full-height obstacles. `pitch` and `azimuth` URL parameters still override the view.

## Ownership

- `src/dungeon/reference.ts` owns the floor, door, spawns and obstacle descriptors in metres.
- `src/dungeon/world.ts` builds the sarcophagus collider for both graphical and headless runs. Its footprint blocks navigation; its low height does not block the map's abstract sight rays. Physical projectiles hit its actual 1.1 m box.
- `src/dungeon/reference-look.ts` loads only visuals, owns reference materials and shadow lights, and adds no bodies. The page checks that invariant at runtime. Restart disposes the entire previous scene and its reference layer.
- `scripts/dungeon/build-reference.py` authors the geometry; `assets/dungeon-reference/chamber.blend` retains editable, individually named components. The GLB batches geometry by material. Its node transforms and clockwise Babylon face convention must be retained when replacing the export.

## Rebuilding assets

Run Blender 4.5 LTS with:

```powershell
blender --background --python scripts/dungeon/build-reference.py
```

The generator uses seed 271828 and writes the editable Blender source, `assets/dungeon-reference/manifest.json`, and `public/assets/dungeon-reference/chamber.glb`. The geometry is authored in this repository; it contains no downloaded model. Textures reuse the existing Poly Haven CC0 floor and wall maps, with their original source URLs and SHA-256 hashes in `src/textures.json`. Runtime bindings provide albedo, normal and packed AO/roughness/metalness; Blender materials are export labels, not baked approximations of the runtime shader.

The authored layout and collision descriptors must be changed together when moving the tomb or walls. Shallow roots, chips and wetness are cosmetic. Never add physics bodies to the GLB dressing layer.

## Quality and verification

High uses 2048 px shadow maps and SSAO at native CSS resolution. Reduced uses 1024 px shadow maps, disables SSAO, and renders at 1/1.4 linear resolution. The Performance disclosure exposes the existing frame/physics/GPU meter; pause does not expand it.

`tests/dungeon-reference.test.mjs` checks navigable spawn/exit points, routes around the tomb, independent low-obstacle sight behavior, closed-door sight, real Havok rays below/above the lid, identical physical bodies with visuals on/off, and disposal. The ordinary dungeon suites cover the unchanged maps without obstacle descriptors.

### Browser measurements (2026-09-27)

Edge headless, Windows, Intel Iris Xe / ANGLE D3D11, 1920x1080 CSS viewport. Each sample ran the real four-character dungeon for 60 seconds after restart; the first five frames were excluded. These are different hero workloads, not a controlled graphics-only comparison.

| Setting / hero | Render resolution | Median frame | p95 frame |
| --- | --- | --- | --- |
| High / fighter | 1920x1080 | 111.8 ms | 163.7 ms |
| Reduced / rogue | 1371x771 | 73.8 ms | 102.5 ms |

**The 16.7 ms median / 33.3 ms p95 desktop target was not reached on this machine.** Reduced's final meter window reported 45.0 ms physics, 38.0 ms other CPU work, and 29.9 ms GPU time (GPU and CPU overlap). This needs a separate performance pass before treating the room as a 60 fps laptop experience. No physics rates or character behavior were weakened to obtain these numbers.

Browser acceptance verified both imported character appearances, a four-second fixed-step combat segment, pause freezing the clock, and restart returning to the same body/light counts. No JavaScript exceptions occurred. A separate fixed-step regression requires an actual released arrow against the established stationary unarmed-target fixture in this room. Counting preallocated arrow meshes is not accepted as evidence of firing. Against all three rushing skeletons, the unchanged archer AI repeatedly cancels its draw to retreat; solo ranged encounter balance remains a limitation. High and Reduced screenshots and raw samples are retained locally under `.review/reference-*`.

Validation: the full `npm test` run passed 955 tests; the subsequently added real-shot regression and all three room tests passed together. `npm run check` and `npm run build` passed. The production reference route loaded in Edge, and its served GLB matched the source asset hash.
