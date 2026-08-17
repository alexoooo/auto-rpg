# Visual recovery 02 -- stable complete walls

**Status:** planned. Depends on session 01. Presentation-only; no registered hash
moves.

The missing bottom/left walls are not a culling accident. The current contract in
`client/src/render/room-environment.ts#L189` selects only -X/-Z interfaces, and the
snapshot reconciliation near `room-environment.ts#L448` tears down geometry whenever
visibility revisions split a run. Tests and docs currently defend that result. This
session supersedes the rule rather than rotating it for a fifth time.

## Stable architectural representation

Replace maximal visibility-dependent cutaway runs with one deterministic face record
per disclosed solid/open boundary:

```ts
type RoomWallFace = Readonly<{
  key: string; tx: number; ty: number;
  side: 0 | 1 | 2 | 3;
  visibility: 1 | 2;
}>;
```

The key is cell plus cardinal side and never includes material band, run start,
camera, or current/remembered state. `chooseRoomBoundaryWalls` at
`room-environment.ts#L151` remains the four-sided topology source. Reconcile a map of
face key to instance in place: VIS 2 to VIS 1 changes material/effects only; adjacent
disclosure adds faces without replacing existing ones; VIS 0 owns no mesh, shadow,
pick or sound. Retain merged instancing only as an internal draw optimization whose
membership cannot define identity.

Do not suppress singleton faces. Retain full caps only where a solid volume exists;
do not use caps to stand in for missing vertical masonry.

## Local cutaway and occlusion

All four architectural sides exist. A camera-facing wall may fade or lower only when
its projected screen bounds overlap the hero plus a bounded margin. Put this policy in
new `client/src/render/room-occlusion.ts`; it receives camera projection, stable face
bounds and hero presentation position. It may change material alpha or vertical clip,
never topology, visibility authority, picking or simulation data.

The policy must be local and reversible:

- a near wall far from the hero remains solid;
- a near wall covering the hero becomes a restrained cutaway;
- moving away restores the same face object;
- far/back walls never disappear because of camera quadrant alone;
- free-camera review recomputes occlusion without rebuilding architecture.

## Red-first tests

Replace the existing omission-defending contour test near
`client/test/render-contract.test.mjs#L1237` with:

```text
all_four_disclosed_solid_open_orientations_create_stable_wall_faces
wall_face_identity_survives_current_to_remembered_and_neighbour_disclosure
unknown_cells_create_no_wall_face_or_subsystem_presence
only_a_near_face_overlapping_the_hero_receives_local_cutaway
singleton_boundary_faces_are_not_discarded
walking_a_disclosure_path_does_not_rebuild_existing_wall_meshes_or_shadow_casters
```

Prove teeth by restoring -X/-Z filtering, by including visibility in the key, and by
deleting the singleton branch; each mutation must fail its named test.

## Documentation and gates

Update the accepted wall grammar in `docs/reference/room-asset-contract.md#authored-room-disclosure-mapping`,
renderer visibility rules, asset architecture, browser runtime, the room matrix and
the 2026-08 evidence correction. Exact capacities may change only if stable faces
exceed current presentation pools; if they do, update room sidecar/validator/generated
pins as a declared capacity-only asset change and keep the GLB unchanged.

Run the topic gates plus direct asset validation. Foreground acceptance must walk a
closed loop along all four room sides and through current/remembered transitions.
Record a screenshot at each corner. No side may vanish, no old face may blink, and
only the wall actually occluding the hero may cut away.
