# Arena 06 -- the blow you aim

**Status:** complete. The integrated native, exact-law, wasm and client gates are green.
Visible feel judgement and calibration remain deliberately owed to session 10.

**Implementation correction (2026-08-20).** Direct-hand acquisition precedes a Human
fight: successful mouse pointer lock or touch capture auto-starts it, and a pause releases
capture so **Take controls** must succeed again before resume. The actuator minimum crosses
in live-only `arenaOpened.armMinReach`; trace JSON and `TRACE_SCHEMA` do not widen. Posed
height is derived from the published body and shoulder, not from static anatomy or world
zero. Babylon camera vectors are converted back to simulation `[x, z, y]` axes before use.

Session 05 gives the player feet, an independently commanded facing and a primary-arm
slot updated at 60 Hz. This session gives that slot a relative, camera-readable virtual
hand with **two powered gestures**: mouse motion places a guard, a primary drag powers a
cut in the view plane, a secondary drag extends or retracts the blade along its own line
-- the source material's own extend verb -- and none of the three turns the body.

## The control invariant

**Body, weapon and camera are three disjoint claims.**

| input | owns | must not write |
|---|---|---|
| `W`/`S`, `A`/`D`, `Q`/`E` | navigation and body yaw | primary arm |
| unmodified mouse motion and a primary drag; a one-finger drag on touch | the primary arm's **cut channel** | navigation, body yaw, camera |
| a secondary drag; a two-finger drag on touch | the primary arm's **extension channel** | navigation, body yaw, camera |
| middle drag and wheel; a pinch on touch | camera | every simulation command |

The claims are enforced twice. `arena-input.ts` has separate pure reducers for body,
weapon and camera events, and the 61-byte encoder receives their results only after the
reducers have answered. Tests compare the untouched byte ranges, not reporter fields.
`ComposedController` then enforces human-versus-policy authority at the simulation
boundary. One protects the host mapping; the other protects command ownership.

The secondary button belonged to the camera when session 04 was first drafted; that
session now parks orbit on the middle button and its file records the reassignment. A
session 06 that silently took a camera button would be the exact one-control-two-owners
defect this table exists to prevent, so the move is written in both places.

Turning the body still physically carries the shoulder and the held weapon. That is a
mechanic. What cannot happen is the reverse: moving the weapon may not author a body turn.

## Relative motion, not an absolute screen cursor

The first draft projected the shoulder to screen and used `pointer - shoulder`. That has
four bad properties: the canvas edge limits a cut, follow motion changes the command under
a stationary mouse, an orbit rebases the weapon without input, and an eye-height camera
may put the shoulder behind its near plane. None survives here.

The arena asks for a relative-delta source from an explicit **Take controls** click. For
a mouse that is pointer lock: while locked, `movementX`/`movementY` are relative deltas
and the OS cursor has no edge. A touch surface needs no lock -- a finger's movement is
already a delta stream and lifting it ends the gesture -- so touch takes pointer capture
on the canvas instead, and a lifted-and-replaced finger continues from the stored target
exactly as a camera change does below. The lock is requested at the **Take controls**
click itself when the activating event's `pointerType` is `mouse`, and an unavailable or
refused lock makes `takeArenaControls()` return `CONTROL_POINTER_LOCK_UNAVAILABLE` right
there, before any fight starts under a label the page cannot honour; a session granted
through touch that later sees a mouse gesture raises the same named refusal through the
page's refusal surface, since the take-time return value has already been consumed. This
is a client capability failure, not an arena-config byte, so it does not spend a Rust
refusal code. Escape, blur, a hidden document, pause and the end of a fight release the
capture and clear every powered-button level and every held key.

A two-pointer touch gesture is one event signature carrying two meanings, so the
classifier is named rather than implied: over a gesture window, if the spread between the
two pointers changes by more than `TOUCH_PINCH_SPREAD_RATIO` relative to the centroid's
displacement, the gesture is a pinch and belongs to the camera; otherwise it is a
two-finger drag and belongs to the extension channel, with the **centroid's** `dy`
feeding the push. A finger landing or lifting is a press or release for the one-owner
rule below, and a classified gesture keeps its classification until the finger count
changes -- a drag may not become a pinch mid-flight, because one physical movement cannot
be both a zoom and a thrust.

