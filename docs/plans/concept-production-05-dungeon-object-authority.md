# Concept production 05 -- authoritative dungeon objects

**Status:** implemented. This is the sole authoritative session.

Add a separate append-only `DUNGEON_OBJECT_V1` publication, not a frame or legacy
four-byte furniture widening. One record is twelve u32 words:

```text
kind identity state_flags x_raw y_raw yaw_raw half_x_raw half_y_raw
hp_raw max_hp_raw progress_raw material_code
```

Kinds append as door=1, torch=2, barrel=3, pottery=4, web=5, water=6. Identity is
stable within the level epoch; coordinates/extents/health/progress use raw 16.16 fixed
point. Update Rust exports, wasm check, ABI generator, Worker leased buffers, snapshot
parser, recorder and reference together. `FRAME_LAYOUT_VERSION` remains unchanged.

World rules: barrels/pottery block and take deterministic swept weapon/projectile
damage; webs are non-blocking, 35% slow, durability 2; water is non-blocking,
indestructible, 20% slow. Destruction leaves a tombstone until level change. Order
hits by `(toi, prop identity, attacker identity)`. Write an ADR for this separate
fixed-point prop sweep; do not widen combat `ContactKind` and never read presentation.
Door records publish existing pressure and open state. Torches use full cardinal yaw.

Hash prediction: `ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH`, `BOW_HASH` move.
`LAB_HASH`, `GOLDEN_STATE_HASH`, learned inference, combat specs, articulated
command/stream, exact trajectory, lifted solver and articulated-duel pins do not.
Native MSVC values are measured before fresh wasm mirrors change.

Measured native MSVC and fresh wasm values agree: `ROOM_HASH =
0xb8990e0dd2f543bf`, `BATTLE_HASH = 0xa68f4a40570b208a`, `SWAP_HASH =
0xd2d38c5ad27c3f13`, and `BOW_HASH = 0xce5fa25b974e0701`. Every pin named
above as isolated remained unchanged. The separate publication and its identity,
fog, bounds, lease, and drop contracts are canonical in
[`dungeon-object-abi.md`](../reference/dungeon-object-abi.md); the separate
fixed-point damage choice is recorded by
[`ADR 0006`](../decisions/0006-dungeon-props-use-a-separate-fixed-point-sweep.md).

Red-first tests cover placement determinism, clearance/connectivity, collision,
slow zones, simultaneous hit order, tombstones, replay, state digest, ABI bounds and
native/wasm equality. Run both workspace feature matrices and rebuild wasm.
