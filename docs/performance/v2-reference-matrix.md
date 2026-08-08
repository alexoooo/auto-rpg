# v2 renderer reference matrix

**Purpose:** Predeclare the machine, backend, fixture, correctness, and measurement fields required to judge the procedural v2 greybox.
**Status:** current
**Canonical source:** this document and the [renderer backend contract](../reference/renderer-contract.md#backend-selection-and-loss)
**Update when:** The reference machine, fixture, collection schema, correctness matrix, threshold, or accepted run changes.

This is not a performance result. Machine, manual-observation, and measurement fields
remain pending until a user starts explicit work in a visible foreground browser;
the separately identified automated correctness gates are complete. Automated,
hidden, backgrounded, or software-rendered captures are rejected and cannot support
the performance decision.

## Reference environment

| Field | Required value |
|---|---|
| Windows build | pending visible-foreground capture |
| CPU | pending visible-foreground capture |
| GPU | pending visible-foreground capture |
| Driver | pending visible-foreground capture |
| Browser channel and build | pending visible-foreground capture |
| Power mode | pending visible-foreground capture |
| Requested and selected backend | pending visible-foreground capture |
| Complete support/init/fallback diagnostics | pending visible-foreground capture |
| Device pixel ratio | pending visible-foreground capture |
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
| Draw calls | pending capture |
| Active triangles | pending capture |
| Shadow casters | pending capture |

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
| Real Worker boot | pending | pending |
| Goto and withdraw | pending | pending |
| Reset without an old-epoch flash | pending | pending |
| Resize and input picking | pending | pending |
| Pause and resume | pending | pending |
| Visible units, shots, events, and furniture are observable | pending | pending |

An agent-controlled visible-browser retest after the input fix observed a floor click
submit Goto and a primary drag move the live camera. The user's earlier browser had
shown neither behavior. These rows remain pending until the user hard-refreshes the
rebuilt page and confirms the behavior directly; the agent retest is functional smoke,
not manual acceptance evidence.

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

## Measurement record

| Run | Backend evidence | Result | Accepted evidence |
|---|---|---|---|
| Initial Canvas2D greybox control | pending | pending | none |
| Procedural greybox, WebGPU | pending | pending | none |
| Procedural greybox, forced WebGL2 | pending | pending | none |
| Repeated Canvas2D greybox control, last | pending | pending | none |

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

WebGPU passes only when diagnostics select WebGPU and p95 is at most 16.67
milliseconds. Forced WebGL2 passes only when diagnostics record a forced request,
WebGL version 2, and p95 at most 33.33 milliseconds. The phase decision remains
pending until both accepted GPU runs, the initial and repeated Canvas controls, and
the manual correctness matrix are recorded. Accepted raw downloads and sibling interpretations belong under
`docs/performance/evidence/`; no dated result exists yet.