Mouse motion without primary held moves the hand at the resting guard effort. Primary
held marks the same path as a powered gesture. A player can therefore place and park a
blade physically; there is no block verb and no canned guard.

## The virtual hand is a stored target

The client stores the last commanded `ArmTarget` and `swing_plane`, not a pixel. For each
unconsumed pointer delta it reconstructs that target's desired hand point, moves it in the
active camera's screen plane and converts the result back into command space.

Let:

- `S` be the published shoulder in world space;
- `H` be the desired hand point reconstructed from the stored bearing, height and reach;
- `R` and `U` be the active camera's world-space right and up unit vectors;
- `L` be the published arm length;
- `(dx, dy)` be one relative pointer delta in CSS pixels; and
- `k` be `VIRTUAL_HAND_SENSITIVITY`, measured as arm lengths per CSS pixel at the
  reference viewport height.

Then:

```text
delta = (R * dx - U * dy) * L * k
candidate = H + delta
planar = candidate.xy - S.xy
bearing_world = atan2(planar.y, planar.x)
bearing = bearing_world - body_yaw                 # torso command frame
height = clamp((candidate.z - body.z) / posed_standing_height, 0, 1)
reach = clamp(length(planar) / L, min_reach, 1)
```

`min_reach` is the actuator's published `ARM_MIN_REACH_RAW / 65_536`, not another typed
quarter. `crates/web` adds `arm_min_reach_raw()` beside the command-layout exports and
`ARENA_EXPORTS` requires it. `tools/wasm_check.js` asserts the export agrees on native and
wasm and that the client conversion uses the returned value. This is a scalar capability
export, not a command-layout change; no layout version moves.

The mapping deliberately reconstructs and stores a command target rather than pretending
the two-dimensional mouse names an unconstrained Cartesian joint. The simulator remains
the authority on exact reachability. Session 10 displays commanded and achieved hand
points together so its clamp is visible instead of misdiagnosed as pointer lag.

## The third axis cannot be projected, so it gets its own gesture

The cut mapping moves the hand point in the camera's screen plane, which is two degrees
of freedom; the target has three. The missing one is depth along the view direction, and
**no projection recovers it in any view**: a pixel names a ray, and intersecting that ray
with the reach sphere around the shoulder yields a direction -- bearing and height --
while the distance along that direction is simply not present in a two-dimensional input.
The question was asked directly of the 3/4 view, and the honest answer is that what any
view has is a *leak*, not an axis. Both cameras are pitched -- the 3/4 placement looks
down at 30 degrees (`client/src/arena/geometry.ts:469`) and the eye camera is mounted
`FIRST_PERSON_PITCH_DEGREES = 25` down (`geometry.ts:450`, `scene.ts:793`) -- so the
screen's up vector carries `sin(pitch)` of world-forward, about 0.5 and 0.42 of a unit
respectively, and a vertical stroke therefore moves reach *and* height together.
Extension through that leak rides the height axis and dies at its clamp: pulling the
tucked guard forward in first person also drags it toward head height, where
`clamp((candidate.z - body.z) / posed_standing_height, 0, 1)` saturates. A mid-height thrust cannot be
aimed by riding a height leak in either view, and a scheme whose only depth control is a
camera-pitch artifact is not a control scheme.

So extension is its own gesture, on the source material's own precedent: Die by the Sword
carried an extend action beside the swing, and it is the half of that pair worth keeping
(bend is what the elbow plane and the retract direction already cover). While the
**secondary** button is held -- a two-finger drag on a touch surface -- vertical pointer
motion scales the shoulder-to-hand vector instead of moving the point in the screen plane:

```text
push = -dy * EXTEND_DRAG_SENSITIVITY * L
o = H - S
s = clamp((|o| + push) / |o|, s_min(o), s_max(o))
H' = S + o * s
```

