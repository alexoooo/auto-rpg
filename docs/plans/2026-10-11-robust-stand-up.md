# Robust, quick stand-up: recovery routes, contact control and qualification

## Outcome and scope

An additional stand-up variant that reliably recovers Warrior and Rogue, with empty hands or
one retained club, around the owner's four-second target. Existing presets retain their recovery.
This plan describes proposed work; writing it does not resume the paused implementation goal.

The next phase establishes a continuous, physically executed route from the reproducible Lab
fall to standing, then makes recovery robust and quick. It covers physical diagnosis, movement
and support sequencing, contact and muscle control, feedback and fallback behavior, timing and
full qualification. A compatible pose, a supported checkpoint and a successful complete recovery
are separate milestones.

Whole-body inverse kinematics (IK) is one bounded experiment within movement planning. It may
help coordinate body configurations, but does not choose the complete support sequence, execute
the motion, manage contact loads or establish robustness. The plan can succeed with coordinated
targets that do not require a new IK solver. Adopt whole-body IK only if its physical replay
provides a useful improvement over the simpler route candidates.

| Workstream | Deliverable |
|---|---|
| Physical and controller diagnosis | Reproducible evidence distinguishing blocked geometry, muscle limits, incompatible objectives and incorrect contact prediction. |
| Recovery-route design | A continuous body movement and support sequence from the real fall through standing; bounded whole-body IK experiments help generate and compare candidates. |
| Contact and muscle control | Measured unloading, clearance, planting and weight transfer executed through ordinary muscles. |
| Feedback and robustness | Progress-based transitions and useful alternatives that handle changed falls, lost support, another body and an occupied hand. |
| Speed and qualification | Complete recovery meets the timing, success, handover and disturbance criteria. |

The physical baseline remains gameplay `rapier-coordinate`, 120 Hz, symmetric actuation and
balance 0. Recovery uses the body's ordinary muscles. No pose or velocity injection, external
root force, raised muscle strength or speed, or solver boost qualifies a result. Any demonstrated
body or engine defect gets a separate correction and regression, then the affected experiments
run again against the corrected baseline.

## What the experiment establishes

- The real Stance Lab reproduction is two Front shoves of 60 N s, 24 world steps apart, after
  the Warrior has stood for 240 steps. It reaches loaded hands-and-knees support, but the
  required six-second standing and handover check still fails. The reproduction and its
  component contracts are in `tests/lab-dynamic-rise.test.mjs`.
- Production recovery can extend an actual supported half-kneel, hand control to the Lab host,
  remain standing and walk. `tests/core-supported-extension.test.mjs` verifies this path and
  exact continuation. It excludes the preceding fall and foot preparation.
- Exploratory limb IK holds the pelvis's current frame; the hand experiments also hold the
  spine angles. Some solves retain endpoint error, and legal joint targets have encountered
  actual thigh/trunk contact or boot/floor contact during execution. These failures establish
  obstruction of particular attempted routes, not impossibility of standing up with this body.
- Hand stepping can reposition both hands and reach an upright supported kneel in an
  exploratory fresh-fall replay. Its long duration and subsequent foot-placement failures do
  not establish a route that meets the timing target.
- `solveReach` (`src/core/control/kinematics.ts`) is a local, range-bounded single-chain solve.
  It does not enforce collision clearance or solve several supporting limbs together with a
  floating pelvis. `wholeBodyTracking` (`src/core/control/whole-body.ts`) already coordinates
  bounded muscle effort toward supplied objectives; it does not plan a compatible pose sequence.
- The Rapier integration now excludes cached impulses on geometric points absent from current
  solver contacts (`totalSolverContactImpulse`, `vendor/rapier/README.md`). Earlier conclusions
  based on the discarded-point readings are not evidence of current physical loads.
- The tracker predicts measured sticking support and nearby joint stops. General sliding and
  distant impacts remain outside that prediction; its per-point friction model does not fully
  reproduce the engine's patch friction. A kinematic solution cannot establish contact dynamics.

