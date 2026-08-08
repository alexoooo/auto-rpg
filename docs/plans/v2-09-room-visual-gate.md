# v2-09 — validate one representative room pipeline

**Goal:** determine whether the offline room pipeline and GPU renderer can reach the
target visual class before producing an environment set.

**Depends on:** `v2-08`.

**Golden expectation:** no hash moves.

## Reproducible inputs

Use Blender `4.5.12` and `gltf-validator 2.0.0-dev.3.10` from
`tools/toolchain.json`. Add the validator at that exact version to `package.json` and
`package-lock.json`, then add:

```text
tools/art/build_slice.py
tools/art/room.py
tools/art/materials.py
tools/art/export.py
tools/art/manifest.json
tools/validate_assets.js
web/assets3d/room_slice.glb
web/assets3d/room_slice.json
```

`build_slice.py` starts from an empty scene and reads all seeds, dimensions, semantic
names, export flags, and expected hashes from the manifest. `--verify` exports to a
temporary directory and checks the Blender build SHA, node/material/socket names,
bounds, counts, and byte hash. Semantic metadata plus validator output is the
cross-patch contract; byte equality is required only under the pinned toolchain.

## Representative kit

Generate only two irregular flagstones, straight/inside/outside/end wall pieces, one
door and frame, torch bracket/flame socket, rubble/root decal, and one barrel-sized
prop. Geometry must have coherent tops, backs, sides, joins, and scale from both fixed
and free debug cameras. Collision/debug bounds are metadata, never authoritative sim
bodies. KTX2, bulk variants, and final combatants remain deferred.

No per-mesh correction enters `client/src/render/environment.ts`; defects belong to
generator, material, semantic metadata, or a general renderer rule.

## Visual and performance gate

Use the exact matrix and method from `v2-08`, now with the representative kit.
Validator errors are zero; payload is <= 24 MiB and estimated GPU residency <= 256
MiB. Re-run greybox last. Authoritative unknown/seen/current visibility remains
binding for room pieces, props, light cues, shadows, and picking.

A side-by-side review against `web/assets/CONCEPT.png` records `pass`, `replace`, or
`stop` on stone modeling, material response, fixture-origin light, join coherence,
depth readability, and silhouette contrast. A frame-rate pass does not imply an art
pass.

## Verification

```powershell
node tools/check_toolchain.js
blender --background --python tools/art/build_slice.py -- --verify
node tools/validate_assets.js web/assets3d/room_slice.glb
npm run check
npm run build
node --test client/test/render-contract.test.js
node --test tools/wasm_check.js
git diff --check
```

If the visual gate fails, replace renderer/asset assumptions before any combatant or
bulk environment production. Mechanics work may continue independently.