`s_min` and `s_max` are the scale bounds of the **encodable envelope** along the held
direction: the largest interval of `s` that keeps `reach = |planar| / L` inside
`[min_reach, 1]` **and** `height = (candidate.z - body.z) / posed_standing_height`
inside `[0, 1]`,
whichever bound saturates first. The clamp is on the scale factor and never on the
re-encoded fields -- clamping bearing, height and reach separately after the fact would
bend the held direction a little on every delta, and a stored target near the encoding's
ceiling (reach 1 at height 1 reconstructs to more than one arm length of 3D distance)
would even *retract* under a naive distance clamp. `|o|` cannot be zero because the
stored reach already carries the `min_reach` floor.

Pushing the mouse away extends; pulling it back retracts. The direction from shoulder to
hand is held exactly at every stop, and every stop survives the encode round trip, so a
fast secondary push with the point already on line **is** the thrust. "Full extension"
means the envelope boundary along the held direction -- the arm's length at shoulder-level
directions, the height ceiling at steep ones -- and session 10's drill measures against
that envelope rather than against a sphere the encoding cannot store. `dx` is
deliberately dead in this channel: a gesture that swung and extended at
once would reintroduce the coupling the two channels exist to remove, and a player who
wants both alternates buttons, which the stored target makes cheap.

Because the axis is the arm's own and not the camera's, the gesture means the same thing
in every view. That is the property this amendment exists for: **one scheme, both views**,
and first person loses nothing the 3/4 view has.

**One delta has one owner.** If both powered buttons are held, the most recently pressed
owns every delta until it is released, and its release returns ownership to the button
still held. Under pointer lock a second button on an already-active pointer arrives as a
`pointermove` whose `buttons` bitmask changed -- one event carrying both movement and the
transition -- so the boundary is pinned too: a delta arriving in the same event as a
button transition belongs to the pre-transition owner, ownership and the dead-zone
accumulators change from the next event, and a returning owner's accumulated travel
resumes rather than resets. The rule is arbitrary exactly where it is arbitrary and the
both-buttons test pins the transition event, not just the steady state, because two
reducers silently sharing one movement is the same defect as a camera delta that also
cuts.

**If two channels prove too stiff in the control lab**, the recorded fallback is not a
third gesture but the composition seam the arena already owns: a per-action weapon assist,
where the human keeps the fields they steer well and a chosen policy fills the rest --
the off hand already demonstrates the shape. Session 10 makes that call from its
diagnostics; this session does not make it in advance.

## Why camera motion cannot move the weapon

The camera basis is sampled **only when an unconsumed weapon delta arrives**. Follow,
orbit, zoom or viewport promotion with no weapon delta leaves the stored arm bytes
unchanged. A middle drag is consumed by `StageCamera` and never reaches either weapon
reducer. When it ends, the next weapon delta starts from the stored world target
and uses the new camera basis, so there is no absolute cursor to rebase and no first-frame
jump.

This is also the first-person answer. The mapping never projects a shoulder through the
eye camera. It uses the camera's right/up basis and a published three-dimensional shoulder,
both well-defined when the camera sits at eye height. Switching from 3/4 to first person
without mouse motion changes no staged command; the next physical movement reads in the
new view's plane.

## The cut is the path, not an attack button

The desired hand point changes every input sample, and the actuator chases that moving
target. That trajectory is already the requested speed of the cut. `effort` must not encode
the same speed a second time from zero: in the actuator it scales available acceleration,
so a tiny movement at near-zero effort can be less able to follow than the stationary
half-effort guard it left.

The mapping is therefore:

```text
uncaptured or stopped          neutral navigation; no powered gesture
mouse move, no button          move the target in the view plane; effort = HUMAN_ARM_RESTING_EFFORT
either button, below deadzone  the channel's own motion at HUMAN_ARM_RESTING_EFFORT;
                               no effort uplift, no plane update
primary drag past deadzone     move the target in the view plane;
                               effort = HUMAN_ARM_RESTING_EFFORT
                                  + (1 - HUMAN_ARM_RESTING_EFFORT)
                                    * clamp(speed / FULL_EFFORT_SPEED, 0, 1)
secondary drag past deadzone   scale the shoulder-to-hand distance; the same effort law
a release                      changes nothing itself; the target stays where it was left
```

