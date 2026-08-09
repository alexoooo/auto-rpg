# v2 renderer reference matrix

**Purpose:** Preserve the predeclared machine, backend, fixture, correctness, and measurement fields and the resulting procedural-v2-greybox decision.
**Status:** current
**Canonical source:** this document and the [renderer backend contract](../reference/renderer-contract.md#backend-selection-and-loss)
**Update when:** The reference machine, fixture, collection schema, correctness matrix, threshold, or accepted run changes.

A complete initial Canvas2D control and auto-selected WebGPU capture are accepted as
ordered slots 1 and 2 of 4. WebGPU p95 is 16.80 ms and fails the written 16.67 ms
threshold by 0.13 ms. An earlier forced-WebGL2 foreground diagnostic preceded the
ordered series, so it cannot fill slot 3. An early Canvas repeat began only 28.876
seconds after WebGPU's nominal finish and cannot fill slot 4 because no intervening
150-second WebGL2 run was possible. Automated and manual correctness gates are
complete. The project owner waived the missing ordered WebGL2 recapture and later
Canvas2D control after every renderer had been measured at least once, and chose to
proceed with Babylon despite the WebGPU threshold failure. Automated, hidden,
backgrounded, software-rendered, or out-of-order captures still do not satisfy the
original protocol; the waiver is a recorded owner decision, not a reclassification.

## Reference environment

| Field | Required value |
|---|---|
| Windows build | Windows 11 Home 25H2 build 26200.8973 |
| CPU | 13th Gen Intel Core i7-13700H |
| GPU | Intel Iris Xe Graphics |
| Driver | 32.0.101.7084 |
| Browser channel and build | Chrome 151.0.7922.72 |
| Power mode | AC / Balanced |
| Requested and selected backend | slot 1 requested `canvas`, selected `canvas2d`; slot 2 requested `auto`, selected `webgpu` |
| Complete support/init/fallback diagnostics | Canvas control attempted no GPU backend; WebGPU support `true`, init `ok`, no failure or WebGL attempt |
| Device pixel ratio | 1.5 |
| CSS size | 1920 x 1080 |
| Backing size | 1920 x 1080 |
| Render scale | 1 |
| Training workers | 0 |

## Fixed greybox fixture

| Field | Required value |
|---|---|
| Fixture seed | `0x5eed1234` (`1592594996`) |
| Room | 48 x 32 one-unit tiles |
| Population | 64 bodies: one hero and 63 monsters |
| Identity | indices 0 through 63, generation 1 |
| Visibility | every fixture tile current (2) |
| Lights | one shadowed directional key and eight unshadowed torches |
| Draw calls | Canvas control: 1,609 issued primitives; WebGPU: 11; WebGL diagnostic: 11 per sampled frame |
| Active triangles | Canvas control: 0; WebGPU: 11,752; WebGL diagnostic: 11,752 per sampled frame |
| Shadow casters | Canvas control: 0; WebGPU: 220; WebGL diagnostic: 220 per sampled frame |

## Automated correctness gates

These disclosure and terminal conditions are repeatable test-seam gates, not manual
browser choreography. The named render-contract suite passed 29 of 29 tests on
2026-08-08.

| Contract | Exact automated evidence | Result |
|---|---|---|
| Hidden entities and snapshot-local state leave no renderer presence | [`unseen_units_have_no_render_audio_pick_or_debug_presence`](../../client/test/render-contract.test.mjs#L138); [`unseen_shots_events_and_furniture_have_no_persistent_presence`](../../client/test/render-contract.test.mjs#L154) | pass |
| Remembered geometry remains non-current and unknown geometry remains absent | [`remembered_geometry_uses_seen_not_current_visibility`](../../client/test/render-contract.test.mjs#L175) | pass |
| Fog boundaries and generational identity cannot leak a frame | [`fog_edge_generation_reuse_creates_no_one_frame_leak`](../../client/test/render-contract.test.mjs#L186); [`persistent_units_retire_every_registry_before_a_generation_is_reused`](../../client/test/render-contract.test.mjs#L575) | pass |
| WebGPU device loss and WebGL context loss are terminal, without fallback | [`context_or_device_loss_disposes_once_and_never_switches_backend`](../../client/test/render-contract.test.mjs#L427); [`terminal_loss_disposes_renderer_content_before_engine_and_client`](../../client/test/render-contract.test.mjs#L491) | pass |
| Floor picking and primary-drag pan use the live camera and recover gesture ownership | [`primary_pointer_click_issues_goto_while_primary_drag_moves_the_live_camera`](../../client/test/render-contract.test.mjs#L886); [`greybox_input_keeps_one_pointer_owner_and_recovers_after_throwing_host_callbacks`](../../client/test/render-contract.test.mjs#L971) | pass |

## Manual correctness matrix

Record each row separately for selected WebGPU and forced WebGL2 in a visible
foreground browser. The observable rows exercise the real Worker route; no screenshot
or hidden-tab automation substitutes for the observation.

| Check | WebGPU | forced WebGL2 |
|---|---|---|
| Real Worker boot and backend diagnostics | pass — user confirmation, 2026-08-08 | pass — user confirmation, 2026-08-08 |
| Pause and resume | pass — user confirmation, 2026-08-08 | pass — user confirmation, 2026-08-08 |
| Floor-click Goto and Escape Withdraw | pass — user confirmation, 2026-08-08 | pass — user confirmation, 2026-08-08 |
| Reset without an old-epoch flash | pass — user confirmation, 2026-08-08 | pass — user confirmation, 2026-08-08 |
| Resize, then click, primary-drag pan, and wheel zoom | pass — user confirmation, 2026-08-08 | pass — user confirmation, 2026-08-08 |
| Hold three buffers, observe tick progress, and release | pass — user confirmation, 2026-08-08 | pass — user confirmation, 2026-08-08 |
| Visible units, shots/effects, doors, and torches | pass — user confirmation, 2026-08-08 | pass — user confirmation, 2026-08-08 |

An agent-controlled visible-browser retest after the input fix observed a floor click
submit Goto and a primary drag move the live camera. The user's earlier browser had
shown neither behavior. The user then hard-refreshed the rebuilt WebGPU real-Worker
page and confirmed both floor-click Goto and primary-drag pan. In a subsequent complete
checklist pass, the user confirmed that the full matrix above works on both the
auto-selected WebGPU route and forced WebGL2. This completes visible correctness only;
it supplies no frame-time or performance evidence.

## Measurement protocol

Run, in order, the initial Canvas2D control, WebGPU, forced WebGL2, and the repeated
Canvas2D control. For each run, warm for 30 visible-foreground seconds, then sample
120 visible-foreground seconds.
Reject the run on any visibility change or when engine diagnostics name SwiftShader,
llvmpipe, software rendering, or Microsoft Basic Render. Record the complete backend
diagnostics, p50/p95/p99 frame delta, `framesOver16_67Ms`,
`framesOver33_33Ms`, long-task support/count/time, draws, triangles, lights, and
shadow casters. Browser
APIs expose no portable GPU residency value, so record `gpuResidencyBytes: null` and
`gpuResidencyMethod: "unavailable-browser-api"` rather than substituting heap or wasm
memory. Repeat the Canvas baseline last as the control.

For Babylon captures, draws are the engine's completed-frame draw-call counter and
triangles are the scene's completed-frame active-index count divided by three; do not
substitute the logical debug mesh/instance totals. Canvas2D draws are its issued
primitives and its triangle/shadow-caster values remain zero. The 1920x1080 size is
the canvas CSS content box and backing store: Babylon owns the latter through engine
resize, while the Canvas control synchronises it directly.

## Measurement record

| Run | Backend evidence | Result | Accepted evidence |
|---|---|---|---|
| Initial Canvas2D greybox control | requested `canvas`, selected `canvas2d`; CanvasRenderingContext2D; SHA-256 `e3e8b6225bd72f74432936e83dd528593ea91ecb73aae0c44c600232f367b5d2` | accepted baseline — p50 16.70 ms, p95 16.80 ms, p99 16.90 ms; 4,126 frames over 16.67 ms; 0 over 33.33 ms; 0 long tasks; 7,200 samples | [interpretation](evidence/2026-08-08-v2-greybox.md#initial-canvas2d-control-result); [raw JSON](evidence/2026-08-08-v2-greybox-canvas2d-control.json) |
| Procedural greybox, WebGPU | requested `auto`, selected `webgpu`; support `true`; init `ok`; SHA-256 `6fd1b6daa3c6d61c5b0117a56997d23430bf47268fd89d00a89005f78943413e` | **fail** — p50 16.70 ms, p95 16.80 ms, p99 16.90 ms; p95 misses 16.67 ms by 0.13 ms; 4,020 frames over 16.67 ms; 0 over 33.33 ms; 0 long tasks; 7,200 samples | [interpretation](evidence/2026-08-08-v2-greybox.md#ordered-webgpu-result); [raw JSON](evidence/2026-08-08-v2-greybox-webgpu.json) |
| Procedural greybox, forced WebGL2 | ordered recapture waived by owner | out-of-order diagnostic met standalone threshold with p50 16.70 ms, p95 16.80 ms, p99 16.80 ms; 4,138 frames over 16.67 ms; 0 over 33.33 ms; 0 long tasks; 7,200 samples | diagnostic retained for proceed decision: [interpretation](evidence/2026-08-08-v2-greybox.md#diagnostic-result); [raw JSON](evidence/2026-08-08-v2-greybox-webgl2.json) |
| Repeated Canvas2D greybox control, last | ordered repeat waived by owner | early repeat was out of order (28.876 seconds after WebGPU nominal finish), so original drift control is absent | diagnostic retained for proceed decision: [interpretation](evidence/2026-08-08-v2-greybox.md#early-canvas2d-diagnostic); [raw JSON](evidence/2026-08-08-v2-greybox-canvas2d-control-early-repeat.json), SHA-256 `5c80a5af94112440b84b43237ba068767856c48d2d2e254b5af2822a3a9c04a4` |

The comparable Canvas control is `/v2.html?stress=greybox&renderer=canvas`, implemented
by `client/src/render/canvas-control.ts`. It consumes the same frozen 64-identity,
48-by-32, seed-`0x5eed1234` fixture and the same rAF sampler at 1920 by 1080, render
scale 1, with eight torch markers and zero training workers. It uses the same 30,000
millisecond warm-up, 120,000 millisecond sample, visibility rejection, and export
schema as the engine runs. Its backend metadata records requested `canvas`, selected
`canvas2d`, and stable null WebGPU fields. Save the untouched output at
`docs/performance/evidence/YYYY-MM-DD-v2-greybox-canvas2d-control.json` and repeat the
Canvas2D control last after the WebGPU and forced-WebGL2 runs. This compares the same
greybox presentation workload; it is not evidence about the legacy Canvas game's
frame rate.

WebGPU passes its numerical gate only when diagnostics select WebGPU and p95 is at
most 16.67 milliseconds. Forced WebGL2 passes its numerical gate only when diagnostics
record a forced request, WebGL version 2, and p95 at most 33.33 milliseconds. The
WebGPU result fails its gate. The retained early Canvas repeat cannot establish drift,
and the retained WebGL2 diagnostic cannot fill the original ordered slot.

The owner nevertheless closed v2-08 with a **proceed/pass with measured exception**
decision on 2026-08-08: every renderer was measured at least once, and the missing
ordered WebGL2 and final Canvas artifacts were explicitly waived. This keeps Babylon;
it does not claim that WebGPU met 16.67 ms or that the four-run protocol completed.
Raw downloads, retained diagnostics, and the interpretation belong under
`docs/performance/evidence/`.
