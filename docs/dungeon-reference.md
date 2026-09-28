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

The generator uses seed 271828 and writes the editable Blender source, `assets/dungeon-reference/manifest.json`, the GLB, and three 1024 px stone PNG maps under `public/assets/dungeon-reference/`. Geometry and stone textures are authored in this repository; there is no downloaded model. The periodic stone texture generator bakes albedo, OpenGL normal, and packed AO/roughness/metalness without tile seams. Its provenance and output hashes are recorded in the manifest. The working door reuses the registered Poly Haven CC0 wood maps from `src/textures.json`.

The current kit has six blind memorial niches with actual recessed backing, layered arch stones and coping, and a shallow segmental arch above the working exit. Niche rubble and branching roots occupy existing rock footprints. The floor's staggered, chipped slabs are independent of the gameplay grid; their crowns remain within 4 mm of the flat physical support plane. A carved sword and laurel relief, inset panels, plinth and cornice all fit inside the sarcophagus's original collision box.

Stone variation uses exported vertex colours. In Blender, adding a corner attribute reallocates mesh CustomData: acquire UV handles **after** adding the colour attribute, or UV writes corrupt the exported colours. Planar UV projection uses world-space face normals so rotated arch stones do not collapse to texture stripes. Both defects have binary-asset regression tests.

`CryptDamp` varies the opaque paving's roughness and albedo in three localized patches; there are no floating transparent puddle planes. Reference-only lighting uses cooler fill, a subdued carried light, and two tighter amber shadow-casting torch lights. Generated dungeons keep their original lighting. `world.doorVisuals` exposes only the two existing visual meshes for material binding; the world's door-opening code continues to own visibility and collision.

The authored layout and collision descriptors must be changed together when moving the tomb or walls. Shallow roots, chips and wetness are cosmetic. Never add physics bodies to the GLB dressing layer.

## Quality and verification

High uses 2048 px shadow maps and SSAO at native CSS resolution. Reduced uses 1024 px shadow maps, disables SSAO, and renders at 1/1.4 linear resolution. The Performance disclosure exposes the existing frame/physics/GPU meter; pause does not expand it.

`tests/dungeon-reference.test.mjs` checks actual GLB recess depth, portal clearance, colour data, UV area, texture hashes, tomb bounds and floor height, plus navigable spawn/exit points, routes around the tomb, independent low-obstacle sight behavior, door visual ownership, real Havok rays below/above the lid, identical physical bodies with visuals on/off, disposal, and a real rogue arrow release. The ordinary dungeon suites cover the unchanged maps without obstacle descriptors.

### First-pass browser measurements (2026-09-27, before art refinement)

Edge headless, Windows, Intel Iris Xe / ANGLE D3D11, 1920x1080 CSS viewport. Each sample ran the real four-character dungeon for 60 seconds after restart; the first five frames were excluded. These are different hero workloads, not a controlled graphics-only comparison.

| Setting / hero | Render resolution | Median frame | p95 frame |
| --- | --- | --- | --- |
| High / fighter | 1920x1080 | 111.8 ms | 163.7 ms |
| Reduced / rogue | 1371x771 | 73.8 ms | 102.5 ms |

**The 16.7 ms median / 33.3 ms p95 desktop target was not reached on this machine.** Reduced's final meter window reported 45.0 ms physics, 38.0 ms other CPU work, and 29.9 ms GPU time (GPU and CPU overlap). This needs a separate performance pass before treating the room as a 60 fps laptop experience. No physics rates or character behavior were weakened to obtain these numbers.

Browser acceptance verified both imported character appearances, a four-second fixed-step combat segment, pause freezing the clock, and restart returning to the same body/light counts. No JavaScript exceptions occurred. A separate fixed-step regression requires an actual released arrow against the established stationary unarmed-target fixture in this room. Counting preallocated arrow meshes is not accepted as evidence of firing. Against all three rushing skeletons, the unchanged archer AI repeatedly cancels its draw to retreat; solo ranged encounter balance remains a limitation. High and Reduced screenshots and raw samples are retained locally under `.review/reference-*`.

Validation: the full `npm test` run passed 955 tests; the subsequently added real-shot regression and all three room tests passed together. `npm run check` and `npm run build` passed. The production reference route loaded in Edge, and its served GLB matched the source asset hash.

### Art refinement verification (2026-09-27)

The refined GLB contains 87,928 triangles in seven material batches, versus 130,836 previously. The three authored stone maps are shared across the stone materials. No physics bodies were added. Cutaway walls now also remove elevated plaques, door fittings, sconces and flames, avoiding floating decoration when the camera bearing is reversed.

Matched rendering-only comparison: Edge headless / Intel Iris Xe ANGLE D3D11, tab reporting `visible`, 1920×1080, High, fighter, seed 271828, identical default camera and frozen spawn state. Each sample waits for `requestAnimationFrame`, then measures `scene.render()` through `gl.finish()`; 20 warm-up frames are discarded and 120 frames retained. No test suite ran during either measurement.

| Chamber | Median render | p95 render |
| --- | --- | --- |
| Before refinement | 42.2 ms | 60.9 ms |
| Refined | 40.8 ms | 53.2 ms |

This isolates rendering cost; it is **not** a live-combat FPS measurement and is not comparable to the older live-bout table above or the owner's gameplay screenshot. The measured change stays within the 10% regression budget.

Browser verification covered fighter/High and rogue/Reduced, fixed-step combat, authoritative door opening, pause and wheel zoom, scene restart with stable mesh/light/body counts, and the ordinary generated dungeon. Close-up views exposed and led to fixes for exported colour corruption and rotated UV collapse. A production view at azimuth 225° also exposed the cutaway fittings and opposite-wall core issues; those were corrected and checked again. Local captures and raw reports are under `.review/crypt-*`.

The full suite passed **960 tests**. After the final visual-only cutaway/core corrections, all eight chamber regressions passed again, and the production build (including TypeScript checking) passed again. Character assets, HUD layout, collision layout and combat tuning are unchanged.