`HUMAN_ARM_RESTING_EFFORT` is the script's existing half, read from the one owner session 05
already used. A moving hand therefore never receives less authority than a held guard.
A slow cut remains slow because its target traverses a slow path; a fast cut asks the arm
for more acceleration to stay with a fast path. Damage still comes from the achieved
weapon velocity at contact, not from a host-authored damage scalar. The same law on the
extension channel is what makes a thrust a thrust: a slow secondary push is a probe at
little more than guard authority, and a fast one asks the arm for the acceleration to
arrive with the point.

Below `SWING_DRAG_DEAD_ZONE_PX` of accumulated powered-button travel, the gesture is a
placement rather than a powered one. The dead zone gates only the effort uplift, and on
the cut channel the elbow-plane update; it never freezes bearing, height or reach, and it
never freezes a slow extension. Hand tremor therefore does not turn a guard into a full
cut or a probe into a lunge, while fine placement remains possible.

## The elbow plane has an actual signed construction

"The drag direction about the shoulder-to-hand axis" is not an implementation. This
session spells out the basis used by `combat::limb::elbow_point` so a wrap or reflection
cannot choose the answer accidentally.

Let `a = normalise(H - S)` be the shoulder-to-hand axis after the target update. Construct
the zero-plane vector exactly as the simulator describes it: world down projected
perpendicular to `a`, falling back to world forward when the axis is vertical. Let
`b = normalise(a x zero)`. Convert the screen delta to world `g = R * dx - U * dy`, then
project it perpendicular to the axis:

```text
tangent = g - a * dot(g, a)
plane = atan2(dot(tangent, b), dot(tangent, zero))
```

If the tangent is zero or the gesture remains inside the dead zone, hold the last plane.
The extension channel never enters this construction at all: it moves the hand along `a`,
which has no perpendicular tangent to offer, so it holds the plane by construction rather
than by a special case.
Otherwise choose the equivalent angle nearest the last commanded plane before encoding
its wrapping `u16`; this prevents a one-raw crossing at the angle seam from asking the
elbow to reverse a whole turn. `the_plane_crosses_the_angle_seam_by_the_short_way` mutates
that unwrapping and must fail before the test is trusted.

The hand path is the cut. The elbow plane chooses how the joint folds while following it;
the plan does not misname it as a second hidden swing verb.

## Feel constants

These provisional implementation values make the reducers testable. They are not feel
measurements: session 10 owns foreground remeasurement and may replace each only with its
documented two-sided judgement.

```ts
/**
 * Arm lengths of desired-hand travel per relative CSS pixel at the reference
 * viewport height. Pointer lock makes this sensitivity rather than a range.
 * Too low cannot cross the body in one deliberate mouse stroke; too high crosses
 * the whole reachable command space in ordinary hand tremor.
 */
export const VIRTUAL_HAND_SENSITIVITY = 0.006;

/**
 * Arm lengths of shoulder-to-hand distance per relative CSS pixel of secondary
 * vertical travel, at the reference viewport height. Too low and a full thrust
 * from the tucked guard needs more than one deliberate push; too high and a
 * probe cannot settle anywhere between the guard and full extension.
 */
export const EXTEND_DRAG_SENSITIVITY = 0.004;

/**
 * How much two-pointer spread change, relative to centroid travel over the
 * gesture window, makes a two-finger touch gesture a pinch for the camera
 * instead of an extension drag. Too low and a slightly uneven two-finger push
 * zooms instead of thrusting; too high and a deliberate pinch extends the arm.
 */
export const TOUCH_PINCH_SPREAD_RATIO = 0.75;

/**
 * Accumulated powered-button travel below which a gesture adds no effort uplift
 * or plane update, on either channel. Zero turns tremor into a cut or a lunge;
 * above a tenth of the reference viewport hides a genuine wrist cut. It gates
 * neither target placement nor slow extension.
 */
export const SWING_DRAG_DEAD_ZONE_PX = 6;

/**
 * Pointer speed that reaches effort one from the resting half. The path already
 * carries speed, so this is tracking authority, not a second velocity command.
 */
export const SWING_DRAG_FULL_EFFORT_PX_S = 900;

/** Reference CSS height for viewport-normalised gains; a scale, not feel tuning. */
export const VIRTUAL_HAND_REFERENCE_VIEWPORT_PX = 1_000;
```

