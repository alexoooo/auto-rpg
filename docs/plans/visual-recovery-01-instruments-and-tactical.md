# Visual recovery 01 -- restore instruments and Tactical view

**Status:** planned. Presentation-only; no registered hash moves.

This session restores two useful v1 capabilities before further art work: the
always-visible FPS/worst-frame chip and the top-down Tactical comparison. It does not
change simulation, snapshots, orders, picking, fog publication or authored assets.

## FPS meter

Add `client/src/render/frame-meter.ts` with a pure fixed-window accumulator. Mirror
the v1 contract at `web/main.js#L1598`: every 500 ms publish rounded frames/second and
the worst raw frame interval in that same window. Reset on mount, route teardown and
after document visibility resumes so a hidden pause cannot report a fake long frame.

Add `#game-fps` to the always-visible game HUD in `web/index.html#L315`, beside the
party/status instruments rather than inside Systems and capture. Feed it from the
existing `advanceFrame(now)` requestAnimationFrame loop in `client/src/v2.ts#L349`.
This meter is observational only and independent of the long reference capture in
`client/src/render/performance.ts`.

Red-first tests:

```text
the_game_frame_meter_rolls_every_half_second_and_reports_the_worst_interval
the_frame_meter_discards_hidden_time_and_resets_between_route_mounts
the_game_route_keeps_fps_visible_outside_the_systems_drawer
```

Temporarily change the 500 ms boundary to 501 and remove the visibility reset; each
corresponding test must fail before restoration.

## Tactical presentation

Add `client/src/render/presentation-mode.ts` with append-only names `world` and
`tactical`. Add a visible `#game-view-mode` control and restore the `G` shortcut in
`client/src/v2.ts#L243`. The label always names the active mode.

`tactical` is the legacy presentation meaning from `web/main.js#L3330`, not policy
code 5:

- switch the live camera to a stable orthographic top-down projection;
- keep authoritative VIS 0/1/2 fog;
- hide authored room dress and combatant dress without disposing them;
- show flat floor/topology, collision discs, facing wedges, weapon/reach, sight,
  health, route, destination, projectiles and event cues from existing snapshot data;
- preserve identical picking, Goto, Withdraw, Spawn, Pause and camera bounds.

Implement the mode at the renderer owner in `client/src/render/renderer.ts#L113`, not
by starting a second renderer or Worker. Extend `ActorPresentation` at
`client/src/render/actors.ts#L43`, `RoomEnvironmentPresentation` at
`client/src/render/room-environment.ts#L300`, and the existing transient presentation
only enough to toggle owned mesh groups. Mode switching must mutate/reuse identities,
lights and shadow lists rather than churn them.

Red-first tests:

```text
world_and_tactical_share_one_scene_worker_snapshot_and_pick_contract
tactical_keeps_published_fog_but_replaces_authored_dress_with_readable_geometry
switching_view_modes_reuses_mesh_identity_and_restores_world_lights_and_shadows
g_cycles_the_game_view_and_the_button_names_the_active_mode
```

Break authored-dress hiding and VIS 1 handling separately and observe the named tests
fail. Do not add Dev in this session; Tactical is the missing player-facing control.

## Documentation and verification

Update `docs/architecture/browser-runtime.md`,
`docs/reference/renderer-contract.md`, README controls, and the room matrix. Run:

```powershell
node --test client/test/render-contract.test.mjs
node --test client/test/studio-shell.test.mjs
npm run check
npm run build
node tools/check_docs.js
git diff --check
```

Foreground acceptance: FPS remains visible in both modes; `G` switches immediately;
Tactical keeps fog and readouts; returning to World restores the same hero, walls,
camera state and current snapshot without reload.
