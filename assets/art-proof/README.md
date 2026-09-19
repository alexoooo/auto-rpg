# The Cinder Forge

A graphics proof in the actual Babylon/Havok renderer. Open `/art-proof.html` with the normal
Vite server (`npm run dev`). The production build includes the arena, bench, and proof page.

The default biped has 23 registered physical parts and 66 visible modeled pieces. Its original
collision geometry, masses, constraints and control remain authoritative. The proof adds a
separate presentation binding at module registration; it does not discover anatomy by parsing
mesh names. The asset manifest identifies the exact supported build and refuses incomplete assets.

## Viewing

- **Arena view / Inspect:** composed gameplay and close views.
- Drag or middle-drag to orbit; Shift + drag to pan; wheel to zoom.
- **Modeled / Original:** compare geometry and materials in identical lighting at the same pose.
- **Limestone / Blue granite:** tint the upgraded stone. The original appearance retains its
  original faction palette; neither choice changes physical properties.
- **Pause / Resume:** freezes the solver, flames, embers and molten seams, leaving camera controls live.
- **Restart:** rebuilds the same body and resets its demonstration clock, preserving pause and appearance.
- **Readout:** rendering resolution, frame rate, draw calls, triangles, and current motion phase.

The 16-second motion sequence is an `Intent` producer, not skeletal animation. It settles,
guards, sweeps, thrusts, advances, and returns through the same physical controller as the game.
It then holds guard; Restart replays the sequence without accumulating locomotion drift.
It remains an inspection demo, not a second combat mode. The arena and module bench now share
its models, maps, lighting treatment, and forge interface theme.

## Editable assets and rebuilding

`forge.blend` is an editable asset shelf. Each object corresponds to a named GLB template.
The exported templates have their origin at the corresponding original part's local origin;
the shelf positions in the saved Blender file are for editing convenience only.

From the repository root:

```powershell
node scripts/art-proof/export-source.mjs
& '.tools/blender-4.5.12/blender-4.5.12-windows-x64/blender.exe' --background --python scripts/art-proof/build-assets.py
npm run build
```

The first script builds the real default golem under NullEngine and extracts its visible geometry
and registration keys to `source.json`. The Blender script produces bevels, inward corner cuts,
a diamond-section blade, an inlaid glyph, fitted Voronoi pavement, masonry, columns, bowls,
cloth and outcrops. It also generates seamless 2K PBR maps from deterministic layered noise.
All assets in `public/assets/art-proof` are original generated work; the scene reuses the
repository's existing environment HDR. No remote fonts, images, model services or CDN assets are
needed at runtime. Rebuilding overwrites generated assets and the Blender source shelf.

The refinement adds narrow stone chamfers and varied inward chips, periodic angular mineral
fractures, and per-part UV offsets. Turned bronze covers have shallow recessed caps, stepped rims,
and baked vertex-color recess shading; the cap depth stays outside the adjoining stone surface.
The metal blade retains its physical envelope and receives a directional roughness map.
New `carved-*`, `joint-*`, and `steel-orm` maps are 2K; new normal/ORM maps are saved as non-color
data. Original maps remain on walls and braziers. Pavement has independent material settings.
The rune uses the existing bloom, and a shadow-bias adjustment removes striping on flat stone faces.

Normal builds use the committed GLBs and images and require no Blender installation. The Blender
binary is an existing local 4.5.12 LTS portable installation under ignored `.tools`, not a repository
dependency. A different Blender 4.5 LTS executable can run the same Python script.

## Rendering and ownership

PBR material maps are shared across the golem and the environment. Color maps use sRGB;
normal and ORM maps are linear. glTF's handedness transform is baked once into template geometry,
including triangle winding, before the templates attach to the original physical host nodes.
Shader code is limited to animated flame cards; molten seams use emissive PBR geometry.

Static substantial scenery has registered colliders and passes the room placement and overlap
validators. The floor remains flat at y=0; seams and bevels are shallow cosmetic detail. There is
no lava damage rule. Camera orbit can travel outside the composed shot; this small scene is an
art study rather than a finished all-direction arena.

The presenter owns its cloned meshes, while the scene owns shared imported geometry, textures,
materials, and environment. Switching appearance hides render surfaces only, never a physics
host node. Restart takes down the presenter before the body. Failure during loading presents a
visible error and disposes the partially built scene.

## Verification

`tests/art-proof.test.mjs` loads the real GLB under NullEngine, checks attachment coverage and local
bounds, exercises the full motion sequence with both visual modes, and asserts identical physical
samples, health, and collision filters. It also exercises incomplete manifests and collider admission.
The missing-part fixture intentionally deletes a manifest entry, so the failure test can exhibit
the defect it claims to catch.

Browser captures and the measured result live in `review/`. For repeatable inspection, the page
exposes `window.__artProof` with `pause`, `restart`, `advance(seconds)`, `render`, `view(close)`,
`appearance(upgraded)`, and `audit`. `advance` uses the fixed-step accumulator and advances render
IDs explicitly; it does not infer physics time from tight render loops.

To measure frame pacing, focus the tab, warm the scene, then call `__artProof.startBenchmark()`.
It records 60 seconds of animation-frame intervals and exposes `benchmarkResult`. A hidden tab
invalidates the run. Compare at 1920×1080 render resolution; browser emulation is useful for pinning
the viewport to that size. Read the recorded hardware before interpreting a result as a desktop-GPU claim.

## Game-wide appearance

`src/forge-style.ts` installs the art at scene startup for the arena and bench. The assembly
registers cosmetic replacements through `src/golem/appearance.ts`; visible meshes retain the
live wear bindings, picking ownership, and disposal of their physical hosts. The default build
uses its exact modeled pieces. Other registered builds reuse carved blocks and turned bearings
while specialised wheels, lashes, and striking shapes keep their original silhouettes.

The sword ferrule, wrist axle, and shield grip/bracket are shared module cosmetics. They bridge
the real mount locations and add no bodies, constraints, mass, or hit surfaces.

`src/forge-room.ts` fills the existing wall colliders with masonry and decorates existing posts
with flames. Walls crossing the camera sight line are hidden. Shallow paving and glowing seams
lie on the ground slab. Physics and combat controls are unchanged; setup uses a shallow camera
sway so contenders remain side by side. High-DPI rendering is capped at 1920×1080; CSS/UI remains
at the display resolution. The proof page remains available for inspection and comparison.

Validation for the rollout is recorded in [review/rollout.md](review/rollout.md).
