# Visual recovery 04 -- authored sconces and flame

**Status:** implemented on 2026-08-17. No simulation hash moved. The authored
four-mass sconce and two-layer deterministic flame replaced the post-and-sphere
presentation; final room asset identities are recorded in the room contract.

The current torch is a small box bracket from `tools/art/room.py#L296` plus an
eight-segment emissive sphere created around
`client/src/render/room-environment.ts#L653`. It passes lifecycle tests and reads as
an orange dot on a post. Replace the form while preserving authoritative furniture
identity and `SOCKET_torch_flame`.

## Authored assembly

Reauthor `ROOM_torch_bracket` as a wall-mounted iron sconce with a back plate, arm,
bowl or wrapped haft, and a sheltered flame base. Its pivot remains the wall mount;
the socket remains the exact light/effect origin with local +Y outward. The mesh must
read in silhouette at the default camera and must not look freestanding on the floor.

Replace the sphere with a bounded flame presentation owned by
`RoomEnvironmentPresentation`:

- opaque warm core plus one or two crossed tapered translucent outer planes or a
  small authored low-poly flame mesh;
- deterministic presentation-only phase derived from furniture identity and render
  time, with no RNG state and no simulation feedback;
- orange/gold core, restrained red fringe, no cyan/white saturation;
- non-pickable, non-shadow-casting, absent for VIS 0/1, disposed on reset/removal;
- one capped point light at the socket with visible wall and floor falloff, never a
  room-wide ambient lift.

Do not add particles until the static form is recognizable. Smoke and sparks are out
of scope unless the base flame passes first.

## Red-first tests

Extend the fixture and lifecycle tests near
`client/test/render-contract.test.mjs#L1116`:

```text
the_authored_torch_has_wall_mount_arm_bowl_and_flame_socket_closure
the_flame_has_a_tapered_core_and_outer_silhouette_at_gameplay_scale
torch_phase_is_deterministic_per_identity_and_never_enters_snapshot_state
remembered_or_unknown_torches_own_no_flame_light_shadow_pick_or_audio
torch_removal_disposes_every_flame_plane_material_and_light
```

Delete one silhouette layer and offset the light from the socket to observe red before
restoration.

## Pins, docs and gates

Update `tools/art/room.py`, `tools/art/export.py`, `tools/art/manifest.json`, room
sidecar/validator/generated TypeScript, `docs/reference/room-asset-contract.md`, asset
architecture and room evidence. Expected moves are room build-input SHA, GLB,
sidecar, validator, semantic counts and residency. Combatant pins and Rust goldens do
not move.

Run pinned Blender double export, `node tools/validate_assets.js
web/assets3d/room_slice.glb`, asset tests, render contract, TypeScript, production
build, docs and diff checks.

Foreground acceptance frames one torch in darkness, two along a wall, a remembered
torch location, and removal/reset. A torch passes only if its physical support, flame
shape and local pool are recognizable without the debug furniture record.
