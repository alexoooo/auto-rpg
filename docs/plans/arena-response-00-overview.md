# The responsive arena

**Status:** paused during Session 02. Continue from
[the 2026-08-21 handoff](arena-response-99-handoff.md), not from a pin failure.
**Outcome:** Make the arena report its real display cadence, keep one frame of work inside
its budget, stop the controlled arm and held weapon from crossing their owner, and make a
fast physical mouse stroke produce a fast achieved slash instead of a target the body
follows as though underwater.

## Why this topic exists

The first playable pass proved that browser input reaches an independent authoritative
hand. It did not prove that the resulting pose is anatomically possible or that the hand
keeps up. The rear-bearing clamp landed after that pass and was described too broadly. It
limits a requested hand bearing to 135 degrees from achieved torso yaw; it does **not**
sweep the upper arm, forearm, shield or held blade against the owner's body. A circular
mouse gesture can therefore still drive the sword through the torso and out the other
side. This plan treats that observed failure as open mechanics work.

"Slow" also has four distinct possible owners:

1. display callbacks or Babylon renders miss their frame budget;
2. the worker does not accept the newest target on the next authoritative tick;
3. the actuator accelerates the achieved hand too slowly toward an accepted target; or
4. the camera and interpolation present current state late.

The sessions measure those layers separately. They do not increase global time scale,
drop authoritative ticks, or add a browser-only collision clamp. A fast-looking client
whose replay still contains an impossible blade is a failed result.

## Session order

| session | lands | depends on |
|---|---|---|
| [01](arena-response-01-the-frame-tells-the-truth.md) | live Arena display/render cadence, command-age telemetry, a visible capture, and removal of measured duplicate work | current Arena |
| [02](arena-response-02-the-body-stops-the-blade.md) | deterministic swept own-body, opposite-arm and held-item constraints with no self-damage events | 01 fixture audit |
| [03](arena-response-03-the-hand-keeps-up.md) | measured full-effort actuator response and, only where evidence requires it, tuned arm rates | 02 |
| [04](arena-response-04-the-fight-is-in-your-hand.md) | foreground mouse/camera/fight verdict, durable records, and topic close or a named follow-up | 03 |

## Cross-session acceptance

- The fight HUD continuously shows display callback FPS, actual Babylon renders per
  second, worst display interval, and whether the playhead is waiting for the producer.
  It does not label simulation ticks as FPS.
- In a visible foreground capture, p95 display interval stays within the measured refresh
  budget and one Arena rAF causes at most one Babylon render. Any exception is named in
  the artifact rather than hidden in an average.
- A full circular mouse path cannot place an upper arm, forearm, held blade, shield or
  opposite arm through the owner's non-socket head or torso. The constraint is
  authoritative, deterministic, replayed and published.
- A quick primary gesture reaches full effort, the accepted command is no more than one
  authoritative tick behind the latest eligible sample, and a sword hand covers 10--90%
  of a one-arm-length full-effort step in at most eight ticks without penetrating its
  owner. The unloaded-hand bound is six ticks. These are calibration gates, not permission
  to teleport or ignore inertia.
- A slow stroke to the same endpoint remains measurably slower than the fast stroke. A
  tune that merely pins every powered gesture at the same achieved speed fails.
- The owner repeats the fight in Fixed and Relative three-quarter views and records
  whether the mouse feels like the sword hand. Automated hidden-browser output cannot
  supply that judgement.

## Authority and hash expectations

Session 01 is presentation/diagnostics only: every simulation, replay, ABI and golden
value must remain byte-exact. Sessions 02 and 03 deliberately change authoritative
achieved motion and may move **values**, never schemas, row strides, digest grammar,
Scenario fingerprints, command bytes or trace grammar.

Before either mechanics edit, session 01's fixture audit records whether each frozen
fixture reaches an own-body constraint and whether each rate constant reaches it. That
table is copied into the relevant session file before the first mechanics patch. The six
pins that must each receive an explicit reached/unreached verdict are
`EMBODIED_CORPUS_DIGEST`, `EMBODIED_GOLDEN_DIGEST`, `ARTICULATED_COMMAND_HASH`,
`ARTICULATED_STREAM_DIGEST`, `EXACT_TRAJECTORY_STATE_DIGEST` and
`LIFTED_COULOMB_SOLVER_DIGEST`. Only reached pins are expected to move. Every other
registered pin, both scenario fingerprints, the command/frame/publication layout
versions, `TRACE_SCHEMA`, `LEARNED_INFERENCE_DIGEST` and
`LEARNED_TACTICAL_INFERENCE_DIGEST` must not move.

No new literal is accepted from a hash failure. Native fixtures print their measured
candidate first, wasm mirrors move only after native replay/rerun and the corpus evidence
agree, and the default wasm artifact is rebuilt last.

## Consolidation record

The former Arena sessions 01--10 are implemented. Their durable contracts live in
[browser runtime](../architecture/browser-runtime.md), [Combat design](../design/combat.md),
[Arena human-control evidence](../performance/arena-human-control.md), the worker/ABI
references and the source tests. Their unperformed foreground verdict and close are
absorbed by session 04 here. The completed learned-roster topic is likewise durable in
[learning architecture](../architecture/learning.md) and the
[learned-roster performance record](../performance/learned-roster-policy.md).

The future [live-authority topic](combat-control-extensions-00-overview.md) remains
separate. Mid-fight policy/Human ownership is a host transition; it is not a prerequisite
for making one already-controlled body solid and responsive.
