# Next phase: a shared physical foundation for AI and gameplay

## Outcome

A body that different AI approaches can control under the same physics, anatomy, equipment,
actuator limits and game rules. A usable reference controller must get up, attack and defend
with either hand, both hands independently, and both hands on one item. Its implementation is
replaceable: a staged controller, trajectory optimizer, learned policy or tactical planner may
use as much or as little of the supplied control stack as it needs.

This is the next phase's execution order. The existing
[strike plan](2026-10-02-strikes.md) supplies measurements and candidate techniques; its remaining
recipe searches do not precede this foundation. The
[rising design](2026-10-01-rising-00-design.md) supplies sub-minds and recovery fixtures, and
[rising rules](2026-10-01-rising-05-rules.md) supplies the eventual game-rule integration.
Neither staged rising nor torque recipes are required implementations of the new capabilities.
Keep the current fighter usable while each replacement lands and is measured.

## Evidence and starting point

- `Mind` and `embody` in `src/core/mind/mind.ts` already permit direct actuator control.
  However, `Minded` in `mind/minds.ts` returns `Body`, whose view, stance and envelope depend
  on the command layers. `OwnBody.built` also exposes mutable engine objects to a mind.
- [The Rapier experiment](../analysis/2026-10-04-rapier-fork.md) reproduces the tested bouts
  with the old bounds. Correct directional bounds fix two muscle tests but leave eleven other
  failures after the added state is included in replay. Vendoring and enabling those bounds
  are separate changes. The pinned package is vendored and whole-step effort is validated;
  corrected bounds have not yet changed the reference controller.
