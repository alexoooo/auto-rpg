# Concept production 02 -- six view and camera modes

**Status:** implemented. Presentation-only; no registered hash moved.

Replace the two-row mode table in `client/src/render/presentation-mode.ts` with one
renderer-owned registry:

| mode | camera | art | fog | diagnostics |
|---|---|---|---|---|
| World | following isometric | full | on | minimal |
| Geometry | following isometric | ghosted | on | hitboxes, regions, reach, facing |
| Top Down | following orthographic overhead | full | on | minimal |
| First Person | hero eye perspective | full | on | minimal |
| Free | orbit/pan/zoom | full | on | optional |
| Dev | overhead | diagnostic geometry | off | all |

World follow uses an 8% screen dead-zone and damped tracking; reset, teleport and
descent snap. First Person hides only self-obscuring head/torso meshes and retains
arms/equipment. Free replaces the separate camera toggle and continues refusing
simulation commands. `G` cycles, Shift+G reverses, and the top-right selector chooses
any row directly. Every row reuses one scene, Worker, snapshot and identity registry.

Red-first tests:

```text
the_six_view_modes_share_one_worker_snapshot_and_identity_registry
world_camera_follows_inside_the_dead_zone_and_snaps_after_reset
first_person_hides_only_self_occluding_dress
free_mode_refuses_simulation_commands_and_restores_follow_on_exit
```

Run renderer/studio/input tests, TypeScript, build, docs and diff gates.
