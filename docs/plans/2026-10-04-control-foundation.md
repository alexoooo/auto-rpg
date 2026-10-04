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

Independent policy bodies now receive granted equipment observations/models and can combine
actuator commands with capture/release requests. Validation is atomic and replay includes the
grip lifecycle and policy memory. Either-hand independent-item requests are tested on all three
models in short pinned fixtures. This advances chunk 4(a)'s controller port; it does not prove
anatomical grasp placement, shared-item muscle loads or reference-fighter/game integration.

The [solver contract screen](../reference/solver-contract.md) retains impulse joints: the pinned
multibody binding lacks accumulated effort and generic frame setters, and its unexposed native
damping changes the free rotor response. Both signs press limits and replay. This is a contract
screen, not the still-required anatomical contact/loop/performance comparison.

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
`build/dynamics.ts`, `engine/engine.ts`, `engine/rapier.ts`, `rules/contact-mass.ts`,
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

Compare impulse-joint and multibody trees with identical anatomy, actuator semantics and tasks,
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
