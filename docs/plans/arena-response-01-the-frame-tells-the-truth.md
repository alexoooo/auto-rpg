# Arena response 01 -- the frame tells the truth

**Status:** client/presentation and Rust audit implementation complete; foreground capture pending.
**Blocks:** session 02.

## Outcome

Put a small always-visible meter in the Arena fight HUD and capture enough foreground
evidence to distinguish missed display frames, redundant Babylon draws, producer
starvation, stale commands and actuator lag. Establish one rAF/one dirty flush as the
presentation ownership rule; foreground capture measures its cost but does not authorize
that correctness boundary. No game rule changes in this session.

## Current seams

The route's display owner is [`loop`](../../client/src/arena/arena.ts#L2300), while
authoritative-tick presentation enters through
[`drawStage`](../../client/src/arena/arena.ts#L843). Babylon has one intended draw owner at
[`scene.render()`](../../client/src/arena/scene.ts#L1886). The existing reusable cadence
primitive is [`GameFrameMeter`](../../client/src/render/frame-meter.ts#L16), and the current
diagnostic sidecar starts at
[`ControlInputLog`](../../client/src/arena/control-lab.ts#L256). Implement against these
owners; do not add a parallel rAF, render loop or evidence recorder.

## The live meter

Reuse and generalise `client/src/render/frame-meter.ts`; do not build a second FPS formula
inside `arena.ts`. One 500 ms rolling reading reports:

- `display`: rAF callbacks per second and worst callback interval;
- `3D`: calls to the Arena stage's one `scene.render()` owner per second;
- `budget`: refresh-derived budget when the foreground record supplies it, otherwise the
  observed median display interval;
- `wait`: `ready`, `producer`, `input-ack`, `paused` or `hidden`.

The compact output is `#arena-fps` beside the top health bars. It remains visible while
Plans, Replay and Details are closed and resets on hidden, phase change, renderer loss and
route disposal. It never calls a simulation tick a frame. `aria-label` expands the terse
numbers for a screen reader.

`ArenaStage` receives a presentation-only render counter from its existing `draw()` owner
in `client/src/arena/scene.ts`; no Babylon observer or second render loop is added. The
Arena rAF calls the meter once even when no authoritative tick advanced. Pointer events
may update targets and guide geometry but may not call `scene.render()` independently.

## Latency and fixture audit

Extend the existing control evidence, not the authoritative command or trace schema, with
host presentation timestamps for:

1. eligible physical sample reduced to a candidate target;
2. request submission for tick `T`, owning a snapshot of that sample;
3. publication `T + 1` carrying target and achieved hand;
4. settlement of the host acknowledgement, which follows publication in this protocol;
5. the rAF that displayed that publication.

The report gives sample-to-submission, submission-to-publication,
publication-to-acknowledgement, publication-to-display and target-to-achieved
distributions separately. A missing join refuses the row by name and is visible in the
control status rather than only disabling Download.

Add `lab embodied --self-clearance-audit` as a read-only diagnostic over the exact frozen
inputs behind all six state/stream pins. It reports, per fixture, the first owner-shape
overlap and the first tick at which changing each current arm-rate constant changes state.
It does not resolve contact or alter a digest. Copy the resulting reached/unreached table
into sessions 02 and 03 before their first production edit.

The audit command is deliberately exact-feature-only:
`cargo run --release -p lab --features cartesian-recoil -- embodied
--self-clearance-audit`. A default build refuses by name and exits nonzero because it
cannot truthfully observe the two exact-law pins.

## Draw ownership and measured work

One active rAF is the unconditional presentation owner: an advancing production frame
does exactly one Babylon draw after all dirty guide/camera/body updates are applied, and
an unchanged callback does none. Pointer events only mark presentation dirty. This is an
architectural ownership rule, not a work-removal claim inferred from an unrun foreground
capture. Closed 2D drawers likewise do no prepare, format or canvas work on advancing
frames; the foreground bracket measures the cost of opening them without deciding these
ownership boundaries.

Use the repository's `control -> subject -> control` performance method on the same fight
and camera path. Record 10 seconds after a 5 second warm-up for each of:

- fixed camera, diagnostic HUD off;
- fixed camera, diagnostic HUD on;
- relative camera, guide and reticles active;
- Plans/Replay/Details each open once.

This is a visible-browser artifact. Hidden automation tests reset and arithmetic only.

## Files

| file | change |
|---|---|
| `client/src/render/frame-meter.ts` | route-neutral display/render cadence reading |
| `client/src/arena/scene.ts` | count the sole Babylon draw owner |
| `client/src/arena/arena.ts` | meter lifecycle, wait state and latency timestamps |
| `client/src/arena/control-lab.ts` | request-owned multi-clock diagnostic joins and foreground capture |
| `web/index.html` | compact `#arena-fps` HUD output |
| `client/test/render-contract.test.mjs` | meter and one-draw ownership tests |
| `client/test/studio-shell.test.mjs` | route lifecycle, label and wait-state tests |
| `crates/lab/src/main.rs`, `crates/lab/src/self_clearance.rs` | read-only frozen-fixture audit |
| `crates/sim/src/diagnostics.rs`, `crates/sim/src/exact_diagnostics.rs` | shared registered inputs and exact-driver observers |
| `crates/sim/src/combat/actuator.rs`, `crates/sim/src/world/` | byte-identical full-rate and swept owner-surface diagnostic seams |
| `crates/web/src/lib.rs` | consume the shared stream/command inputs while retaining the registered encoder and fold |
| `docs/performance/arena-human-control.md` | cadence/latency artifact and measured rows |
| `docs/performance/v2-arena-matrix.md` | visible bracket and rendering result |
| `docs/architecture/browser-runtime.md` | one-rAF/one-draw ownership |

## Tests and mutations

- `arena_frame_meter_separates_display_callbacks_from_babylon_draws`
- `one_active_arena_raf_causes_at_most_one_scene_render`
- `pointer_motion_marks_the_guide_dirty_without_drawing_synchronously`
- `hidden_pause_phase_change_and_dispose_reset_the_arena_meter`
- `closed_drawers_do_no_per_frame_canvas_or_formatting_work`
- `control_latency_keeps_sample_submission_publication_ack_and_display_clocks_distinct`
- `the_self_clearance_audit_observes_every_registered_fixture_without_changing_it`

Delete the draw counter increment, add a second `draw()` in the pointer path, merge the
accept and display timestamps, and make the audit resolve one overlap. Each mutation must
make its named test red before restoration.

## Hash expectations and verification

No hash, fingerprint, wasm export, ABI/layout version, recording schema or fixture moves.
Run the full repository gate. The foreground capture is an additional owed artifact, not
a substitute for the gate.
