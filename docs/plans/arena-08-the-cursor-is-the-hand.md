# Arena 08 -- the cursor is the hand

**Status:** implementation complete; foreground visible-browser acceptance remains owed.
Blocks 09.

Session 06 proved a relative, pointer-locked hand. The owner has now chosen the ordinary
game cursor instead: the cursor stays visible and movable, the hand follows its clamped
position, and reaching an edge saturates rather than trapping the pointer. This session
changes that browser mapping before any feel constant is calibrated.

It does not change `CommandV1`, arm mechanics or reachability. The simulator remains the
authority on the achieved limb; the browser only chooses a desired target inside the
already exported envelope.

## Current seams

The mapping remains inside [`ArenaInput`](../../client/src/arena/arena-input.ts#L69).
Route event ownership currently begins at the arena's
[`pointermove` handler](../../client/src/arena/arena.ts#L1517), while camera wheel
ownership begins at the adjacent [`wheel` handler](../../client/src/arena/arena.ts#L1663).
Active-camera and preview lifetime remain behind
[`createArenaStage`](../../client/src/arena/scene.ts#L1809). Replacing pointer lock must
delete its lifecycle from these owners rather than layering a second input path over it.

## Absolute cursor reducer

Add a pure `ArenaHandCursor`. It samples `clientX/clientY` inside the active promoted
viewport and computes `qx = 2u - 1`, `qy = 1 - 2v`. Clamp `(qx,qy)` radially to the unit
disc, not independently by axis. `ArenaInput` keeps the synchronized shoulder-relative
rest vector `H0`; a sample requests
`H = shoulder + H0 + cameraRight * qx * armLength * CURSOR_HAND_SPAN_ARM_LENGTHS
                   + cameraUp    * qy * armLength * CURSOR_HAND_SPAN_ARM_LENGTHS`.
It never reads `movementX/Y`, never accumulates motion beyond an edge and never needs a
neutral baseline sample. With a static body/camera, A -> B -> A returns the exact target,
and a first sample near any edge immediately requests that side of the envelope.

Encode `H` through the client-known CommandV1 height and reach bounds, including exported
`armMinReach`; call this the **encodable envelope**. Rust's coupled `reachable_extent` law
may further clamp the achieved pose and session 10's desired/achieved markers expose that
difference. The client does not mirror or claim the authoritative annulus.

Session 06's extension, signed elbow plane and effort law remain: secondary drag changes
distance along the current shoulder-to-target direction, and primary drag derives effort
and plane from successive absolute desired points and timestamps. Primary and secondary
use pointer capture and consume their final `pointerup` delta under the old owner before
clearing power. `pointercancel` and `lostpointercapture` clear power/capture without an
invented final delta. Middle, wheel and `Shift` + middle remain camera-only.

Human fights start through the ordinary **Fight** action. Remove `requestPointerLock`,
`pointerlockchange`, `pointerlockerror`, acquisition timeout and **Take controls** gating.
Blur, hidden, pause, finish, renderer loss and disposal release captures and clear powered
buttons. They do not discard the selected Human side. Touch keeps
the session-06 captured relative grammar; hybrid mouse input is accepted only after all
touches lift; synthetic compatibility mouse events are ignored.

## Pointing guide

The screen reticle remains the exact desired command target. Add a restrained Babylon
guide, refreshed without another engine or observer:

- a dotted floor segment from the controlled body's ground point to the desired target's
  ground projection;
- a vertical dotted segment from that projection to the desired hand; and
- a small desired-hand marker at the endpoint.

Use session 06's simulation-to-scene transform once. The guide is presentation-only and
uses every stage-camera layer but no preview layer. Input moves the desired guide before
the next publication; body/camera redraw moves its presentation without rewriting any of
the 61 command bytes. Selection, policy control, missing/severed primary arm, finish,
renderer terminal and disposal clear every node. Pause may retain the parked guide.

The desired reticle is clamped to the active viewport along the ray from viewport centre,
with an eight-CSS-pixel inset. It must preserve offscreen direction; independent x/y
clamping is not acceptable. A distinct achieved marker and error line remain session 10's
diagnostic work.

## Files

| file | change |
|---|---|
| `client/src/arena/arena-hand-cursor.ts` | new pure viewport-to-unit-disc reducer |
| `client/src/arena/arena-input.ts` | absolute rest-anchor placement without changing command grammar |
| `client/src/arena/hand-guide.ts` | new scene-owned desired floor/vertical guide |
| `client/src/arena/hand-reticle.ts` | active-viewport directional clamp and saturation state |
| `client/src/arena/stage-camera.ts` | active viewport rectangle and camera-change serial |
| `client/src/arena/scene.ts` | guide lifecycle and projection exposure |
| `client/src/arena/arena.ts` | unlocked event ownership; delete pointer-lock lifecycle and Take gate |
| `client/src/arena/picker.ts` | honest Human control label |
| `web/index.html` | remove Take-controls UI; cursor/guide state styling |
| `client/test/studio-shell.test.mjs` | absolute cursor, capture, lifecycle and byte ownership |
| `client/test/render-contract.test.mjs` | viewport clamp and guide geometry/layers/lifecycle |
| `docs/architecture/browser-runtime.md` | unlocked cursor and capture lifecycle |
| `docs/design/combat.md` | absolute-to-relative host mapping and saturation boundary |
| `docs/performance/arena-human-control.md` | cursor samples replace pointer-lock samples |

## Tests

`client/test/studio-shell.test.mjs`:

- `the_first_sample_near_each_edge_requests_the_corresponding_envelope_side`
- `cursor_a_to_b_to_a_is_exact_and_repeated_samples_past_each_edge_are_equal`
- `absolute_hand_a_to_b_to_a_returns_to_the_exact_rest_anchored_command`
- `movement_x_and_y_cannot_change_the_absolute_cursor_result`
- `a_human_fight_starts_without_take_controls_or_pointer_lock`
- `the_unlocked_cursor_path_registers_no_pointer_lock_lifecycle`
- `blur_hidden_and_pause_clear_every_held_input`
- `two_touch_parallel_motion_is_extension_while_opposed_motion_is_camera_only`
- `mouse_motion_changes_no_navigation_or_body_yaw_byte`
- `camera_motion_with_a_non_neutral_hand_changes_no_command_byte`
- `route_saturation_survives_raf_and_farther_edge_samples_do_not_raise_effort`
- `mouse_capture_survives_either_button_release_until_both_are_up`
- `touch_up_reduces_its_final_position_while_cancel_does_not`
- `touch_claim_releases_mouse_capture_and_suppresses_compatibility_mouse`
- `human_frame_zero_and_the_first_control_clock_tick_reach_the_live_route`
- `selection_finish_and_disposal_clear_the_desired_hand_guide`
- `renderer_terminal_clears_and_disposes_the_captured_stage_once`

`client/test/render-contract.test.mjs`:

- `the_desired_guide_uses_the_body_floor_projection_and_exact_desired_endpoint`
- `a_remembered_eye_promotion_uses_three_quarter_basis_projection_and_viewport_while_eyes_are_closed`
- `relative_zero_dt_preserves_an_initialized_chase_and_positive_dt_is_partition_independent`
- `preview_drag_orbits_only_the_hit_side_and_reset_restores_the_initial_camera`
- `behind_camera_hand_direction_is_aspect_correct_in_wide_and_narrow_views`

Mutation-check the behavior by replacing absolute placement with accumulated deltas,
removing the radial clamp, reading `movementX`, retaining pointer-lock gating, swapping
sim y/z in the guide and
restoring independent x/y reticle clamping. Each named test must fail before restoration.

## Acceptance

1. The OS cursor remains visible and is never locked or warped.
2. The hand follows cursor motion until the nearest encodable target and then visibly
   saturates without accumulating hidden motion.
3. Primary/secondary weapon gestures, camera gestures and body keys remain disjoint.
4. The dotted floor/vertical guide and desired marker identify the commanded point in
   Fixed, Relative and promoted first-person views.
5. Pause, focus loss, touch switching and disposal cannot leave a powered gesture or a
   stale guide.

## Hash expectations

**Nothing moves.** This is a TypeScript input mapping and presentation change. Command
bytes for a given reduced delta remain session 06's bytes; no Rust, wasm, scenario,
fingerprint or trace schema changes.

## Verification

```powershell
node --test "client/test/*.test.mjs"
npm run check
npm run check:abi
node tools/check_docs.js
node tools/check_deps.js
npm run dev        # foreground cursor saturation, guide alignment and hybrid-input pass
```
