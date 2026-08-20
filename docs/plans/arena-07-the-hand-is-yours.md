# Arena 07 -- prove the hand is yours

**Status:** ready once session 06 has landed. Blocks 08.

A tactical opponent is a bad calibration instrument. It advances, strikes, blocks, moves
the camera's subject and can end the trial before a player knows whether a failed cut was
their gesture, the mapping or the actuator. This session gives the existing `neutral`
policy a deliberate job: a repeatable control lab in the real arena, using the real body,
weapon, command boundary and 60 Hz drive.

It is not a second simulation mode and it creates no fixture. It is one named picker preset,
a diagnostic overlay and a protocol for playing it.

## The control-lab preset

**Practice hand** selects:

- left: Fighter, sword and shield, control **you**, off hand `tactical`;
- right: Brute, club, `neutral`;
- the ordinary arena seed, spawn and `max_ticks`; and
- 3/4 follow on the human side, with **Reset drill** rebuilding that same configuration.

`neutral` already exists in the arena policy registry and the picker already describes it
as standing still. The preset writes only values the ordinary form can write. It does not
add a practice byte to `DuelConfigV1`, does not enter `Scenario::fingerprint`, and does not
silently freeze collision or damage. A recording from the preset is an ordinary human
fight.

## Feedback that belongs beside the hand

The diagnostic shell answers four questions without turning into final art:

1. **Where did I ask the hand to go?** Session 06's desired-hand reticle, projected from
   the stored command target, not from an OS cursor.
2. **Where is the hand?** A second marker from the published achieved hand. A line between
   them is target-to-achieved error, coloured only by magnitude; it does not invent a
   success threshold.
3. **What did I command?** Bearing, height, reach, effort and elbow plane, beside achieved
   bearing, height and reach. The labels include units or normalized ranges.
4. **What is the body doing?** Body yaw, hip yaw, twist fraction and forced-step fraction,
   plus both health fractions. The primary/off-hand ownership is named explicitly.

The desired marker updates immediately from input; the achieved marker updates from the
next published tick. That difference is the point. Interpolating them through one path
would make a lagging arm look accurate by construction.

Compact carved frames and final health hierarchy remain the concept-production topic's
work. This is a restrained diagnostic overlay that can be disabled with **[Control HUD]**.

## The fixed-refresh proof

Before tuning a hand constant, the pure controlled clock is fed one visible second of
timestamps at 30, 60, 120 and 144 Hz. Every schedule must produce exactly sixty ordered
ticks. The 30 Hz schedule submits two distinct ticks on most frames; the 120 and 144 Hz
schedules contain frames with no tick. A one-second hidden interval between two visible
halves produces sixty ticks total, not 120 and not a catch-up burst.

The browser pass repeats the observation through the HUD tick counter at the display's
actual refresh rate. This is not a performance benchmark; it checks that the live wiring
uses the pure clock the test exercised.

## The drills, preregistered before tuning

Each drill starts from **Reset drill**. Record view, both sensitivities, body-turn lead,
dead zone, full-effort speed and the commanded/achieved trace. The first pass uses the session-06
placeholders; changes stay within this session and each recorded value keeps the before and
after sample that justified it.

### 1. Park a physical guard

At rest effort, place and hold the weapon for one second in five positions: high-left,
high-right, centre, low-left and low-right. Passing means:

- four of five positions are intentionally distinguishable on the first attempt;
- no placement changes a navigation or body-yaw command byte;
- the body does not start a forced step from weapon input alone; and
- the desired marker stays still when the camera follows, zooms or switches view.

This is the most important drill. If a player cannot park a blade, blocking is a canned
verb in disguise even though the command has no block byte.

### 2. Name the cut before throwing it

Perform five attempts each of left-to-right, right-to-left, overhead, rising diagonal and
falling diagonal. Name the requested cut before pressing primary. Four of five attempts in
each family must produce the named desired-hand trajectory; contacts are recorded but are
not required, because this drill judges authorship rather than aim at the body.

The trace classifier reads the target path, not the rendered sword, and its thresholds are
declared in `control-lab.ts` before the sample. Deliberately swap left and right in the
classifier fixture and show the corresponding test fail.

### 3. Slow and fast are different paths

Throw the same left-to-right cut slowly and quickly, five paired attempts. The fast member
must have greater median desired-hand speed and no lower median effort, while both finish
inside the same endpoint tolerance. The achieved-hand trace and contact energy are
reported separately. If desired traces differ and achieved traces do not, the finding is
the actuator rather than a reason to exaggerate mouse sensitivity.

### 4. Body and hand remain independent

Park a centre guard, then turn left and right with `Q`/`E`, sidestep with `A`/`D`, advance
and retreat with `W`/`S`. The shoulder and world weapon move because the body carries them;
the stored arm target fields do not change. Then throw the same horizontal cut while
advancing and retreating. The body may add physical contact velocity, but the mouse trace
must classify as the same named cut.

### 5. Camera and hand remain independent

Park a guard, orbit with middle, zoom, promote first person and return to 3/4 without
moving the weapon. Every staged arm byte remains equal. Then throw one horizontal and one
vertical cut in each view. Direction follows the visible camera basis on new mouse input,
but changing the view itself never stages a command.