CSS pixels rather than device pixels are deliberate: changing device pixel ratio cannot
change the same physical browser gesture. Viewport-height normalization prevents a small
promoted first-person viewport and the large 3/4 viewport from having unrelated gains.
Session 10 samples both rather than assuming the normalization feels equal.

## What can be measured before the final fight

The deciding row remains the owner's hands, but four diagnostics keep "felt good" from
being the only evidence:

| quantity | why it is worth a number |
|---|---|
| target-to-achieved hand error by tick | distinguishes a bad mapping from an actuator that cannot keep up |
| effort distribution | catches a mapper collapsed to the resting half or full effort |
| weapon-on-body contacts and severances | distinguishes deliberate energetic blows from continuous rubbing |
| human win rate against `tactical` | useful only beside the cadence control below |

**The cadence control is not optional.** A human submits every tick and a policy submits
every `Stats::decision_period()`, up to 30 ticks. Replay the human's recorded command
stream against the same opponent with submissions thinned to the body's decision period.
If the win disappears, say that reaction cadence bought it; do not retune a mouse constant
until it looks like aiming.

## What this session must not change

- **No mechanic.** Not the actuator, contact solver, stance limits or a spec row. A slow
  achieved hand is a measured finding for another topic and would move pins.
- **No policy.** The off hand remains the configured policy's, including its plane.
- **No pointer-derived yaw.** Adding one is a control-contract failure, even if it makes
  a demo easier to win.
- **No absolute `clientX`/`clientY` sword mapping.** Those values may position UI before
  capture; they do not enter a staged arm target.
- **No delta reaches two reducers.** Middle is camera-only; wheel is zoom-only; primary,
  secondary and unmodified motion are arm-only, and inside the arm the one-owner rule
  above hands each delta to exactly one channel.

## Files

| file | change |
|---|---|
| `client/src/arena/arena-input.ts` | body/weapon/camera reducers, stored hand target, cut and extension channels with the one-owner rule, effort and signed plane |
| `client/src/arena/arena.ts` | **Take controls**, pointer-lock and touch-capture lifecycle, gesture routing and per-tick sampling |
| `client/src/arena/stage-camera.ts` | exposes the active camera right/up basis; consumes only its own button gestures |
| `client/src/arena/scene.ts` | exposes sim-axis camera basis and desired-hand projection through `ArenaStage` |
| `client/src/arena/hand-reticle.ts` | new: projects the stored desired hand and shows capture/off-screen state; presentation only |
| `crates/web/src/lib.rs` | `HostSource` begins copying its claimed primary-arm target, grip/release and plane; `arm_min_reach_raw()` capability export; historical `drive_hero` comment repair |
| `client/src/runtime/arena-recorder.ts` | `ARENA_EXPORTS` and `ArenaExports` gain `arm_min_reach_raw` |
| `client/src/protocol/messages.ts`, `client/src/runtime/arena-client.ts` | live opening carries and validates `armMinReach` before chunks |
| `client/src/fight/source.ts`, `client/src/fight/live.ts` | live-only optional capability, without widening trace JSON |
| `client/src/arena/picker.ts`, `web/index.html` | honest direct-hand label, Take-controls status, capture and reticle presentation |
| `client/test/{studio-shell,render-contract,worker-protocol,arena-stream}.test.mjs` | reducer, route, camera-axis, capability and malformed-opening behavior |
| `tools/wasm_check.js` | native/wasm capability equality and a nonzero staged height/reach/plane fixture |
| `docs/design/combat.md` | the independent human hand, target path and effort semantics beside "The swing" |
| `docs/performance/arena-human-control.md` | new: diagnostic schema and the cadence-control recipe; values land in 07 |

## Tests

`client/test/studio-shell.test.mjs`:

