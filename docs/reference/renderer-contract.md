# Renderer contract

**Purpose:** Define the v2 renderer's exact snapshot-copy, identity, visibility, interpolation, and backend boundaries.
**Status:** current
**Canonical source:** this document, the [worker snapshot contract](worker-protocol.md#snapshot-layout-and-buffer-ownership), and the [frame layout](frame-abi.md#current-layout)
**Update when:** Renderer snapshot ownership, presentation identity, visibility gating, interpolation, coordinate mapping, backend selection, or loss handling changes.

The procedural v2 greybox is a presentation consumer. It may use floating-point
scene math, wall-clock receipt times, and engine objects only after authoritative
bytes have crossed the Worker boundary. None of that state enters simulation,
commands, replay, or a hash domain. The Canvas client remains the playable reference
and consumes the same authoritative identity and visibility publications.

<!-- DOC_CONTRACT: renderer-snapshot-copy -->
## Renderer-owned snapshot boundary

The arriving `SnapshotView` borrows a leased transferable buffer. During each
snapshot callback the renderer synchronously copies every live scalar, row, map byte,
visibility byte, and furniture record it needs into a frozen
`PresentationSnapshot`. It completes that copy before returning from the callback.
It never retains a typed-array view, capacity tail, Worker message, or lease-backed
buffer.

Only renderer-owned copies may become interpolation endpoints. Reset or a changed
epoch clears both endpoints and every transient or identity registry before the new
epoch is displayed. The renderer never imports the Worker implementation, owns wasm,
or sends its floating-point values back across the protocol.

One simulation world unit maps to one right-handed scene unit. Simulation `(x, y)`
maps to scene `(x, elevation, y)`. Raw binary-turn angles are converted to radians
only while making the presentation copy; generated ABI offsets and codes remain the
sole decoder constants.

<!-- DOC_CONTRACT: renderer-presentation-identity -->
## Presentation identity

A persistent unit identity is exactly `(entity_index, entity_generation)`. An absent
identity immediately retires every mesh, shadow caster, label, pick registration,
effect attachment, audio attachment, and debug record it owned. Reusing an index with
a different generation creates a new identity and never inherits interpolation or
presentation state.

Frame layout 7 gives shots and events no persistent generational handle. Their keys
are snapshot-local: `epoch:tick:shot:row` and `epoch:tick:event:row`. Position or row
similarity never promotes them to persistent identity, and event actor indices remain
hints rather than attachment authority. Furniture identity is `kind:tx:ty` within an
epoch; an absent disclosed record is absent now rather than remembered by the
renderer.

<!-- DOC_CONTRACT: renderer-visibility-presence -->
## Visibility and subsystem presence

Visibility is a single backend-independent presence decision shared by geometry,
meshes, shadows, labels, effects, audio, picking, and debug registries. Mapping a
non-finite or out-of-bounds point to a tile fails closed.

- Visibility 0 or map byte 255 creates no spatial presence of any kind.
- Visibility 1 with a known map byte permits remembered floor and wall topology in
  its remembered material. It permits no body, projectile, event,
  furniture record, light, sound, effect, pick target, or debug residue.
- Visibility 2 permits known current geometry. Units additionally require their
  disclosed visible flag; shots and events require a disclosed current point; and
  furniture requires its disclosed tile record.

The renderer repeats this gate even though the Worker already filters snapshots.
WebGPU and WebGL2 consume the same decision; a subsystem may not reconstruct a
looser answer from camera, scene, or remembered renderer state.

<!-- DOC_CONTRACT: renderer-interpolation-timeline -->
## Interpolation timeline

Interpolation reads two immutable `PresentationSnapshot` copies and clamps alpha to
0 through 1. The first snapshot or a changed epoch installs one copy as both
endpoints and renders it immediately. A greater tick in the same epoch shifts the
old current copy to previous; duration is the exact tick delta times `1000 / 60`
milliseconds. An equal tick is a same-tick authoritative publication and replaces
both endpoints immediately. A lower tick, mismatched endpoint epoch, or non-finite or
backwards receipt time is a terminal renderer protocol error.

Only a complete unit identity present in both endpoints interpolates. An identity
absent from the newer endpoint retires immediately; a new identity remains withheld
until alpha 1. Angles take the shortest wrapped path and stride phase wraps modulo 1.
Shots and events are current-snapshot-only, while map, visibility, and furniture
switch to the authoritative current copy rather than interpolate. No interpolation
operation mutates an endpoint or predicts authoritative state.

<!-- DOC_CONTRACT: renderer-backend-lifecycle -->
## Backend selection and loss

`backend=auto` tries WebGPU support and asynchronous initialization, records the
exact stage of failure, and falls back to WebGL2. A rejected WebGPU initialization
disposes the partial engine and replaces the canvas before fallback because the old
element may already own a WebGPU context. `backend=webgl2` skips WebGPU entirely,
requires an explicit `webgl2` context, and accepts only engine WebGL version 2.

Diagnostics always distinguish requested and selected backends, support result,
initialization stages, sanitized failure, WebGL version, and available engine
identity. Null represents unavailable data rather than an omitted field. A selected
backend's context or device loss stops rendering and input, disposes scene and engine
once, leaves the loss visible, and asks the live simulation client to pause. It never
switches backend during a run; recovery is an explicit page reload.

Performance acceptance is separate from backend correctness. Only a visible
foreground run on non-software hardware may populate the
[reference matrix](../performance/v2-reference-matrix.md#measurement-record).