- [Recovery](../reference/rising.md#where-the-rise-stops) identifies a mismatch between the
  bearing controller and actual contacts: a held point at the middle of a flat hand leaves
  rotations free that the ground prevents. The related shin stall survives more iterations.
  A feasible ground wrench alone does not prove a feasible motion.
- [Recovery's battery](../reference/rising.md#staged), Node/core world/Rapier/120 Hz, reads
  112/127 Warrior falls risen unarmed and 94/121 with a club, with median times from the fall
  of 22.58 and 25.30 s. The smaller battery reads Rogue 6/32, skeleton 1/32 and bout falls 2/6.
- [Strike measurements](../reference/blows.md#thrown-from-where-it-stands) distinguish long
  preparation from committed attacks. Powerful recipes start from a narrow prepared state;
  [jitter search](../reference/blows.md#searched-with-jitter) also found a candidate whose
  apparent gain failed at other rates. More nominal energy is not the principal objective.
- `build/rigid.ts` merges each held item's mass and colliders into one segment. An item has no
  general two-hand attachment or release lifecycle. `engine/rapier.ts` uses impulse joints and
  does not explicitly enable CCD.

These are recorded results, not fresh measurements. Re-read affected baselines after physical
changes; preserve their harness, loadouts, assistance and engine revision in every new table.

## Contracts to establish

| Owner | Contract | Excludes |
|---|---|---|
| Physical body | Identity, spec, segments, joints, physical state, lifecycle | A required stance, skill, recovery route or fighter |
| Actuators | Legal commands, directional effort/speed bounds, measured effort | A policy changing mass, poses, velocities or solver settings |
| Equipment | Item identity, surfaces, grip frames, attachments and releases | One item copied into two hands |
| Observation | Proprioception, contact and item measurements, permitted external senses | Mutable engine handles, another policy's state or orders |
| Optional model access | Read-only kinematics and dynamics for trusted controllers | Authority to change the live world |
| Controller | Observation to action, explicit memory and lifecycle | Ownership of physics or task scoring |
| Task/rules | Initialization, objectives, metrics, endings, allowed assists | A required method of achieving an objective |

Three optional entry points share one physical enforcement path:

1. Actuator actions for direct policies.
2. Motion objectives for policies using a supplied controller: joint trajectories, body balance,
   support transitions, and hand/item pose and velocity trajectories.
3. Skills for policies choosing recovery, movement, strikes and defenses.

A torque adapter still respects the same actuator envelope. Different action representations
are declared in an experiment; a tactical-policy comparison and a whole-controller comparison
are separate results. A motion objective refers to named frames/effectors, not an API restricted
to the right hand. Implement current bodies first without promising arbitrary morphology works.

Measured contacts are distinct from desired supports. Read body motion independently of stance
planning. Keep controller-specific readiness, predicted support and gait envelopes in controller
reports. Reuse one physical predicate where the game needs one; do not invent competing fall bars.

Every controller has one owner of final actuator commands. A reference controller combines both
hands' objectives with trunk and support demands; skills do not overwrite shared channels in
callback order. A direct policy may instead produce the whole action itself.

## Physical choices and experiments

- Vendor the narrow Rapier patch first. Correct actuator bounds are the target baseline;
  retune measured behavior rather than restoring excess braking or raising anatomical strength.
- Compare multibody and impulse joints before a large controller rewrite. Multibodies constrain
  the body's tree; shared two-handed items require loop-closing constraints. Check joint angle
  conventions, limits, actuator bounds, contact behavior, snapshotting and cost in both. A
  successful tree-only demo is insufficient evidence to switch the game.
- Give every item logical identity independently of its simulation representation. A rigid
  single-hand grip may retain today's compound body. Compare that against a separate item body;
  either must support a second grip, release of either hand, correct mass/inertia and continuous
  motion. A release neither duplicates mass nor injects velocity. Avoid a separate-body mandate
  before measurement, and avoid making the chosen optimization visible to policies.
- Plan strikes in weapon pose/velocity space, including preparation, interception and recovery.
  IK is a component, not proof of dynamic feasibility. Test smooth reachable and unreachable
  goals; the current reach solve's unresolved convergence must not feed noisy accelerations into
  a new controller (`../reference/step-cost.md`, the reach-solver sections).
- Compare muscle-driven tracking with a capped external weapon assist. The assist is separately
  configured and metered, defaults off, and never silently becomes Strength. Its rules need
  their own sourced ceilings and force/moment/work accounting; root balance does not implicitly
  authorize extra effort at an item. The unassisted capability gate remains separate.
- Gain scheduling is a controller option. Stiffness, damping and maximum effort are distinct;
  impact-driven impairment is a separate game/physiology rule. Do not prescribe automatic
  partial ragdolling for every policy or add co-contraction by merely widening torque bounds.
- Predictive defense plans a reachable interception with orientation and velocity, and replans
  after contact. Blocking depends on inertia, leverage, grip, muscles and footing as well as
  feedback gains. No authored block/parry success flag overrides physics.
- Keep the current blunt damage model while changing control. Preserve collider/surface identity
  and impact episodes, including shared items; support forces and sustained contact are not
  automatically repeated blows. Cutting, piercing, injury and new RPG attributes are later rules.
- Test CCD against moving thin defenses and rotating weapons. Filter necessary adjacent/gripping
  pairs explicitly; retain meaningful self-collision. Numerical conditioning stays named and
  measured outside anatomy, not hidden by changing a hand or weapon's inertia for feel.

## Execution, in independently landable chunks

Chunk 0's runner and stock screening record are implemented in
[control-foundation](../reference/control-foundation.md), including explicit missing capabilities
and measurement limits. Its held-out split remains unused. Chunk 1's behavior-preserving
vendoring is implemented and reproduced ([engine record](../reference/rapier-vendor.md));
directional engine APIs, accumulated effort and its saved state are implemented. The 138 baseline
rows still equal stock. Corrected muscle actuation is available as an explicit world configuration;
the game retains the symmetric reference pending physical capability gates. Loaded braking and
one-way torque commands pass, but recovery exposes a discontinuous predicted shin support and
the existing contact-motion mismatch. Bring the body/observation seam and contact correction
forward before completing chunk 1(c)'s default migration. This is a dependency change, not a
passed recovery gate. Later task
fixtures extend this same runner rather than replacing its baseline.

The [angular-limit correction](../reference/joint-limits.md) is available explicitly as
`rapier-coordinate`, with mandatory mechanical and replay checks. Its unconditional screen
breaks existing defense, standing-bar and recovery behavior, so gameplay retains parent-axis
limits. Retune and measure the reference controller under corrected limits before default
migration; tables measured on the parent-axis configuration do not satisfy that gate.

Paths marked **new** are proposed modules/scripts, not existing capabilities. Each numbered chunk
may take the listed smaller commits. Every commit passes the common checks below. Keep experimental
choices in immutable configuration outside environment variables in the core. A failed technique
lands only its reproducible evidence, not a new default or a disabled invariant test.

Chunk 2's common lifecycle, detached observation/action port and independent joint-feedback mind
are implemented. The direct mind reaches and holds on all three pinned bodies under corrected
actuation, saves/restores, idles/resumes and runs alongside a fighter in an arena fixture.
This does not claim independent standing, fighting or recovery. The richer optional model
capability and equipment observations grow with the physical fixtures in subsequent chunks.

Chunk 3's reusable environment and shared pinned-reach fixture are implemented. Reset, policy
clock/action holding, task endings, RNG, controller state and physics restore together, with
configuration mismatch rejected transactionally. The common runner's `reach` suite and the
visible control-foundation page use the same builder. All six seed-42 body/controller cells
match Node and Chrome observation digests and replay through a checkpoint between decisions.
The fixture proves the seam, not the combat/recovery gates still below.

The first part of chunk 4(a) supplies experimental separate items and persistent engine grip
slots. Mechanical tests prove one-item mass, either-hand release, reachable capture, detached
contact identity and exact replay through topology changes, including a closed loop. This is
recorded in [equipment grips](../reference/equipment-grips.md). Character equipment integration,
damage/rendering identity, compound splitting and the representation choice remain open; this
does not complete chunk 4(a) or its physical capability gate.

The common runner's `ccd` suite now demonstrates translating and rotating bars against a thin
moving defense, with moving-body CCD on/off, replay and 120/480 Hz traces sampled at 120 Hz.
The [collision record](../reference/collision-ccd.md) distinguishes the engine's automatic
fixed-collider sweep from its explicit moving-body flag. Character-held collision coverage,
contact-motion correction and solver/representation comparisons remain open.

The bearing solve now separates its tracked motion point from the patch's force reference in
both torque and effort calculations. The engine exposes unaveraged contact manifolds, and normal
motion rows preserve sliding/rolling/lift-off. [Contact motion](../reference/contact-motion.md)
records the failing-before/passing-after invariant and mechanical geometry fixtures. The staged
support model has not yet adopted them; flat-hand/shin recovery improvement remains unproven.
The manifold port now reconstructs current-pose separation from native solver anchors; the
upstream distance field is cached at the last full contact update. Settling and lift-off expose
the difference. This read-only vendor extension preserves the physical solver.

Independent policy bodies now receive granted equipment observations/models and can combine
actuator commands with capture/release requests. Validation is atomic and replay includes the
grip lifecycle and policy memory. Either-hand independent-item requests are tested on all three
models in short pinned fixtures. This advances chunk 4(a)'s controller port; it does not prove
anatomical grasp placement, shared-item muscle loads or reference-fighter/game integration.

The [solver contract screen](../reference/solver-contract.md) retains impulse joints: the pinned
multibody binding lacks accumulated effort and generic frame setters, and its unexposed native
damping changes the free rotor response. Both hinge signs press limits and replay. The expanded
joint-shape screen traps on two-angular-DOF multibody motion and finds three-axis internal
limits incompatible with anatomical coordinates. Retain impulse joints; a faithful multibody
anatomical/contact/loop comparison needs an engine extension or validated hybrid first.

The [constraint-mass model](../reference/constraint-mass.md) now accounts for active grips and
redundant closed loops. Its impulse responses match the engine with both grips, either release
and both released; it agrees with the tree model on all three anatomies. This establishes
instantaneous impact mobility, not loaded actuator dynamics or game damage integration.

[Grip clearance](../reference/grip-clearance.md) fixes release from overlapping grasp colliders
and makes CCD honor connected-pair exclusions. Both defects fail before the fix. Saved state
includes the clearance interval; later collisions return once the pair separates. Anatomical
placement now shares the compound grasp frame through `equipHands`. A pinned two-item fixture
moves both loaded arms under gravity on all three models through independent actuator feedback.
Standing use, rendering and damage integration remain open.
Capture now preserves the accepted pose instead of asking the joint to correct the tolerance
error. Actual captured frames are observed, replayed and used by both dynamic models. Reading
the native geometry exposed a rank defect; shared strongest-row pivoting fixes the redundant
loop without changing the numerical tolerance or its physical acceptance gates.

The [coupled acceleration model](../reference/coupled-dynamics.md) extends the floating tree
with separate item mass, gyroscopic bias and closed grip constraints. Mechanical force/torque
responses survive either release; a moving loop matches engine acceleration and retains six
free motions. Common-point attachment rows fix spurious constraints from solver anchor gaps.
This supplies a diagnostic model for chunk 5; general contact-mode selection and the recovery
support correction remain to be implemented and measured.
The model now accepts explicit motion rows and reports their equivalent reaction loads, with
redundancy and release checks. This lets a controller inspect tensile or excessive-friction
predictions; choosing admissible contact modes remains open.
Optional material-acceleration targets now distinguish rolling from a fixed material pivot.
The [rolling-contact stand](../reference/contact-curvature.md) removes a fictitious downward
acceleration on spheres and capsules and isolates a separate cached-contact-point error.
The reference tracker has not adopted the correction: current support geometry, capsule
contact modes and the anatomical recovery remeasurement are the next integration requirements.

`math/quadratic.ts` supplies a deterministic constrained-quadratic component for that combined
solve, with explicit warm-start state, fixed iteration budgets and residual reports. Analytic
KKT, coupled-bound and replay checks are recorded in [quadratic tasks](../reference/quadratic-tasks.md).
It is optional controller machinery, not a new policy requirement; contact selection has not yet
adopted it.
`math/active-quadratic.ts` adds a bounded-work, cold-start dual active-set alternative, adapted
from the pinned MIT quadprog kernel within the exact arithmetic boundary. It shares input
validation with ADMM and independently checks KKT residuals. The reference controller's contact
formulation can select it without changing the policy/action contract.

The [motion-objective and pinned bar fixtures](../reference/motion-tracking.md) provide joint,
point and optional orientation trajectories with one owner of bounded actuator commands. They
track two independent items and capture/move/swing a shared item into an obstacle before either
grip release. Capture geometry, model state, impact and release replay exactly. The common bar
runner measures pinned and standing anatomical load paths separately. The
[standing fixture](../reference/standing-bar.md) uses measured sticking contacts, unilateral and
friction constraints, and bounded muscle torques without a pelvis pin or assistance. Desired
support never changes physical collision. Rejected solves are explicit zero-torque failures.
An optional [contact force redistribution](../reference/contact-distribution.md) removes
artificial tension while preserving each contacted body's wrench. Its isolated force-allocation
and save/restore tests pass; it is not enabled in the measured reference tasks and does not
establish a recovery improvement.
Optional [near-stop prediction](../reference/joint-stop-tracking.md) supplies local unilateral
reaction selection and end-step effort bounds. Its single-joint regression verifies pressing
and releasing either loaded limit through bounded actuators. Its corrected-profile development
comparison improves shared static/moving strikes to 34/36 and 51/54, but bar and defense
regressions keep it optional. All 348 comparison rows replay. General support transitions,
stop-aware planning, hot-path optimization and recovery/combat integration remain required.
[Released-hand withdrawal](../reference/shared-withdrawal.md) subsequently closes the corrected,
stop-aware shared static and moving screens at 36/36 and 54/54. The 270-row comparison retains
reference and stop-disabled failures; all replay and remain upright. This is a reference policy
over existing frame objectives, not a change to release mechanics. The allocating experimental
tracker is not the game's default.
Optional [local contact lift-off](../reference/contact-liftoff.md) adds free-motion seeding,
radius-derived active contact acceleration and normal no-crossing bounds after release.
Repeated mechanical lift/recontact works on both profiles, independently of near-stop
prediction, with exact replay. This does not close general contact-mode selection: the
anatomical recovery prototype remains unsuccessful, and sliding is still unmodeled.
The [posture audit](../reference/posture-limit-models.md) now selects the engine's reaction
directions and includes coupled stop loads on otherwise unsupported channels. Three corrected
development witnesses are statically feasible, but all miss the five-second engine hold gate.
Those witnesses do not close the recovery gate; entering and holding supports remain required.
The [recovery support diagnostics](../analysis/2026-10-05-recovery-support.md) retain failed
entry and installed-pose experiments. Active contact acceleration compatibility is checked;
sliding/rolling alternatives and entry into a demonstrated hold remain controller gates.
[Geometric planar support](../reference/planar-support.md) supplies current sphere, capsule and
polyhedral features; a fine-step sliding-sphere check agrees with the engine and replays.
The controller still uses measured midpoint contacts. Geometric contact integration and
multi-contact sliding/sticking selection remain open.
[Patch-friction measurements](../reference/contact-friction.md) identify another mismatch:
the pinned rigid-body engine uses central friction plus independent twist resistance, whereas
the controller assumes per-point friction. The native Coulomb option is exposed in separately
identified profiles. Both patch and projected per-point sustained-sliding predictors have
mechanical checks; neither is a general mode selector. Select and validate
the matching sliding/sticking predictor for model-based control. Multibody
comparisons must name this distinction because native multibody contacts already use Coulomb.
The [local contact-step predictor](../reference/contact-step.md) now validates sliding, stopping,
holding and unloading on a loaded slab, including initial spin and exact replay. Its finite
solve rejects uncertified candidates; fine-step landing remains unvalidated. Mass-projecting
measured velocities resolves incompatible contact demands on linked bodies without changing
physics. Linked slabs now slide and stop with exact replay; prescribed joint torque still
exposes rejected stopping predictions. Optional [angular-stop impulse rows](../reference/contact-stops.md)
now validate established support and release on a grounded hinge, at either limit with sticking
or sliding ground contact. Hard stop arrivals remain unvalidated. Bounded inverse-control
prototypes converge but miss anatomical next-step motion and the hold gate; the diagnostic
forward model is not yet in the tracker.
The optional [rigid-body friction metric](../reference/contact-projection.md) now matches
native per-point sliding direction on a welded-load fixture at both declared rates and signs,
with exact replay. Joint elimination changes saturated friction direction when the coupled
metric is used instead. This fixes a model-law distinction, not the anatomical acquisition gap;
matched-load first-contact diagnostics still miss all-fours motion.
The independent joint-feedback policy now [holds installed Warrior all fours](../reference/posture-hold.md)
for ten seconds within 2 cm on both corrected-limit friction profiles, with zero assistance,
exact replay and matching Node/browser traces. The shared builder initializes a legal joint
pose before constructing physics. Half-kneel and squat still fail at the default solver count; Rogue and skeleton fixtures
are explicitly unsupported. This closes a limited installed-pose hold gate, not entry, balance
or recovery. The [support-entry task](../reference/support-entry.md) now reaches measured
hand/shin support after physical development falls, using an optional observation/action
pose-sequence policy. Its ten-second, 2 cm hold gate passes 2/4 patch and 3/4 per-point cells;
all eight replay, with selected Node/browser traces matching. Quiet support, drift and elapsed
time are scored independently of policy stages. Broader starts, other bodies, loaded hands,
hand unloading and transfer to standing remain open. Direct feedback and model-based control
remain replaceable alternatives.

The [effort precision correction](../reference/effort-precision.md) removes rounding growth in
the whole-step motor ledger without changing physical traces. The installed half-kneel passes
at 256 native iterations, with 18.19 mm drift, but squat still collapses. This is diagnostic
evidence about solver resolution; the default remains 16. Entry, support transfer, loaded
control and browser cost still require their own gates.

The [upright support task](../reference/support-transition.md) now transfers load, lifts either
foot, verifies placement contact and regains two-foot support on all three bodies in the
zero-offset regression. Readiness is measured, policy state replays, and the task checks another
second of control. This is a shallow empty-handed task; loaded transitions, stepping, recovery,
joint-stop-aware planning and the integrated gameplay gates remain open. The bar fixture's
position-only return uses measured readiness within the existing deadline and tolerance. Its
[captured arm posture](../reference/bar-posture.md) reduces the largest return error in both
Rapier-profile development screens, which each retain 12/12 successes. Near-stop prediction
is available as a separate experimental configuration; complete task reliability and
corrected-limit gameplay migration remain open.
The built `/control-tasks.html` viewer runs those same builders and draws separate equipment
through release. [Twelve browser cells](../reference/control-tasks-browser.md) match Node's
observation hashes and replay their policy/task state. This closes the visual/replay checks for
these controlled demonstrations, not the recovery or opponent-combat gates.

The [point-space strike](../reference/point-strike.md) reference now supplies measured guard
readiness, a quintic strike, follow-through and return from the observed point. The same policy
addresses named segment/item points, either hand or independent items. The physical fixture
scores closing contact against its intended collider and includes deliberate misses, continued
standing and replay. The shared viewer exposes it. The motion host also accepts delayed external
senses. The [moving-target variant](../reference/moving-strike.md) adds detached delayed object
measurements, constant-velocity point prediction and optional per-effector impact braking.
The shared fixture and runner compare tracked and fixed aim against freely swinging targets,
with relative contact-velocity scoring. The [shared-item variant](../reference/shared-strike.md)
physically captures a second grip, strikes with both hands and optionally releases either hand
for return. Its static extended development screen passes 28/36: all human trials pass, while
eight skeleton returns exceed the unchanged error tolerance. The moving shared screen passes
40/54, again with only skeleton return failures. All stay upright and replay.
Shared-item reliability and defense remain open; isolated target contact alone does not close
the strike/block gate.

The optional [interception reference and defense fixture](../reference/point-defense.md) now
use measured point acceleration, explicit reach/time filters and contact bracing. The shared
runner and viewer compare it with pose-only defense against gravity-driven hinged clubs. The
development gate with corrected joint-angle acceleration passes 33/36 predicted starts and 0/36 pose starts; three post-block coverage
failures remain. All trials prepare, stay upright, avoid rejected solves and replay. Initial
blocking is demonstrated, but sustained protection across starts, shared-item defense and
coordinated attack/guard remain open. The held-out split is still unused.

The optional motion interface also supplies [centre objectives](../reference/centre-control.md)
over explicit mass-weighted groups, and selected world axes for translation. The standing
strike fixture can control horizontal combined centre separately from root height and continue
for ten seconds after return. Mechanical conservation, unequal-mass tracking, command validation
and replay are tested independently of the strike's success score. This does not supply support
planning or recovery.

The [joint-acceleration correction](../reference/joint-acceleration.md) includes the changing
motor-speed-to-angle-rate map in joint objectives. Quaternion trajectories and a physical
bounded-actuator rotor distinguish the missing term. This corrects the optional tracker without
changing anatomy or actuator limits. The [measured joint-coordinate primitive](../reference/joint-coordinate.md)
supplies world motion rows and their curvature, with finite-rotation and loaded/released hinge
checks. Consistent unilateral stop selection, whole-body adoption and recovery remain open.

### 0. Define the common task battery and baseline

**Files:** `research/control-foundation.mjs`, `research/control-foundation-trials.mjs`,
`research/control-foundation-worker.mjs` (**new**); `tests/research-control-foundation.test.mjs`
(**new**); `research/README.md`; `docs/reference/control-foundation.md` (**new**).

Build on `tests/harness/core-stand.mjs`, `research/core-rise-trials.mjs`, `core-posture-trials.mjs`,
`strike-robustness.mjs`, `strike-bouts.mjs` and `core-guard.mjs`. First land the runner, manifest
and existing-controller readings. Add new task families only when their physical fixtures exist.
The manifest records body/item/engine revisions, seed, initial state, sensing, action interface,
policy period, assist ceilings, watch duration, controller version and metric definitions.

Separate development and held-out seed/start sets before tuning. Record per-cell denominators
and uncertainty; successful cases cannot hide unsupported bodies or loadouts in a pooled average.
Define thresholds and watch durations in the record before each task's search. Initial thresholds
are engineering proposals, not owner-approved gameplay timing or anatomical facts. Do not lower
a threshold after seeing held-out failures; a changed task definition starts a new evaluation.

**Gate:** reproducible rows from the present controller, stable task identities and separate
metrics for preparation, useful impact, unintended falls, time to recover useful control,
remaining upright, assist effort, joint/contact error and step cost. The test exercises fixture
construction, metric/event accounting and seed replay, not asserted future controller performance.

### 1. Establish the actuator baseline

**Files:** `vendor/rapier/` (**new**, bring across the recorded vendor work after inspection),
`package.json`, `package-lock.json`, `src/core/engine/engine.ts`, `engine/rapier.ts`,
`muscle/driver.ts`, `state.ts`; `tests/core-engine.test.mjs`, `core-muscle.test.mjs`,
`core-fork.test.mjs`, `arena-fork.test.mjs`; `research/core-rapier-probe.mjs`.

Land separately: (a) pinned build/patch/package with old behavior; (b) directional bounds,
effort reads and complete saved state; (c) corrected behavior with the affected control retuned
and measured. Package metadata and the lockfile change together; validate with `npm ci`. Preserve
the installed package layout used by the bench. Do not land the experiment's environment switch.

Prove the vendor-only change against stock on the same code for the three recorded bout recipes,
the common baseline, and a rebuild from another work directory. Add per-world-step accumulated motor impulses; name last-substep reads
accurately. If work is measured, accumulate torque times motion over substeps rather than
calling a last-substep torque the step average. Check impulse signs, saturated loaded braking,
both directional limits, finite/infinite command semantics and rate dependence.

**Gate:** motor invariants and replay pass; stance/recovery/strike changes have before/after
tables under the corrected bounds. Tests that assumed an old trajectory get a meaningful
replacement fixture, not deletion of their assertion. Keep symmetric and directional results
separate, with immutable world configuration and archived source. Finish the corrected baseline
and contact fixes before new controller searches; chunks 2 and 3 may establish their interfaces
while chunk 4 supplies the contact correction needed to finish this gate.

### 2. Decouple the body and prove controller replacement

**Files:** `src/core/body.ts`, `mind/mind.ts`, `mind/minds.ts`, `mind/config.ts`, `mind/senses.ts`,
`mind/sub-mind.ts`; `src/core/observation.ts`, `mind/actions.ts`, `mind/direct.ts` (**new**);
`src/arena/duel.ts`, `src/dungeon/run.ts`; `tests/core-mind.test.mjs`, `core-sub-mind.test.mjs`,
`core-boundary.test.mjs`, `core-fork.test.mjs`.

First extract physical observations and a controller-independent body lifecycle from
`BodyView`/`Body`. Adapt `Minded` and game callers to that common handle. Keep the current
commanded body as the reference controller's adapter, including its own stance/envelope reports.
Next expose observation/action ports without mutable physics handles; internal model-based
controllers receive a separate read-only model capability. Typed readonly views must not expose
mutable live vectors/arrays through which a policy can alter the physical state.

Add a direct joint-feedback mind through the public path. It completes a bounded reach/hold task
without constructing `motorControl`, `createSkills`, the stance or the staged riser. Verify
observations, action limits, idle/resume, disposal and snapshot restoration for both minds. This
is a replacement proof, not a claim that the second mind can already fight.

**Gate:** the same physical fixture and game-facing lifecycle host either controller. Equivalent
old-fighter actions retain their baseline behavior; the new controller needs no fighter fields.

### 3. Expose a reusable research environment

**Files:** `src/core/tasks/environment.ts` (**new**), `src/core/world.ts`, `state.ts`,
`mind/actions.ts`, `mind/senses.ts`; `research/control-foundation*.mjs`;
`tests/core-environment.test.mjs` (**new**), `tests/core-fork.test.mjs`.

Wrap the same `World.step` in seeded reset, observe, act/step, save/load and disposal. Keep rewards
in research/task adapters; expose underlying metrics separately. Distinguish task termination,
time-limit truncation and invalid simulation. Support explicit integer policy periods with
specified action holding between decisions while physics stays at 120 Hz. Save RNG, policy
clock, held actions and controller state. Test a branch across both an action boundary and reset.

Declare privileged model/state access in each experiment; diagnostic world state cannot leak into
normal observations. Use worker threads for independent environments. A later asynchronous planner
must use deterministic due-step/budget semantics, not whichever result finishes first in real time.

**Gate:** direct and layered controllers run the same task definitions; replay is exact within a
declared engine/configuration, and Node/browser run a shared fixture through the same builder.
No requirement for different solvers to produce identical trajectories. Python/RL-library bridges
and asynchronous planning are consumers to add when needed, not prerequisites for this phase.

### 4. Test equipment, contacts and solver representation

**Files:** `src/core/spec/body.ts`, `human/grip.ts`, `build/rigid.ts`, `build/build-body.ts`,
`build/dynamics.ts`, `engine/engine.ts`, `engine/rapier.ts`, `build/contact-mass.ts`,
`rules/blows.ts`, `touches.ts`; `src/core/equipment.ts` (**new**);
`control/bearing.ts`, `mind/rise/limbs.ts`; `tests/core-equipment.test.mjs` (**new**),
`core-engine.test.mjs`, `core-rise.test.mjs`, `core-blows.test.mjs`, `core-fork.test.mjs`.

Land separately: (a) item identity and grip lifecycle; (b) two-handed bar fixtures and contact
correction; (c) solver/representation comparison and recorded choice. Start with simple sourced
blunt items; each item has one mass, one collision identity and explicit grip frames. Preserve
surface attribution, collision exclusions, save/load, and rendering identity across attachment.
Release preserves the item's point velocity and spin, including the change of centre of mass
when a compound body splits. A grip request cannot teleport a hand or item into alignment.

The bar demonstration holds, moves and swings one item, presses it into an obstacle, then
releases either hand in separate trials. Exercise the resulting closed loop in dynamics, actuator
loads and effective contact mass; do not reuse a tree-only inverse-dynamics result unchecked.
Compare compound-primary-hand plus secondary constraint against a separate item with two grips.

Reproduce the flat-hand and supported-shin stalls. Match contact motion rows to the geometry,
allowing legitimate rolling/sliding/lift-off rather than welding every contact. Read predicted
versus actual accelerations and load transfer through removal of a support. Add thin moving
shield/fast rotating bar cases with CCD on/off and collision pairs explicitly audited.

The [joint-shape screen](../reference/solver-contract.md#anatomical-joint-shape-compatibility)
now rejects a drop-in multibody tree: the pinned engine traps on two-angular-DOF joints and
its three-axis internal limits use different coordinates from the anatomy. Retain impulse
joints for the current foundation. A multibody comparison therefore requires an explicit
engine extension or faithfully validated hybrid representation first, not just missing bindings.
Once that exists, compare impulse-joint and multibody trees with identical anatomy, actuator semantics and tasks,
including loop closure, limit pressing, falling, release and save/load. Verify the fork's actual
binding support; a motor API on one joint type is not proof it exists on another. Measure cost
on Node and a visible browser. Adopt a new solver representation only after this whole path holds.

**Gate:** no duplicated mass, unexplained release impulse, missing weapon contacts or hidden
external effort; contact corrections improve observed motion, not only the controller residual.
Both-handed load paths work before a larger motion-controller design is committed.

### 5. Build the reference motion controller and strike/block demonstration

**Files:** `src/core/control/tasks.ts`, `control/whole-body.ts` (**new**), `control/bearing.ts`,
`control/contact-wrench.ts`, `control/motor.ts`, `control/servo.ts`, `control/assist.ts`,
`control/kinematics.ts`; `src/core/body.ts`, `skills/strike.ts`, `skills/guard.ts`,
`mind/threat.ts`; `tests/core-motion.test.mjs` (**new**), `core-guard.test.mjs`,
`core-strike-skill.test.mjs`, `core-step-cost.test.mjs`; the common research runner.

Land the objective vocabulary and a single physical tracking task first, then coordinated
support/effort constraints, then interception and recovery. Reuse verified dynamics and bearing
code. The preferred reference implementation solves mutually compatible accelerations, contact
forces and bounded actuator effort, with explicit task priorities and infeasibility reports.
A quadratic-program implementation is a candidate, not the public interface or a prerequisite
imposed on other controllers. Resolve unreachable targets without feeding unconverged IK
differences into acceleration goals; keep the existing reach bed as a regression instrument.

The weapon demonstration uses pose and velocity through windup, interception and follow-through,
with readiness based on measured state. Couple hand objectives for a shared item; coordinate
independent attack/guard objectives when items are separate. Replan on target movement, impact,
blocked motion and a miss; the legs anticipate support demands instead of only catching a fall.
Defense predicts threats and checks reachability/time, not just an extrapolated point.

Compare muscle-only tracking, existing recipes and explicitly capped weapon assistance with the
same fixture and sensing. Land any assist separately through the assist/rulebook contract and
meter its force, moment and work; do not change the unassisted default. Keep impact impairment
and changes to damage outside this controller change. Any new numeric setting gets provenance.

**Gate:** strike a stationary and moving target, block a scripted incoming blow, and recover
after both impact and a miss. Show either hand, independent two-item use and a shared item;
compare guard against the pose baseline. Measure delivered impact, tracking errors, latency,
falls, effort and cost rather than maximizing nominal energy alone. A block remains a physical
contact, not a hit cancellation. The direct-controller environment still works unchanged.

### 6. General recovery and integrated gameplay

**Files:** `src/core/mind/rise/staged.ts`, `rise/stages.ts`, `rise/limbs.ts`, `mind/config.ts`,
`mind/sub-minds.ts`, `skills/skills.ts`; `research/core-rise*.mjs`, the common runner;
`tests/core-rise.test.mjs`, `research-rise.test.mjs`, `arena-core.test.mjs`,
`arena-fork.test.mjs`, `crypt-core.test.mjs`; `src/arena/duel.ts`, `src/dungeon/run.ts`,
`src/lab/scenarios.ts`, their UI callers, and the documents listed in rising rules.

First adapt staged recovery to the shared motion/contact interface, then add body/loadout routes
where needed, then integrate game rules. Use `research/core-posture.mjs` to distinguish a route's
physical feasibility from the controller's ability to enter and leave its postures. Recovery
unloads supports before moving them, verifies new support, detects lack of progress and retries
or changes route. It cannot require the support state it is meant to restore. A held item must
not silently disappear or be released by the harness to make a fall recoverable.

Retain sub-mind interruption for the reference stack; other policies may implement recovery
internally. The game reads physical outcomes, not recovery stage names. Apply the existing
rising-rules plan only after the replacement meets the battery; update it to the selected
controller rather than hard-coding `staged-rise` as the platform's only solution.

**Gate:** across Warrior, Rogue and skeleton, each required loadout completes the held-out
sequence fall -> rise -> move -> defend -> attack -> miss -> continue, including disturbance
during recovery and either-hand release in shared-item trials. Record unsupported cells openly;
they block phase completion rather than disappearing from the aggregate. Report the skeleton's
placeholder anatomy explicitly. Compare time to useful control and survival after handover,
not just standing once within 40 seconds. Show the same controllers in the lab and in fights.

## Common checks, commands and completion

Each chunk lands with relevant existing tests plus a fixture that fails under the defect it
claims to fix. No snapshots of arbitrary old trajectories replace physical/task assertions.
The common runner's CLI is to be implemented in chunk 0; these are its planned commands:

```powershell
node research/control-foundation.mjs --suite baseline --split development --workers 4
node research/control-foundation.mjs --suite bar --split development --workers 4
node research/control-foundation.mjs --suite strike-block --split development --workers 4
node research/control-foundation.mjs --suite recovery --split development --workers 4
node research/control-foundation.mjs --suite integrated --split held-out --workers 4
```

The runner records immutable experiment manifests and result files under
`research/runs/control-foundation/`; durable tables and reproduction commands go into
`docs/reference/control-foundation.md`. Add `--hz` and explicit configuration inputs for solver
and assist comparisons. Read faster-rate traces at the slower spacing before interpreting them.
Freeze candidates before held-out evaluation; any subsequent tuning requires fresh held-out cases.

Before every commit:

```powershell
npm test
npm run check
npm run build
git diff --numstat
git diff --ignore-cr-at-eol --numstat
```

Compare the last two outputs for equality. Run performance measurements on a quiet machine;
compare the same tasks before and after. Node timings alone do not establish browser capacity.
For visual gates use the built preview on a free port, keep the tab visible, and stop only the
owned server by its listening PID afterward. Do not touch the owner's port 5180.

Phase completion requires both physical capability and replaceability: the reference controller
passes the declared task gates, an independent controller uses the same observation/action
contract without the reference motor stack, and replay includes physics, equipment and policy
state. Research and gameplay share the world/task builders rather than separate physics paths.
This phase need not train a competitive learned fighter, implement fingers, invent injury or
cutting rules, or support every morphology. Those remain consumers/extensions of the foundation.

As chunks land, move established architecture into `docs/architecture.md`, measurements and
numeric sources into reference records, and unresolved choices into `docs/roadmap.md`. Reconcile
the fork analysis when vendoring lands. Remove completed plans and repair their links; code and
comments cite durable records, never this plan.

## External references to verify against the pinned engine

- [Rapier joint constraints](https://rapier.rs/docs/user_guides/javascript/joint_constraints/):
  reduced-coordinate trees and additional constraints for loops.
- [Rapier joint motors](https://rapier.rs/docs/user_guides/javascript/joints/): position and
  velocity motor controls; position motors are not exclusive to multibodies.
- [Rapier CCD](https://rapier.rs/docs/user_guides/javascript/rigid_body_ccd/): continuous collision
  handling is an experiment to validate against the actual pinned implementation.
- [Prioritized whole-body control](https://arxiv.org/abs/1807.01222): compatible contact demands,
  task relaxation and support transitions as reference-controller techniques.
- [Gymnasium environment API](https://gymnasium.farama.org/api/env/): reset/step and the distinction
  between termination and truncation; no dependency on Gymnasium is required in the core.