- `mouse_motion_changes_the_arm_and_not_the_body`
- `the_hand_reticle_clamps_marks_clears_and_disposes_without_owning_input`
- `height_is_body_relative_uses_the_posed_standing_height_and_is_continuous`
- `reach_uses_the_exported_physical_minimum_and_not_a_second_quarter`
- `a_guard_moves_at_resting_effort_and_fast_powered_paths_order_effort`
- `a_secondary_drag_scales_the_shoulder_to_hand_distance_and_holds_its_direction`
- `extension_round_trips_and_clamps_to_the_exported_reach_envelope`
- `pitched_three_quarter_and_first_person_bases_move_in_sim_camera_axes`
- `powered_cuts_encode_signed_elbow_planes_and_cross_the_angle_seam_the_short_way`
- `the_most_recent_powered_button_owns_each_whole_delta_and_new_presses_get_a_new_dead_zone`
- `two_touch_parallel_motion_is_extension_while_opposed_motion_is_camera_only`
- `a_stationary_second_touch_is_classified_after_the_bounded_gesture_window`
- `lifting_one_of_two_touches_rebaselines_the_remaining_drag`
- `a_severed_primary_releases_capture_but_held_body_input_keeps_the_worker_draining`
- `capture_loss_before_the_first_chunk_does_not_resume_a_human_fight`
- `a_pending_pointer_lock_is_bound_to_the_selected_human_matchup`
- `a_late_pointer_lock_grant_after_route_disposal_is_released`
- `relative_hand_motion_ignores_absolute_client_coordinates`
- `camera_motion_with_a_non_neutral_hand_changes_no_command_byte`
- `pointer_lock_rejection_and_timeout_are_named_before_a_fight_starts`
- `blur_visibility_pause_and_pointer_lock_loss_clear_every_held_input`

`client/test/render-contract.test.mjs`:

- `the_virtual_hand_camera_basis_is_converted_back_to_sim_axes_before_use`

`client/test/worker-protocol.test.mjs`:

- `arm_min_reach_is_required_integer_and_inside_the_physical_command_range`

`tools/wasm_check.js` asserts `arm_min_reach_raw()` and a staged command carrying nonzero
height, reach and plane identically on both targets.

The Rust side also asserts that host authority copies only the configured primary arm,
leaves the policy-owned off hand byte-for-byte intact, and records the composed nonzero
arm fields into replay. Session 05 deliberately claimed the arm while leaving its
observation-relative neutral seed untouched; copying staged arm fields here is the
completion of that seam and therefore a Human-only submission change, not a mechanic or
an unattended-policy change.

The most important mutation is the ownership one: temporarily feed weapon `movementX`
into `body_yaw` and watch `mouse_motion_changes_the_arm_and_not_the_body` fail. A test that
only observes the arm would stay green against the defect this revision exists to prevent.

## Acceptance

1. Relative mouse motion continuously changes bearing, height and reach with no screen
   edge and no projected shoulder.
2. A primary drag changes the target path, effort above a resting-half floor and the
   signed elbow plane; each is asserted separately.
3. A secondary drag scales reach along the held shoulder-to-hand direction under the same
   effort law, and a straight thrust from the tucked guard to full extension is reachable
   in first person with no footwork -- the same gesture, meaning the same thing, in the
   3/4 view.
4. Mouse-only input changes no navigation or yaw byte, and camera-only input changes no
   staged command byte.
5. Switching or moving cameras with a stationary mouse leaves the weapon target unchanged,
   including in first person.
6. Pointer-lock loss and every page stop clear power and movement rather than leaving a
   held cut behind.
7. No mechanic, policy, command layout or pin moves.

## Hash expectations

**Nothing moves.** The mapping is TypeScript and the Rust addition publishes an existing
constant without entering any fixture. A moved pin means the session changed submission
or mechanics and is a failure, not a re-record.

## Verification

```powershell
cargo test
cargo build --release
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
cargo run --release -p lab -- embodied --corpus-digest
node --test "client/test/*.test.mjs"
npm run check
node tools/check_docs.js
npm run dev        # foreground: capture, place a guard, drag cuts and a thrust in both views, then release capture and stop
```
