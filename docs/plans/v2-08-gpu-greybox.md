# v2-08 — prove the GPU greybox and visibility boundary

**Goal:** render the current legacy simulation through Babylon beside Canvas, with
correct identity, authoritative fog, fallback behavior, and honest measurements.

**Depends on:** `v2-07`.

**Golden expectation:** no hash moves.

## Renderer seam

Add exact `@babylonjs/core` and `@babylonjs/loaders` `9.18.1` dependencies and:

```text
client/src/render/engine.ts
client/src/render/scene.ts
client/src/render/camera.ts
client/src/render/environment.ts
client/src/render/actors.ts
client/src/render/visibility.ts
client/src/render/interpolation.ts
client/src/render/debug.ts
client/src/input/
client/test/render-contract.test.mjs
```

Babylon imports only complete snapshots. Persistent nodes use `(index,generation)`;
death retires them and generation reuse creates a new presentation identity.
Interpolation reads two immutable snapshots, never predicts authority, and never
writes floats back to wasm.

`engine.ts` tries WebGPU, records the capability failure, then falls back to WebGL2.
One world unit equals one right-handed scene unit. Use an orthographic fixed-isometric
camera, instanced grey floor/walls/doors/torches, one shadowed key, and at most eight
unshadowed torches in the fixed stress scene.

## Visibility acceptance

`visibility.ts` consumes authoritative unknown/seen/current states. An unseen entity
has no mesh, shadow caster, nameplate, effect, sound cue, picking target, or default
debug residue. Previously seen geometry uses the authoritative remembered state.
Interpolation cannot expose a body before the first snapshot that marks it visible.
The same rules apply on WebGPU and WebGL2 and across generation reuse at a fog edge.

## Named measurement matrix

Create `docs/performance/v2-reference-matrix.md` before profiling. Record exact
Windows build, CPU, GPU, driver, browser channel/build, power mode, CSS/backing
1920x1080 resolution, render scale 1, backend, 64 grey bodies, room dimensions,
draw/triangle counts, nine lights, shadows, and no training workers. If the actual
reference machine differs, amend this file before collecting numbers.

Warm 30 seconds; sample 120 visible-foreground seconds; report p50/p95/p99 frame
time, counts over 16.67/33.33 ms, long tasks, draws, triangles, and residency; repeat
the Canvas/greybox baseline last. Pass targets are WebGPU p95 <= 16.67 ms and forced
WebGL2 p95 <= 33.33 ms on that named machine.

## Tests and verification

```text
dead_rows_do_not_resurrect_recycled_entities
interpolation_does_not_mutate_or_reveal_future_snapshots
unseen_entities_have_no_render_audio_pick_or_debug_presence
remembered_geometry_uses_seen_not_current_visibility
fog_edge_generation_reuse_creates_no_one_frame_leak
renderer_modules_do_not_import_worker_or_wasm_implementation
```

```powershell
npm ci
npm run check
npm run build
node --test client/test/render-contract.test.mjs
cargo test
node --test tools/wasm_check.js
git diff --check
```

Record coordinates shared with Tactical for Fighter, Brute, arrows, walls, and doors.
The phase gate records `pass`, `replace`, or `stop` for Babylon independently of room
art and articulated combat.
