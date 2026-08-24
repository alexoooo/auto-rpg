# Session 07 -- move the camera with a middle-button drag

## Outcome

Holding middle mouse and dragging orbits around the followed fighter. Shift+middle drag pans
the focus over the arena floor. Wheel still zooms and `L` alone toggles target lock. Camera
gestures never move a hand, press an action, or alter a fight record.

## Implement

1. At `src/buttons.ts` and `src/input.ts:353-425`, remove the auxiliary-button lock action.
   Keep `L` as the named lock control. Start a `CameraGesture` on middle `pointerdown`, capture
   that pointer, and end it on up, cancel, blur or pause.
2. While the gesture is active, consume pointer deltas before the absolute hand mapping at
   `src/input.ts:353`. Plain middle drag changes yaw/pitch; Shift+middle changes ground-plane
   pan. It must not write either `HandIntent` or button level.
3. Add pure orbit/pan math at `src/camera.ts:1`: wrap yaw, clamp pitch, and clamp pan to the
   inner faces of the authoritative room walls. Camera state stays in the host/controller,
   outside `InputState`/`Intent`.
4. At `src/main.ts:771-835`, compose the gesture offsets with Fixed and Overhead presets.
   Switching presets retains a bounded focus and does not snap the fighter's hand.
5. Update `index.html:70-90`, README controls and the help test. Preserve browser autoscroll
   suppression and pointer-event semantics documented in `AGENTS.md`.

```ts
interface CameraGestureState {
  mode: "none" | "orbit" | "pan";
  pointerId: number | null;
  yaw: number;
  pitch: number;
  panX: number;
  panZ: number;
}
```

## Tests first

Add pure/input tests:

- `middle_drag_orbits_without_moving_either_hand_or_toggling_lock`
- `shift_middle_drag_pans_inside_the_arena_bounds`
- `camera_yaw_wraps_and_pitch_pan_clamp_in_both_modes`
- `pointercancel_blur_pause_and_lost_capture_end_the_camera_gesture`
- `camera_orbit_changes_no_fight_record`

Let auxiliary movement reach hand mapping, omit lost-capture cleanup, and feed camera state
into one `Intent` field. Each mutation must fail its own test.

## Acceptance

Orbit a running and decided bout through a full turn in both camera modes, pan to every wall,
zoom at both clamps, cancel mid-drag and resume arm control. There must be no hand jump, lock
toggle, stuck gesture, wall pass-through or change to a seeded headless record.

```powershell
npm test
npm run check
npm run build
```
