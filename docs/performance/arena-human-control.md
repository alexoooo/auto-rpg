# Arena human-control evidence

**Purpose:** Define the diagnostic record and cadence control used to calibrate the arena's direct hand control without mistaking reaction rate for aim quality.
**Status:** current
**Canonical source:** [`arena-input.ts`](../../client/src/arena/arena-input.ts), [`arena.ts`](../../client/src/arena/arena.ts), [`arena-recorder.ts`](../../client/src/runtime/arena-recorder.ts), and the human-command boundary in [`crates/web/src/lib.rs`](../../crates/web/src/lib.rs)
**Update when:** A hand-control constant, gesture mapping, diagnostic field, cadence-control procedure, or measured result changes.

This is a measurement protocol, not a result. The arena has provisional source values
for its pointer sensitivity, cursor span, extension gain, touch classifier, powered dead
zone, full-effort speed and body-turn lead so the control can be exercised. None has yet been accepted by the
foreground calibration this record requires. Arena 10 installed the capture and report
path but did not run a visible browser or substitute automated samples for the owner's
judgement; leaving the result blank here is deliberate.

The design being measured is in [Combat design](../design/combat.md#the-human-hand-is-a-target-path-not-an-attack-button).
The host stores a desired hand target and the simulator publishes the achieved hand.
Keeping both in the record is what separates a mapping that asked for the wrong point
from an actuator that could not keep up with the right one.

## Artifact and environment record

Every downloadable JSON report records this header. Browser-readable values are captured;
source identity, operator, refresh rate and graphics backend remain `null` until a foreground
owner supplies them. A null is an explicit owed field, not permission to infer a machine.

| field | required value |
|---|---|
| source identity | commit or exact dirty-worktree description |
| date and operator | local date, time zone, and the person holding the control |
| host | OS, CPU, browser name/version, graphics backend |
| display | CSS viewport, device-pixel ratio, refresh rate, page zoom |
| arena view | three-quarter or first person; promoted viewport named explicitly |
| input | actual mouse/touch devices used plus pointer-capture ownership history |
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
| `attemptId` | local gesture identity; zero means no powered cut attempt owns the row |
| `sampleMs` | monotonic host sample time, used only for pointer speed |
| `tickSeen` | latest published authoritative tick when the event was reduced |
| `view` | active three-quarter or first-person basis |
| `channel` | hand, keyboard, wheel, camera mode, promotion, follow, refit, drawer or lifecycle owner |
| `inputDevice`, `captureActive` | actual pointer device last used and pre-clear capture witness |
| `action` | exact key transition or camera/drawer choice when the channel is discrete |
| `clientXCss`, `clientYCss` | mouse or touch-centroid position before viewport reduction |
| `qx`, `qy` | active-viewport coordinates after radial unit-disc clamp |
| `saturated` | cursor disc or encodable command envelope reached |
| `powered` | whether the winning button/finger channel owned this delta |
| `travelCss` | that powered gesture's accumulated travel for dead-zone evidence |
| `desired`, `shoulder`, `armLength` | world-space target and normalization inputs after the reducer |
| `target` | staged bearing, height, reach, effort and plane fields after this event |
| `bodyYaw` | published ownership witness; hand-only events must leave it unchanged |
| `basis` | frozen screen-right and screen-up world axes used by the classifier |

Ordinary mouse rows retain their absolute cursor sample because that is the control
scheme: replaying the same viewport, basis and point must reproduce the same command.
`movementX` and `movementY` are deliberately absent from those rows. Touch rows retain
the reduced centroid and name their captured owner.

### Presentation-latency rows

The host-side report keeps five timestamps that must not be merged: the physical sample
which produced an eligible candidate, submission of its request for tick `T`, arrival of
publication `T + 1`, settlement of the later host acknowledgement, and the rAF which first
displayed that publication. It reports sample-to-submission, submission-to-publication,
publication-to-acknowledgement and publication-to-display distributions beside the
desired-to-achieved arm-length error distribution. Each latency row also retains the exact
primary-arm target encoded by its request; report construction refuses unless that row is
byte-equal to the authoritative receipt at `T`. Thus a later eligible mouse sample cannot
be silently reported against an earlier in-flight target. The worker publishes the chunk
before it acknowledges the request, so calling acknowledgement arrival "acceptance" would
make the prior publication look like negative latency. A row without its request-owned sample,
the exact `T` to `T + 1` publication, acknowledgement or later display is refused as
`CONTROL_LATENCY_JOIN_REFUSED`; terminal report creation waits for that display rather
than backdating it to the worker message.

Pointer moves are coalesced against a fixed `1000 / 120` ms anchor only while that anchor
is still the last row and has the same attempt, channel, action, powered state, device and
capture owner. Any discrete append invalidates it, so a final endpoint can never be crossed
or reordered by a later unpowered move. The sidecar
is capped at exactly 72,000 rows: ten minutes at the preregistered ceiling of 120
presentation samples per second. Row 72,001 increments `dropped`; any nonzero drop makes
the JSON report ineligible, makes later primary-downs use nonrecording attempt zero without
growing the manifest map, and makes the UI name the refusal and count. A mouse or touch `pointerup` retains
one final material endpoint with its pre-release owner and `powered: true`; `pointercancel`
adds no endpoint it did not own. Keyboard down/up and every wheel, mode, promotion, follow,
refit and drawer transition carry `tickSeen` and the complete staged target snapshot.
Pause, blur, hidden visibility, lost capture, reacquisition, arm loss and renderer/terminal
loss are written before their reducer clears ownership.

Before primary-down the operator chooses a drill label, requested cut family and optional
slow/fast pair ID. That manifest is frozen onto the attempt. The classifier never supplies
the requested family after seeing the path.

### Authoritative-tick rows

| field | meaning |
|---|---|
| `receiptTick` | tick at which the authoritative host accepted the command |
| `publishedTick` | the following publication, `receiptTick + 1` |
| `desired` | desired primary-hand point in that following publication |
| `achieved` | achieved primary-hand point in the same frame |
| `errorArmLengths` | Euclidean desired-to-achieved error divided by published arm length |
| `command` | accepted movement, yaw and primary-arm command fields |
| `bodyYaw`, `hipYaw`, `pelvis`, `twist` | published body and stance witnesses |
| `forcedStepTicks` | published remaining forced-step ticks, or absent on an old adapter |
| `health` | published Heroes and Monsters health fractions |
| `contacts`, `severedMasks` | raw publication rows supporting the contact/severance summary |
| `missing` | `controlled-body-absent` when the accepted final command killed the body |

The browser report joins accepted receipt tick `t` to publication `t + 1`. The receipt
is stored before `World::step`; publication `t` still describes the state before that
acceptance. Pointer samples remain a separate presentation sidecar and are never claimed
as replay input. A cut attempt freezes its initial camera basis, subtracts the published
shoulder, normalizes by arm length, and is classified only when its net travel is at least
`0.30`, its axis travel at least `0.20`, its path efficiency at least `0.65`, and its
dominant axis ratio at least `1.75`. The declared endpoint tolerance is `0.10` arm lengths.
These values were preregistered in source; they are not calibrated results.

There is exactly one tick row per controlled receipt. A terminal publication without the
controlled pose retains a nullable achieved/stance row and names `controlled-body-absent`;
a missing publication is an impossible visual/evidence mismatch and refuses the report.
Missing or invalid controlled anatomy refuses by name, as does a receipt horizon that does
not contain exactly `finalTick` controlled rows ending at that publication. The installed
decision period is read authoritatively for both factions at `arenaOpened`; the report
selects the controlled faction's positive value rather than leaving it unknown.
The top level also carries scenario/config/body rows, all seven source constants, outcome,
authoritative `finalTick`, typed state digest, environment metadata, attempt manifests,
raw input and tick rows, and min/median/p90/max effort/error summaries with resting/full
fractions, contact counts and newly set severance bits. If terminal pose loss makes either
severance mask unavailable, `summaryComplete` is false and aggregate severances are null;
the report never turns missing anatomy evidence into zero damage.

The run summary records outcome, stop tick, weapon/body contacts, severances, and the
effort distribution: minimum, median, p90, maximum, and fractions at the resting floor
and at full effort. Quote target-error median and p90 by gesture channel. A single mean
can hide both a mapper pinned at full effort and a slow cut that never leaves rest.

## Foreground calibration still owed after Arena 10

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

Arena 10's preset, reset, event sidecar, receipt join, classifier, HUD and two evidence
downloads are implemented and automated. The Session 03 client fixture additionally
holds two eligible absolute mouse samples before a control tick, proves the later sample
is the next request and accepted receipt, and keeps a deliberately slow half-effort row
distinct from a full-effort row. Those are reducer/receipt invariants, not an actuator-rate
measurement: authoritative arm rates remain exclusively in the simulator. No foreground
pass, calibration value, win-rate claim, owner verdict or comfort judgement has been recorded.
