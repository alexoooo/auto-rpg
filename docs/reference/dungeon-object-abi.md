# Dungeon object ABI

**Purpose:** Define the authoritative browser publication for physical dungeon objects.
**Status:** current
**Canonical source:** Rust layout and exports in [`crates/web/src/lib.rs`](../../crates/web/src/lib.rs), generated TypeScript ABI in [`client/src/protocol/abi.generated.ts`](../../client/src/protocol/abi.generated.ts), and object state in [`world.rs`](../../crates/sim/src/world.rs).
**Update when:** Any object word, kind, identity, state flag, extent, health, progress, or buffer lifecycle changes.

`DUNGEON_OBJECT_V1` is separate from the frame and legacy furniture publications.
One record is twelve little-endian u32 words:

```text
kind identity state_flags x_raw y_raw yaw_raw half_x_raw half_y_raw
hp_raw max_hp_raw progress_raw material_code
```

Coordinates, extents, health, and progress are raw signed 16.16 values carried in
u32 words. Yaw is the raw binary turn in its low 16 bits. Kinds append without
renumbering: door 1, torch 2, barrel 3, pottery 4, web 5, water 6. Bit 0 means open
for doors and broken for destructible props. Broken rows are tombstones and retain
identity until the level epoch changes.

Door progress is existing sustained-push pressure divided by `DOOR_TICKS`; opening
does not invent another timer. Torches publish their full cardinal wall-facing yaw.
Rows are level-stable and ordered doors, torches, then physical props. The Worker
leases and validates this buffer with the frame snapshot, but it is not part of
`FRAME_LAYOUT_VERSION`.

The renderer copies rows into immutable `PresentationDungeonObject` values and owns
all visual interpolation after that seam. A door leaf pivots at its collision-aligned
hinge; pressure moves the latch edge and the open state eases to 90 degrees over
exactly 450 ms. A row first observed open starts open. Torch yaw is consumed in all
four cardinal directions; each physical backplate owns one wooden support, iron bowl,
cross-plane layered flame, deterministic flicker, and bounded warm light projecting
away from the wall. Barrel, pottery, web, and water rows own stable physical art,
semantic picking, and shadow membership. Bit-0 destruction disposes intact prop art
on the state edge and leaves deterministic debris under the same object root.

Only rows on VIS 2 cells enter presentation. Fog retirement removes meshes, lights,
picks, shadows, and motion state together. Unsupported appended kinds create no
fallback object. When object rows are present they supersede duplicate legacy
door/torch furniture; the old furniture path remains only as a compatibility fallback.
Sparse blood, vines, loose bricks, and spiderweb scatter are deterministic,
non-pickable presentation art and never enter this ABI or authoritative state.

The three identity domains are disjoint: `0x1...` doors, `0x2...` torches and
`0x3...` props. Door and torch ordinals follow their level-stable source order;
the low prop bits are the authoritative identity held by `World`. A reader keys
objects by the complete published word, never by row number.

`dungeon_object_ptr`, `dungeon_object_len`, `dungeon_object_stride`,
`dungeon_object_capacity`, `dungeon_objects_dropped` and
`dungeon_object_layout_version` form the wasm handshake. Version 1 has stride 12
and capacity 512. The fixed buffer drops only its deterministic tail and reports
the count; it never reallocates beneath a JavaScript typed array.

The Worker copies visible rows into an aligned `DUNGEON_OBJECT_OFFSET` region of
each leased snapshot and derives `dungeonObjectRevision` from the filtered words.
Visibility uses the signed `x_raw`, `y_raw` object centre against the same current
VIS tiles used for furniture. `SnapshotView.dungeonObjects` is a `Uint32Array`;
the renderer-owned copy converts signed 16.16 words to numbers and keeps
`yawRaw` exact. Door progress and prop health make this a live per-publication
channel even when map and furniture revisions do not move.