### 6. Reach the useful volume, and thrust

With the secondary channel, extend from the resting target to the encodable envelope's
boundary and retract to its minimum along the held direction -- the arm's length and the
exported physical minimum at shoulder-level directions -- in first person and again in
the 3/4 view; the gesture must read as the same verb in both. Then the drill's one aimed motion: put the point on line in
first person and push a fast extension through it with no footwork -- the thrust the
channel exists for. The commanded reach must visit both ends without sticking there during
ordinary mid-range gestures, a slow push must probe rather than lunge, and the achieved
marker may show the joint's tighter three-dimensional clamp; record it rather than hiding
it. If the two-channel scheme itself proves too stiff here, the recorded fallback is
session 06's: a per-action weapon assist through the composition seam, decided from these
diagnostics and not from frustration mid-drill.

## What gets tuned here

Only host feel constants may move:

- `BODY_TURN_INPUT_LEAD_RAW`, mirrored with Rust's `PLAYER_TURN_LEAD_RAW`;
- `VIRTUAL_HAND_SENSITIVITY`;
- `EXTEND_DRAG_SENSITIVITY`;
- `TOUCH_PINCH_SPREAD_RATIO`, where a touch surface is available to sample;
- `SWING_DRAG_DEAD_ZONE_PX`; and
- `SWING_DRAG_FULL_EFFORT_PX_S`.

For each, `docs/performance/arena-human-control.md` records the device, browser, viewport,
display refresh, at least five raw samples, the selected value and both rejected sides.
The tests bound the selected value from both directions using the decision above, not a
wide range that any plausible value passes.

No actuator speed, acceleration, stance limit, anatomy or weapon value moves here. If the
desired hand is correct and the achieved hand is consistently too slow, record the error
trace and insert a mechanics session before 08. If the desired hand is wrong, fix the host
mapping here and repeat every drill. The plan does not close by relabelling one as the
other.

## Cadence and combat measurements

After the drills, record:

- target-to-achieved error distribution by effort band;
- effort distribution, including time at the resting half and at one;
- weapon-on-body contacts, delivered health and severances against `neutral`; and
- one human fight against `tactical`, plus the same recorded commands thinned to the
  body's policy decision period.

The tactical fight is diagnostic in this session, not the final judgement. Its win rate
cannot tune a mapping constant by itself, and a cadence advantage must be reported beside
it.

## Files

| file | change |
|---|---|
| `client/src/arena/control-lab.ts` | new: preset, pure trace classifier, drill recorder and report rows |
| `client/src/arena/hand-reticle.ts` | desired and achieved markers plus error line |
| `client/src/arena/arena.ts` | Practice hand, Reset drill, Control HUD and the live tick counter |
| `web/index.html` | the restrained practice/HUD controls |
| `client/src/arena/arena-input.ts` | measured values replace placeholders; no mapping-shape change unless a drill proves one |
| `docs/performance/arena-human-control.md` | samples, chosen constants, six drill results, cadence control and findings |

## Tests

`client/test/studio-shell.test.mjs`:

- `practice_hand_is_an_ordinary_human_versus_neutral_configuration`
- `reset_drill_rebuilds_the_same_config_and_seed`
- `desired_and_achieved_markers_read_different_sources`
- `a_stationary_guard_survives_follow_zoom_orbit_and_view_promotion`
- `five_named_cut_fixtures_are_classified_in_their_declared_directions`
- `a_fast_cut_has_no_less_effort_than_its_slow_twin`
- `body_inputs_carry_the_body_without_rewriting_the_arm_target`
- `camera_inputs_change_no_command_byte`
- `the_control_hud_can_be_disabled_without_disabling_input`
- `feel_constants_are_bounded_from_both_sides`

`client/test/worker-protocol.test.mjs`:

- `display_schedules_at_thirty_sixty_one_hundred_twenty_and_one_hundred_forty_four_hertz_each_run_sixty_ticks`
- `hidden_time_is_not_a_tick_debt`

Show the direction classifier fail by swapping its horizontal sign, and show the refresh
test fail by restoring one-step-per-rAF. Those are the two green-looking failures this
session is most likely to ship.

## Acceptance

1. The five guard positions and five named cut families meet the preregistered repeatability
   bar, with desired and achieved traces recorded separately.
2. Mouse input alone never turns or moves the body; camera input changes no command; body
   input changes no stored primary-arm target.
3. Slow and fast paired cuts are measurably distinct without any moving effort below the
   resting guard floor.
4. 30, 60, 120 and 144 Hz schedules all run sixty simulation ticks per visible second,
   and hidden time is discarded.
5. Every feel constant tuned here carries foreground samples and two-sided bounds; a
   constant left at its placeholder for want of a device says so beside its bounds.
6. Any mechanical limitation is recorded as a blocker and a new session is inserted before
   08; it is not papered over with host gain.

## Hash expectations

**Nothing moves.** A preset, diagnostics and TypeScript constants do not alter mechanics,
policies or scenario construction. A moved fingerprint means the preset leaked into the
scenario and must be reverted.

## Verification

```powershell
node --test "client/test/*.test.mjs"
npm run check
npm run check:abi
node tools/check_docs.js
node tools/check_deps.js
npm run dev        # foreground: run all six drills, record samples, then stop the server
```
