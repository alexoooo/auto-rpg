# Arena human-control evidence

**Purpose:** Define the diagnostic record and cadence control used to calibrate the arena's direct hand control without mistaking reaction rate for aim quality.
**Status:** current
**Canonical source:** [`arena-input.ts`](../../client/src/arena/arena-input.ts), [`arena.ts`](../../client/src/arena/arena.ts), [`arena-recorder.ts`](../../client/src/runtime/arena-recorder.ts), and the human-command boundary in [`crates/web/src/lib.rs`](../../crates/web/src/lib.rs)
**Update when:** A hand-control constant, gesture mapping, diagnostic field, cadence-control procedure, or measured result changes.

This is a measurement protocol, not a result. The arena has provisional source values
for its pointer sensitivity, cursor span, extension gain, touch classifier, powered dead
zone, full-effort speed and body-turn lead so the control can be exercised. None has yet been accepted by the
foreground calibration this record requires. Session 10 owns those values and the
owner's visible-browser judgement; leaving the result blank here is deliberate.

The design being measured is in [Combat design](../design/combat.md#the-human-hand-is-a-target-path-not-an-attack-button).
The host stores a desired hand target and the simulator publishes the achieved hand.
Keeping both in the record is what separates a mapping that asked for the wrong point
from an actuator that could not keep up with the right one.

## Artifact and environment record

Every accepted capture records this header. A result without it is a note, not evidence.

| field | required value |
|---|---|
| source identity | commit or exact dirty-worktree description |
| date and operator | local date, time zone, and the person holding the control |
| host | OS, CPU, browser name/version, graphics backend |
| display | CSS viewport, device-pixel ratio, refresh rate, page zoom |
| arena view | three-quarter or first person; promoted viewport named explicitly |
| input | mouse/touch device and pointer-capture state |
| fight | arena fingerprint, seed, tick bound, both anatomies/loadouts and policies |
| body | controlled faction, primary arm, arm length, standing height, decision period |
| constants | all seven control constants exactly as built |
| artifact | the exact [ARPGCTL1 evidence](../reference/arena-control-evidence-v1.md), raw diagnostic file, plus any visible recording or written judgement |

CSS pixels are the input unit. Device pixels must still be recorded so a changed browser
scale cannot masquerade as a sensitivity result. Three-quarter and first-person captures
are separate rows even when they use the same constants.

## Diagnostic schema

Use two related streams rather than forcing pointer events and authoritative ticks into
one clock.

### Input-event rows

| field | meaning |
|---|---|
| `sample_ms` | monotonic host sample time, used only for pointer speed |
| `tick_seen` | latest published authoritative tick when the event was reduced |
| `view` | active three-quarter or first-person basis |
| `channel` | placement, cut, extension, or camera; exactly one |
| `client_x_css`, `client_y_css` | ordinary mouse position before viewport reduction |
| `qx`, `qy` | active-viewport coordinates after radial unit-disc clamp |
| `saturated` | cursor disc or encodable command envelope reached |
| `dx_css`, `dy_css` | touch-relative delta; absent for ordinary mouse placement |
| `powered` | whether the winning button/finger channel owned this delta |
| `travel_css` | that powered gesture's accumulated travel for dead-zone evidence |
| `desired_x/y/z` | stored desired hand after the reducer, in world-space raw units |
| `bearing_raw`, `height_raw`, `reach_raw`, `effort_raw`, `plane_raw` | the command fields staged after this event |
| `body_yaw_raw`, `move_x_raw`, `move_y_raw` | ownership witnesses; hand-only events must leave them unchanged |

Ordinary mouse rows retain their absolute cursor sample because that is the control
scheme: replaying the same viewport, basis and point must reproduce the same command.
`movementX` and `movementY` are deliberately absent from those rows. Touch rows retain
relative deltas and name their captured owner.

### Authoritative-tick rows

| field | meaning |
|---|---|
| `tick` | authoritative world tick |
| `desired_x/y/z` | desired primary-hand point published for that tick |
| `achieved_x/y/z` | achieved primary-hand point in the same frame |
| `error_arm_lengths` | Euclidean desired-to-achieved error divided by published arm length |
| `effort_raw` | submitted primary-arm effort |
| `body_yaw_raw`, `move_x_raw`, `move_y_raw` | independent body command beside it |
| `staged_age` | ticks since the host frame was staged; expired input is named, not inferred |
| `contact_rows`, `weapon_body_rows` | resolved contacts this tick and the weapon/body subset |
| `severed_mask` | controlled and opposing severance state after the tick |

The run summary records outcome, stop tick, weapon/body contacts, severances, and the
effort distribution: minimum, median, p90, maximum, and fractions at the resting floor
and at full effort. Quote target-error median and p90 by gesture channel. A single mean
can hide both a mapper pinned at full effort and a slow cut that never leaves rest.

## Foreground calibration owed in session 10

Run at least one matched pass in each arena view. In each pass:

1. Place and park a guard with unpowered motion.
2. Cross the body with one deliberate primary drag in both directions.
3. Trace a slow cut and a fast cut to the same endpoint.
4. Retract, probe, and drive to the encodable extension boundary with the secondary drag.
5. Switch views without weapon motion, then make the next physical delta from the stored
   target and judge whether it jumps.
6. Fight the configured Tactical opponent and retain the complete command recording.

The seven constants are accepted only with both failure directions judged. Sensitivity
must permit a deliberate cross-body stroke without turning tremor into full travel;
extension gain must reach the boundary without erasing intermediate probes; the touch
ratio must separate an uneven two-finger push from a deliberate pinch; the dead zone
must reject tremor without hiding a wrist cut; and full-effort speed must preserve a
slow path below maximum while allowing a deliberate fast path to reach it.

No accepted values or judgements are recorded yet:

| item | session 10 evidence |
|---|---|
| `VIRTUAL_HAND_SENSITIVITY` | owed |
| `CURSOR_HAND_SPAN_ARM_LENGTHS` | owed |
| `EXTEND_DRAG_SENSITIVITY` | owed |
| `TOUCH_PINCH_SPREAD_RATIO` | owed |
| `SWING_DRAG_DEAD_ZONE_PX` | owed |
| `SWING_DRAG_FULL_EFFORT_PX_S` | owed |
| `BODY_TURN_INPUT_LEAD_RAW` | owed |
| three-quarter guard/cut/thrust judgement | owed in a visible browser |
| first-person guard/cut/thrust judgement | owed in a visible browser |
| target-error and effort distributions | owed |
| contacts, severances, and Tactical result | owed |

An automated hidden tab cannot supply the visible judgement. It may validate reducers
and collect synchronous rows, but on this host it receives no animation frames; the
repository's [browser measurement rule](README.md#measuring-in-a-browser-when-the-tab-is-automated)
applies unchanged.

## Cadence control

A human host stages every tick while an ordinary policy may reconsider only every
`Stats::decision_period()`. A better result can therefore come from reaction frequency
rather than from a better hand mapping. Every human-vs-Tactical result must carry this
paired control:

1. Record the complete composed command stream, arena fingerprint, seed, stop tick, and
   opponent submissions from the live run.
2. Replay that recording unchanged and require byte-identical final authoritative state.
   A recording that cannot reproduce its own run is not eligible for comparison.
3. Build a second replay with the same scenario, seed, opponent stream, and stop rule.
   Keep the human command at tick zero, then submit the recorded human command only on
   the controlled body's decision-period ticks; between them, let the ordinary stored
   command persist. Thin the whole human command, not only the arm or only navigation.
4. Compare the full-rate and thinned pair on outcome, stop tick, target error, effort
   distribution, weapon/body contacts, and severances. Repeat the pair on the same seeds
   in both views.

The thinned run uses commands the human actually produced; it does not ask a policy to
reconstruct them and does not interpolate new targets. The opponent stream is identical
between the pair. If the full-rate result disappears when thinned, report cadence as the
cause supported by this control. Do not retune a pointer constant until the result looks
like aiming.

## Result

Pending session 10. No pass, calibration value, win-rate claim, or comfort judgement has
been recorded.
