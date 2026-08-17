# Concept production 01 -- controls, HUD, and stationary idle

**Status:** implemented. Presentation/host only; no registered hash moves.

Expose the existing wasm `set_control`, `control`, and `set_input` exports through
the v2 Worker protocol. Extend `LegacyClientCommand` in
`client/src/protocol/messages.ts` with explicit control-mask and live-input requests;
the Worker reads `control()` back and reports the accepted mask. No frame column or
simulation rule changes.

Mouse orders remain the default after init/reset and direct Movement starts released.
Zero live input is submitted immediately. Enabling Movement hands the feet to tank
controls; disabling it returns them to mouse orders and policy locomotion. Key release
sends zero. Action selects slots 1/2; Aim makes mouse movement authoritative and
primary press/release sends the attack edge. With Aim off, primary click remains Goto.

Mouse aim defaults on. With Movement owned, W/S are forward/back, A/D strafe,
and held Q/E integrate a signed fixed-point turn at 512 raw angle units per
simulation tick, making 32 ticks exactly one quarter-turn. The browser sends local tank axes and owns no duplicate float
heading; Rust rotates them from authoritative facing. Number keys and Shield/Sword
buttons request slots; Escape clears held keys and submits zero.

With mouse control, no standing order, and no live hostile, the browser host
suppresses only the hero policy's locomotion, leaving limb, slot, and combat
decisions intact. A Goto reenables policy navigation; so does a live hostile,
because Hold means no destination rather than no defence. Clearing the order in a
clear room returns to stationary local idle.

Recompose `web/index.html`: health/status bottom-left with death-only Respawn, equipment bottom-centre,
pause plus Movement/Action/Aim bottom-right, FPS/worst frame top-centre, and modes/help
top-right. Move seed and configured enemy spawning into Systems, remove numeric
Goto, and place the drawer above bottom controls so it cannot overlap them. Remove
the meaningless World/Expedition title chip.

Red-first tests:

```text
mouse_orders_are_default_and_direct_tank_input_starts_released
tank_controls_are_hero_relative_and_key_release_sends_zero
held_tank_turn_rotates_a_stationary_hero_until_release
mouse_default_idles_locally_until_a_goto_exists
mouse_hold_stays_local_for_ten_seconds_but_still_finishes_a_hostile_fight
control_switches_render_wasm_readback_not_requested_state
the_game_hud_keeps_performance_and_modes_above_the_world
```

Run worker protocol, studio shell, renderer, TypeScript, build, docs and diff gates.
