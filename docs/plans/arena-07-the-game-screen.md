# Arena 07 -- the arena is the game screen

**Status:** complete. Depends on 06; blocks 08.

The arena currently proves every rendering and control seam in one vertically stacked
studio page. This session turns those same views into a fixed game screen before cursor
mapping is calibrated. Selection remains a phase, not part of the fight layout; secondary
views and diagnostics become drawers instead of permanent competitors for the main view.

This is interaction structure, not final art. Production frames, ornament, materials and
VFX remain in the concept-production topic.

## Current seams

The phase switch already hides picker rows in
[`setPhase`](../../client/src/arena/arena.ts#L497), the preview has one scene-owned
constructor at [`createCombatantPreview`](../../client/src/arena/preview.ts#L96), and the
fight camera has one mode/controller surface in
[`StageCameraMode`](../../client/src/arena/stage-camera.ts#L54). The new layout extends
those owners. It does not add another engine, canvas observer or route-level scene. The
one-minute ceilings that must move together are
[`ARENA_MAX_TICKS`](../../client/src/runtime/arena-config.ts#L85) and
[`RECORDING_TICK_CAP`](../../client/src/runtime/arena-recorder.ts#L73).

## Phase and layout contract

`#/arena` owns the viewport through a route-local `position: fixed; inset: 0; height:
100svh` shell. It does not mutate global `html`/`body` styles, so unmount removes the
constraint with the route DOM. The document does not scroll behind it; selection and open
drawers use their own bounded `overflow: auto` regions on short screens. Selection shows
the two previews and picker controls. Fight hides the whole picker rather than leaving it
above or below the stage.

Fight opens with one large three-quarter view. Four closed-by-default controls reveal:

- **[Eyes]**, a left overlay whose open state reserves the left fraction of the shared 3D
  canvas for first-person A and B;
- **[Plans]**, a right drawer containing plan and elevation;
- **[Replay]**, a compressed bottom transport and timeline; and
- **[Details]**, the readout and event log.

The first-person views are Babylon viewports in the same canvas, not DOM panels. The Eyes
DOM owns only translucent tabs/labels above that canvas. Opening it atomically changes
`Scene.activeCameras`, all viewport rectangles, labels and hit tests; closing it removes
both eye cameras and gives three-quarter the whole canvas. CSS cropping is not a valid
implementation. Plan and elevation remain their existing 2D canvases and may be parked as
ordinary DOM content. Closed Plans, Replay and Details also stop their per-frame 2D,
chart and log formatting work rather than drawing invisibly. Drawer state is
presentation-only and never enters a recording.

Two compact health bars remain visible when every drawer is closed. They read the two
published faction-health fractions; they do not infer health from dress visibility or
events. Final carved frames and health hierarchy remain concept-production work.

The functional style is restrained but game-like: the stage is full-bleed black rather
than a card in document flow; Heroes and Monsters reuse their existing blue/red accents
on health, hover and drawer ownership; closed drawers leave only small edge tabs; open
surfaces use one translucent dark panel token so the fight remains visible. Transitions
are CSS-only and disabled by `prefers-reduced-motion`. No new bitmap, GLB, material or VFX
asset lands here.

## Preview ownership

The selection canvas keeps its deterministic rest pose and initial camera from
`client/src/arena/preview.ts`. Pointer-down hit-tests the left or right half, captures that
pointer and orbits only that side. Wheel over a half zooms only that camera. Limits are
named and two-sided: `PREVIEW_ORBIT_LIMIT_DEGREES = 80`,
`PREVIEW_MIN_RADIUS_HEIGHTS = 1.1` and `PREVIEW_MAX_RADIUS_HEIGHTS = 2.5`. Elevation
cannot cross either pole and radius cannot enter the body or lose it beyond the preview
column. **[Reset view]** restores the exact initial camera
and resumes the existing 480-frame turntable; manual interaction pauses the turntable so
wall-clock history cannot change the chosen inspection angle.

Changing a loadout preserves that side's camera. Leaving selection disposes preview
capture and camera state exactly as leaving selection already disposes its dress.

## Fight camera grammar

The camera and weapon retain disjoint gestures:

- middle drag orbits;
- `Shift` + middle drag pans in the active camera plane;
- wheel zooms toward the world point beneath the cursor; and
- in a spectator/policy-only fight, primary drag may also pan, but Human control never
  gives primary or secondary drag to the camera.

Pan ownership is frozen at `pointerdown`; changing `Shift` while captured cannot turn pan
into orbit or vice versa. At focus radius `r`, vertical field of view `fov` and viewport
CSS height `h`, one CSS pixel is `2 * r * tan(fov / 2) / h` world units. Translate camera
and focus together along camera-right for `-dx` and camera-up for `dy`; panning never
changes radius, azimuth or elevation.

Cursor-centred zoom receives normalized CSS coordinates, constructs the active camera ray
and chooses the nearest valid arena-floor or combatant hit `P`. After the existing wheel
law chooses clamped radius `r'` from `r`, scale both camera position and focus about `P` by
`r' / r`; `P` therefore stays under the same CSS point instead of the camera merely
closing on its old centre. A miss retains today's focus-centred zoom. Wheel remains
consumed at either clamp. `Refit` remains the explicit return to canonical framing.

Hover picking uses semantic body ownership on the rendered meshes. The nearest live body
under an ordinary cursor receives one subtle presentation-only outline; pointer leave,
phase change, severed/removed dress, renderer loss and disposal clear it. It emits no
command and no combat event. Session 08's unlocked cursor makes this affordance available
during Human control; no pointer-lock-only fallback is promised.

## Fixed and relative follow

The existing fit/follow/orbit camera remains **Fixed**. Add **Relative**, a chase camera
above and behind the followed body. Its forward direction is published
`EmbodiedStance.hip_yaw`, not requested body yaw and not velocity. Using the followed
anatomy's standing height, position is `CHASE_BACK_HEIGHTS = 1.5` behind and
`CHASE_UP_HEIGHTS = 1.0` above the body origin; the target is
`CHASE_LOOK_AHEAD_HEIGHTS = 1.0` ahead along hip yaw and
`CHASE_TARGET_UP_HEIGHTS = 0.55` above the body origin.
Translation and wrap use session 04's `12 s^-1` host-time damping and the shortest angular
path. No camera state enters authoritative commands.

Relative accepts Follow A or Follow B only. Follow Both disables it with
`RELATIVE_CAMERA_NEEDS_ONE_BODY`; a trace/source without a same-identity stance row refuses
with `RELATIVE_CAMERA_NEEDS_STANCE`. Interpolate body position and `hip_yaw` from the same
two frame identities and alpha already used by the pose, taking hip yaw by the shortest
turn. Do not mix interpolated pose with latest-tick stance. Death, identity replacement or
loss of either endpoint switches to Fixed and reports `RELATIVE_CAMERA_SUBJECT_LOST`.

Because camera basis changes pointer meaning, Relative must land before session 09 tunes
the hand. Promotion, drawers, completed pan/zoom gestures and entering/leaving Relative
increment the existing camera change serial once. Damped chase frames do not increment it.
Session 09 repeats its camera-independence drill across all of them.

## Timeout selection

Add a pre-fight **Time limit** selector. It writes `Matchup.maxTicks`, which
`arenaConfigOf` carries to `ArenaConfig.maxTicks` and the existing Rust
`DuelConfigV1.max_ticks` fingerprint/header/replay path. Ship one, three, five and ten minute
choices; ten minutes is the named browser recording maximum. There is no dishonest
"unlimited" option while the browser retains the full replay for scrubbing.

Split today's dual-purpose constant: `ARENA_DEFAULT_TICKS = 60 * 60` preserves the
shipped one-minute picker value, while `ARENA_MAX_TICKS = RECORDING_TICK_CAP = 60 * 60 *
10` defines the ten-minute browser maximum. Do not multiply today's whole-fight
publication preallocation by ten: make `recordArenaFight` capture into bounded chunk
scratch, post exact used rows, and retain history only through `StreamingFightSource`'s
existing adopted chunks. Replace the whole-fight `RECORDING_EVENT_ROW_CAP` assumption with
per-chunk exact event rows bounded by each publication's exported capacity and dropped-row
counter. Record a ten-minute actual-row history estimate and a worst observed ten-minute
event corpus in the arena performance matrix; any truncation remains an explicit named
result. Reject zero, values above the cap and non-integral UI values by name.
The control is disabled after a fight starts; mid-fight clock changes would alter scenario
identity and are out of scope.

## Files

| file | change |
|---|---|
| `client/src/arena/preview.ts` | per-side orbit/zoom, pointer ownership and deterministic reset |
| `client/src/arena/stage-camera.ts` | pan, cursor-centred zoom, Relative chase and live viewport layouts |
| `client/src/arena/scene.ts` | active-camera/drawer ownership, picking, outline and camera rays |
| `client/src/arena/arena.ts` | fixed phase shell, drawer state, gestures, timeout and health wiring |
| `client/src/arena/picker.ts` | `Matchup.maxTicks`, summaries and pending-start identity |
| `client/src/runtime/arena-config.ts` | separate one-minute default and ten-minute named maximum |
| `client/src/runtime/arena-recorder.ts` | matching bounded recording capacity |
| `client/src/fight/live.ts` | prove adopted chunks, rather than worker scratch, own long-fight history |
| `web/index.html` | game-shell markup, drawers, compact transport and functional styling |
| `client/test/render-contract.test.mjs` | live viewport, ray, pick, preview and chase-camera behavior |
| `client/test/studio-shell.test.mjs` | phase, drawer, gesture, health and timeout lifecycle |
| `client/test/worker-protocol.test.mjs` | default/maximum timeout mirror and bounded-scratch long-history proof |
| `docs/architecture/browser-runtime.md` | fixed shell, drawer/camera ownership and camera gesture grammar |
| `docs/performance/v2-arena-matrix.md` | foreground rows owed for the new default and open drawers |

## Tests

`client/test/render-contract.test.mjs`:

- `preview_drag_orbits_only_the_hit_side_and_reset_restores_the_initial_camera`
- `closing_eyes_removes_both_first_person_cameras_and_expands_three_quarter`
- `pan_translates_focus_in_the_active_camera_plane_without_orbiting`
- `wheel_zoom_keeps_the_cursor_hit_while_hover_owns_only_one_live_body`
- `relative_chase_joins_stance_identity_and_crosses_the_turn_seam_short_way`
- `the_wheel_cannot_put_the_camera_inside_the_body_or_behind_the_arena`
- `camera_gestures_hit_only_the_live_three_quarter_rectangle_after_every_promotion`
- `a_camera_change_serial_moves_for_orbit_zoom_and_promotion_but_not_for_followed_pose_publication`

`client/test/studio-shell.test.mjs`:

- `selection_and_fight_share_one_fixed_shell_with_closed_drawers_and_bounded_timeouts`
- `zero_over_max_and_midfight_timeout_changes_are_refused_by_name`
- `a_wheel_over_the_three_quarter_view_stays_consumed_at_both_zoom_clamps`
- `camera_motion_with_a_non_neutral_hand_changes_no_command_byte`
- `mounting_and_disposing_the_arena_twice_leaves_no_listener_observer_or_frame_behind`

`client/test/worker-protocol.test.mjs`:

- `the_shipped_arrangement_carries_the_dimensions_the_spec_document_states`
- `a_long_event_history_is_retained_through_chunks_not_whole_fight_scratch`

The completed red proofs kept a hidden first-person viewport live through promotion,
deleted the cursor ray from zoom, fed Relative from requested body yaw, and retained
event-row offsets across chunk resets. The named viewport, hit-point, stance and
long-history tests failed before each line was restored. Existing session-06 route tests
continue to pin camera gestures outside `ArenaInput` and Human primary/secondary drags
outside camera pan.

## Implementation record

Landed with one correction found by its new Relative-camera test: the chase offsets are
raw standing-height distances until the existing `scenePoint` conversion. Adding
world-unit heights to raw body coordinates made the chase 65,536 times too small. The
same test now joins stances by full `(index, generation)` identity, blends hip yaw across
the turn seam by its shortest raw delta, and deliberately gives body yaw a different
value so a regression to requested yaw fails.

The recorder keeps only one 31-frame publication scratch window. A 701-frame synthetic
fight retaining 70,100 event rows proves that `StreamingFightSource`'s adopted chunks,
not worker scratch, own long history. The fixed window is capacity-bounded rather than a
reusable transfer-buffer pool; exact chunk copies are the retained replay data.

Automated tests cover state and ownership, not appearance. The full-bleed shell, edge
tabs, reduced-motion treatment, hover subtlety and Relative-camera feel remain owed to a
person in a visible browser, together with the foreground matrix rows.

## Acceptance

1. Selection and fight each fit a foreground `100svh` browser viewport without document
   scrolling; short selection content scrolls internally and other routes are unaffected.
2. Selection previews orbit, zoom and reset independently.
3. Fight opens as one large view with Eyes, Plans, Replay and Details closed.
4. Pan, cursor-centred zoom, hover and Relative chase work without writing a command.
5. The two health bars remain truthful with every drawer closed.
6. A pre-fight timeout up to ten minutes survives config, fingerprint, live header and
   replay; the one-minute default remains byte-identical.
7. A visible-browser pass confirms the full-bleed shell, edge tabs, side accents and
   reduced-motion behavior. Automated tests assert state and render ownership, not CSS
   layout; the diff contains no new presentation asset.

## Hash expectations

**No pinned hash moves.** Camera, layout and health presentation are host-only. The new
timeout values produce new scenario fingerprints only when selected; every pinned fixture
retains the one-minute default. A moved default fingerprint or combat digest is a bug.

## Verification

```powershell
node --test "client/test/*.test.mjs"
npm run check
npm run check:abi
node tools/check_docs.js
node tools/check_deps.js
npm run dev        # foreground game-shell, drawers, cursor zoom and Relative judgement
```