The existing [dynamic-rise record](../reference/rising.md#dynamic-rise) describes an earlier
failed directional qualification, with its own engine revision. It is not a measurement of the
newly merged code. No passing full qualification is established.

## 1. Diagnose the physical and controller bottlenecks

Run the existing two-shove fixture on the merged code. Keep one initialized body, host and world
through the fall, acquisition, placement, extension and handover. Save legitimate continuation
checkpoints immediately before the blocked transition; never construct an artificial half-kneel
as a substitute for reaching it from the fall.

Capture only the readings needed to distinguish the competing explanations:

- Actual body and controller state, root pose, joint angles and limits, applied hand shapes,
  held-item configuration and the admitted collision-pair rules.
- Active floor and self-contact points, current normal impulses and the surfaces that carry them.
- Centre-of-mass position and velocity, retained support geometry, controller errors, muscle
  saturation and rejected contact or joint-stop predictions.
- Time from fall/takeover, time from the last shove and time in each transition. Controller
  retries never reset the complete-recovery clock.

Each checkpoint has an immutable identity, full physics/controller state and a recorded engine
artifact and configuration. Do not overwrite a checkpoint when another transition uses the
same phase name. Copy diagnostic records when collecting them so later target mutations cannot
rewrite earlier observations. Runtime errors are reported separately from IK residuals and fail
the experiment.

**Gate:** the fresh fall reproduces the known failure, and the saved transition continues
exactly after restoration into a fresh compatible world. Checkpoint diagnostics must identify
actual loaded surfaces rather than a guessed sole or capsule proxy.

Inspect the blocked transition independently of IK. Check whether the intended motion collides
with the trunk or floor, presses a joint stop, needs unavailable muscle effort, or fights another
controller objective. In particular, inspect the interaction between the requested foot motion,
pelvis pitch/height, default joint posture and centre-of-mass target. Compare measured contact
behavior with the controller's assumptions about sticking, sliding, rolling and lift-off.

**Decision:** identify which explanation the next small experiment tests. Solver convergence,
contact-model correction and route redesign are different actions. A model correction is pursued
only with its own witness; more IK freedoms are not the default response to every failure.

## 2. Design and compare complete recovery routes

For each candidate, specify the movement of the pelvis, torso and limbs together with the
support sequence: which surfaces carry weight, which unload, how a limb clears the body and
floor, how its new contact is established, and how the body transfers onto it. Include the
initial orientation/acquisition and final extension rather than treating foot placement as the
whole skill. Draw on the supported half-kneel and extension components that already execute.

Begin with two candidate route families: a coordinated kneeling transition that moves the
pelvis and torso while bringing a foot forward, and a transition through sitting on one side
into a half-kneel. Choose lead side and contact sequence from the actual configuration. Retain
the hand-stepping experiment as a comparison, with its duration visible in the timing budget.

Use a small set of coordinated movement targets as the first comparison. They may be designed
directly, derived from body geometry or generated by IK. Keep their geometry, support transitions
and actual execution distinguishable. Whole-body IK is useful if it finds a compatible movement
that these simpler targets cannot, or adapts that movement to changed body configurations.

### Bounded whole-body IK experiment

Start with an offline research prototype. Reuse the body's kinematics, geometry and joint-angle
conventions. Compare forward-kinematic points and rotations with the actual captured body, and
check derivatives on the selected configurations before interpreting solve failures. Preserve
the engine's coordinate definitions, anatomical bind offsets and legal ranges.

The whole-body variables are the pelvis's translation and orientation plus the relevant spine,
arm and leg freedoms. They are planning variables, not permission to set physical body poses.
The solved motion becomes a target for bounded muscle execution.

Use a small declared set of seeds, including the measured pose and alternate elbow/knee bends.
Report remaining task error, constraint violations, termination reason and branch changes.
Exhausting this search means "no solution found under these settings", not a proof that the
body cannot perform the movement.

#### Controlled comparisons

| Experiment | What changes | Question it answers |
|---|---|---|
| A: limb baseline | Solve the moving leg with the measured pelvis and the other joints held; repeat the hand case where useful. | Does the restricted formulation reproduce the residual or obstruction? |
| B: coupled supports | Free pelvis motion and supporting limb joints, initially holding the spine, while satisfying the same endpoint and retained-contact objectives. | Does coordinated root and support-limb movement make the target reachable? |
| C: spine freedom | Add spine freedoms with a soft preference for the measured posture. | Does torso articulation provide the missing reach or clearance? |
| D: collision constraints | Add actual floor and self-collision constraints to the whole-body formulation. | Does a reachable endpoint remain feasible once the body shapes are respected? |
| E: continuous path | Solve a sequence from the measured pose, with continuity and clearance checks between configurations. | Is there a usable route, rather than an isolated compatible endpoint? |

Keep the endpoint, seeds and tolerances comparable when attributing a difference to added
freedoms. Collision and support constraints take priority over endpoint preference; report
incompatible requests instead of hiding violations in a weighted residual. Declare positional,
angular and clearance tolerances before comparing results, with consistent physical units.

#### Geometry and support semantics

- Use the applied open-hand hulls, complete boot shapes and held-item geometry. Check the whole
  moving thigh, shin and boot, including their clearance from the trunk, floor and retained limbs.
- Follow the physical collision exclusions. Adjacent joint-connected shapes that overlap by
  construction are not new collision faults.
- Specify which measured contacts remain planted, which unload and which roll or peel. A shin
  or toe touching the floor is not a welded joint. Constrain only the position/orientation
  components appropriate to the selected contact mode.
- Allow intended contact and the baseline's contact tolerance; require clearance where a
  surface is meant to separate. Check the path between waypoints, not only the waypoints.
- Include a centre-of-mass/support objective. Its satisfaction is a kinematic screening result;
  static projection alone does not establish dynamic balance or feasible contact forces.
- Prefer a continuous solution near the previous one. Abrupt IK branch changes are rejected
  as motion targets even when their isolated endpoints satisfy the tasks.

Compare the most promising whole-body IK candidate with the directly designed route using the
same muscle controller and physical baseline. If a bounded search finds no useful candidate,
record that result and continue route/contact diagnosis; it does not become an open-ended solver
project. A geometric solution without useful physical execution does not justify runtime adoption.

**Gate:** at least one candidate has a declared support sequence and connects the actual blocked
configuration to a supported half-kneel with legal joints, appropriate retained-contact geometry
and clearance throughout the path. It need not come from whole-body IK. Record this as route
and kinematic feasibility only; the next workstream establishes execution.

## 3. Make contact transitions and muscle execution work

Restore the legitimate checkpoint and execute the candidate on the same body through the
existing bounded controllers. Keep root motion as an objective produced by muscle effort and
ground reaction. Existing native supported holds, hand release and extension are reusable where
their actual entry conditions hold; controller state or time is not forced to bypass those gates.

Read measured loads before releasing support and before accepting a new support. Compare the
predicted and observed response at the transition that fails. Begin with a conservative duration
to distinguish route feasibility from speed, while recording the complete elapsed time. A slow
successful route is a feasibility milestone, not an acceptance pass.

Implement and verify the mechanics of each required transition:

- Shift the body onto actual retained support and reduce the outgoing limb's measured load
  before asking it to move. A surface close to the floor is not necessarily carrying weight.
- Coordinate pelvis, torso and limb motion so the whole moving limb clears the body and floor.
  Check that a boot reaches the intended bearing face rather than catching on its upper face.
- Establish and load the new contact before transferring away from another support. Reacquiring
  geometry and acquiring usable load are separate events.
- Let default posture preferences yield to clearance and feasible support. A leg reach, root
  orientation and balance request must not silently fight one another indefinitely.
- Test the specific rolling, peeling or sliding transition if the selected route requires it.
  Keep the engine behavior distinct from what the contact predictor models. Improve the relevant
  prediction or choose another demonstrated contact sequence according to that evidence.
- Detect rejected or persistently ineffective commands. Use a demonstrated feasible bearing
  request where available, or reclassify the current body and select another route. Applying
  zero effort or repeating an impossible objective forever is not a recovery strategy.

| Result | Next action |
|---|---|
| IK leaves residual or inconsistent constraints | Inspect seeds, allowed freedoms and task conflicts; broaden the declared route search before making an impossibility claim. |
| Endpoint passes but the path collides | Change the coordinated path or route family; inspect the obstructing collider against its intended anatomy. |
| Geometry passes but muscles saturate or support is lost | Inspect timing, posture leverage, contact loading and release order. |
| Predicted contact behavior differs from observed behavior | Isolate that transition in a small physical fixture and correct the relevant model or integration. |
| Replay succeeds but is slow | Retain it as a feasibility witness and shorten or overlap compatible movements. |

A suspected collider or joint defect needs a specific geometric or physical witness. A suspected
Rapier defect needs a minimal reproduction separating engine behavior from controller output.
Do not change anatomy or engine tuning solely because several controller attempts failed.

Then execute the selected route from the fresh two-shove fall, including its preparation and
already verified extension. Inspect that same reproduction briefly in the visible Lab.

**Gate:** one continuous fresh-fall recovery reaches quiet standing, hands control back, stands
for two seconds and actually walks for one second, with zero assist and bounded muscle effort.
The six-second Lab regression becomes a required passing test once its deadline also passes;
its existing TODO cannot serve as evidence of success.

## 4. Build feedback around the executed route

Promote only the needed experiment into the additional recovery variant. Keep planning targets
and controller output distinct. A planner receives body specifications and observations; it
does not receive authority to manipulate engine poses or velocities.

Preserve measured-contact gates and continuous motion targets. Let low-priority posture aims
yield when they conflict with support or clearance. Detect progress from physical error and
contact changes, rather than from a phase timer alone. A stall selects a meaningfully different
lead side, route or support arrangement based on the current body; it does not endlessly restart
the same obstructed motion. The elapsed recovery budget spans every retry.

Begin with nearby variations of the two-shove reproduction: timing, fall pose and a small
disturbance during unloading or planting. Then add actual front, back, left-side and right-side
lying states. Shove direction is not a substitute for checking the resulting lying state.
Extend to Rogue and the retained-club cases; a route that needs both hands cannot qualify a body
with one hand occupied.

Choose the runtime form from these results: a small set of demonstrated routes with measured
adaptation, whole-body IK if it has earned a role, or another bounded planner if the evidence
requires one. The feedback and contact-transition policy works with any of these target sources.
An offline global search is not automatically placed in the world's per-step path. Core arithmetic,
immutable tuning, plain saved state and exact continuation remain repository requirements.

**Gate:** the route survives the selected nearby cases and perturbations, recovers after another
fall on the same host and replays exactly at support-transition checkpoints. Component successes
remain explicitly separate from the full qualification.

## 5. Timing and final qualification

Track acquisition, placement, transfer, extension and verification time from the first physical
trial. Once a continuous route works, shorten unnecessary settling and overlap compatible
movements while retaining measured support and clearance. Evaluate the whole elapsed recovery;
speeding one transition while increasing retries does not improve the result.

The final gate preserves the owner's existing criteria and the readers in
`research/dynamic-rise.mjs` and `research/dynamic-rise-qualification.mjs`:

- Warrior and Rogue, empty hands and one retained right-hand club, sixteen distinct directional
  falls per group: 64 actual falls, complete coverage and every cardinal direction passing.
- Each group has at least 15/16 verified completions within six seconds and a median no greater
  than four seconds; at least 61/64 complete within six seconds overall.
- Use the existing recovery-takeover clock, including landing, orientation, retries and the
  half-second quiet-standing gate. Preserve the Lab regression's first-down deadline as well;
  report any difference in clock origins rather than silently moving the start.
- Failed and unfinished trials remain failures, including in the median. No timing claim is
  calculated only from successful cases or only from a prepared checkpoint.
- Quiet standing requires actual loaded, flat soles, an upright body, slow motion and supported
  centre of mass. Each completion then survives two seconds under its host and executes one
  second of actual commanded walking.
- Repeated falls, disturbances during recovery, combat return and exact checkpoint continuation
  pass on the same physical baseline. The club remains held throughout its cases.
- The additional variant preserves existing preset choices. Visible Lab motion agrees with the
  claimed complete recovery rather than stopping at an upright kneel.

Run the full directional qualification after the fresh-fall route is viable and again after the
last substantive recovery change. Avoid a broad battery for every exploratory adjustment.

## Landing and reporting

Each milestone reports what passed, what remains unproven and the next decision. Experimental
solver success, component tests and a green suite containing an executed failing TODO do not
establish robust stand-up. Do not mark the implementation goal complete before the final gate.

Follow `AGENTS.md`: code changes run `npm run check` and `npm test`, relevant slow tests by name,
and `npm run build` for browser code. Important integration readers include
`tests/core-supported-rise.test.mjs`, `tests/core-supported-extension.test.mjs`,
`tests/core-support-load.test.mjs` and `tests/arena-fork.test.mjs`. New test files stay fast or are
listed in `tests/slow.json`. Documentation-only changes check cited paths, whitespace and the
line-ending gate. Commit each landable change.

Report every recovery figure with the harness, engine artifact, rate, actuation, balance and
loadout. Preserve the candidate configuration and continuation evidence needed to reproduce a
decision. Lasting timing results update the existing recovery reference; architecture describes
the final implemented behavior. Temporary analyses remain only while a decision is open.
Delete this plan when it lands; code and comments do not cite it.
