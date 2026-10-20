# A shared workshop for controllers and skills

## Direction

One repository, developed on the owner's laptop and desktop, where successive people and LLM
agents build on one another's work. They develop tactics, locomotion, stand-up, combat skills
and motor controllers, assemble fighters from them, and watch those fighters compete in the
Arena. Implementations, results and unsuccessful approaches are available to later authors.
The lasting products are reusable capabilities and useful fighters, with attribution in Git
history and experiment records.

The workshop also accommodates new equipment (shields, swords, two-handed weapons, bows and
other items) and body families, including monsters. A component can specialize in a family or
loadout; its supported scope is explicit. Improving portability and robustness is useful work
alongside improving peak performance.

The existing [Mind boundary](../architecture.md#minds), [state model](../architecture.md#state)
and recorded-actuation replay are the foundation. An experiment can use the command layers,
replace a part, or supply an independent policy. What runs in the game runs in the browser;
training can happen offline. LLMs author code and assets in development sessions. Calling an
LLM during a bout is a separate experiment when there is a concrete need for it.

## Plan ownership

| Plan | Open work it owns |
|---|---|
| This workshop plan | Component interfaces/registration, common tasks, loadouts, body compatibility, collaboration and evaluation infrastructure |
| [Whole-body control](2026-10-17-general-controller.md) | Running/Haste, unassisted recovery, separate assistance experiments, strikes and holds on one execution stack |
| [Options fighter](2026-10-14-options-fighter.md) | Tactical decisions, option models and player configuration for one Mind |

The implementation efforts are independently useful clients of the workshop. Tactics can be
compared on a frozen platform while motor and skill research proceeds. A shared interface change
lands separately, and comparisons name the resulting checkpoint. Existing behavior belongs in
the architecture, standing contribution rules in `AGENTS.md`, and measured evidence in its
reference or experiment record. Each plan retains its open work and completion criteria.

## Units of work

| Unit | Responsibility | Examples |
|---|---|---|
| Shared platform | Physical authority, construction and common contracts | World step, anatomy, sensing, muscles, equipment mechanics, damage |
| Component | One replaceable algorithm with an explicit interface | Gait, recovery, guard, attack executor, tactics, motor control |
| Fighter | A named Mind assembly or an independent policy | A choice of locomotion, recovery, guard, attacks, tactics and motor |
| Task | Physical conditions, observations and independent scoring | Recovery from a fall, a walking course, a moving target, an Arena bout |
| Experiment | A question, compared implementations, conditions and evidence | A recovery comparison across bodies and loadouts |

Use capability and algorithm names for implementations. Keep the author, model and development
session in the experiment record. A learned gait is a component whose immutable assets include
its weights. A fighter can reuse several authors' components and add its own tactics.

Keep shared platform changes separately reviewable from algorithm contributions. A new physical
mechanic or contract changes what every implementation runs on; a new recovery algorithm is a
component contribution even when several fighters use it.

## Components and fighter assemblies

The existing part system (`src/core/mind/parts.ts`, `catalog.ts`) supplies roles, slots,
configuration validation and compatibility. Whole Minds already own their config, defaults,
faults and factory under `src/core/entrants/`. Components below them still depend on shared
config unions (`src/core/mind/config.ts`) and factory switches, including
`src/core/control/motors.ts` and `src/core/mind/sub-minds.ts`.

Extend registration so a component owns its typed configuration, defaults, validation, factory,
compatibility requirements, explicit state, lifecycle and assets. Adding an implementation of
an existing role should need its own files and registration. Keep the interfaces of locomotion,
recovery, executors, tactics and motor control distinct. Type-check each implementation against
its role and validate stored configurations through its own registration. Add a new role or
shared vocabulary when working implementations require it.

The proposed locations for new implementations and evidence are:

```text
src/core/
  components/
    locomotion/<implementation>/
    recovery/<implementation>/
    attacks/<implementation>/
    guard/<implementation>/
    tactics/<implementation>/
    motor/<implementation>/
  entrants/<fighter>/
  tasks/
assets/
  components/<implementation>/
  entrants/<fighter>/
research/
  experiments/
  results/
  runs/
```

These component and evidence directories are planned additions. Retain existing locations
until moving an implementation helps the work at hand. Contracts can stay in their existing
modules. Registration extends the current catalog and factory paths, without another runtime
or a general plugin framework.

A fighter recipe names its components and their complete configuration. For example, a fighter
may combine a capture-point walk, contact-based recovery, shield cover, sword cut and thrust
actions, tempo tactics and whole-body motor control. Its body, equipment, attributes, assists
and opponents are explicit inputs to the task or match recipe.

Experiments can swap one component while retaining the rest of the assembly. Keep existing
selectable implementations alongside candidates; retirement is a separate owner decision.
Git retains ordinary edit history and unsuccessful unregistered candidates.
A shared improvement can benefit several fighters, and fighters still compete on their
composition and tactics. A component's value is also read on its own tasks and in other
assemblies.

## Remaining participant contracts

Extend the existing boundary only as a concrete implementation requires:

- A second motor implementation can introduce the goal vocabulary it needs. Keep each role's
  interface narrow. Restoring the bearing motor is a separate owner choice, with no requirement
  to add it to establish independent registration.
- Extend gameplay actuation recordings for separate equipment with every accepted grip request
  and other external input that affects physics, its application step and ordering. A recorded
  bout replays with participating Minds disabled under the same construction and configuration.
- When a nondeterministic policy is introduced, distinguish exact physical replay from live
  policy continuation. Keep exact continuation checks for deterministic implementations;
  require explicit state for supported live saves without requiring all future decisions to
  repeat. Prove physical replay from recorded commands for every implementation.
- Specify decision cadence, held actions and work allowance for a slower policy. Introduce
  asynchronous or GPU execution with its first concrete client; define the simulation steps
  at which answers apply and wait for late computation so wall-clock timing does not change
  the bout. Current synchronous controllers need no new scheduling framework.

All implementations retain the same muscle limits, permitted assist ceilings and geometric
grip admission. Task and combat outcomes are read independently of a component's status report.

## Bodies and compatibility

Keep the common observation/action, state, replay and participant lifecycle boundary across
body families. A humanoid and a quadruped may use different gait and recovery algorithms while
sharing physical calculations and task infrastructure.

An implementation declares the structure it needs: support chains, grasping effectors, useful
joint freedoms, available reach, contact geometry or permitted equipment operations. Derive
these from the body's and equipment's physical descriptions wherever possible. Return useful
incompatibility reasons, such as requiring two grasping effectors. A registered part's `fits`
predicate remains a single source of compatibility for construction, pickers and evaluation.

Unsupported composition fails explicitly. Temporary inability during execution is reported
through the role's ordinary feedback. Body-family adapters may expose specialized observations
and goals without making every policy depend on a humanoid `BodyView`.

Use the existing humanoids and reptile to exercise the boundary as it develops. New monsters
bring their own anatomy, effectors, support and down rules, and declared task coverage. Transfer
to a different family is evaluated under those physical conditions. Shared names alone do not
establish that an algorithm works on it.

## Equipment and loadouts

The Arena currently selects one item in each side's right hand (`src/arena/duel.ts`,
`src/core/items/held.ts`, `src/core/models.ts`). Introduce an explicit loadout of item instances
and attachment or grip assignments. Preserve the distinction between a body's anatomy and its
equipment.

Build on `src/core/equipment.ts`, `src/core/mind/equipment-port.ts` and the shared two-hand task
(`src/core/tasks/bar.ts`). An item has persistent identity, physical geometry, mass, inertia,
contact properties and the grips or attachments its mechanics permit. Two hands can act on one
item through coordinated grips. Capture remains geometric, and observed attachments reflect
what the simulation accepted.

Equipment mechanics belong to the shared platform; their use belongs to components:

- A shield intercepts contact through its physical shape; a guard skill positions it.
- A sword's contact surfaces and damage rules are physical inputs; skills select and execute
  cuts, thrusts and parries.
- A two-handed action owns its required controls together. It coordinates the item's grips,
  both arms and whatever trunk or support controls its contract requires.
- A bow introduces draw state, ammunition and projectiles in the equipment/world layer. Skills
  manage drawing, aiming and release; tactics choose targets and opportunities.

Extend the existing resource ownership, interruption and release path
(`src/core/skills/action.ts`, `arbiter.ts`) as these cases require. Locomotion, guard and attacks
must compose without two components commanding the same control. Add abstractions through
concrete items, with their physical load and handling tested before relying on combat results.

## Tasks and capability development

Use shared task builders on the core world, building on `src/core/tasks/environment.ts`.
The headless runner and visible Lab task consume the same task recipe and control interfaces.
The task owns starting conditions and physical scoring independently of a component's phases,
progress labels or claimed success.

| Capability | Task families |
|---|---|
| Recovery | Physically produced falls, orientations and loadouts; acquired support, quiet stability, hand-back and subsequent movement |
| Locomotion | Travel, stopping, turning, lateral/backward movement, disturbances and carrying equipment |
| Attacks | Stationary/moving targets, reach variation, impact, self-injury, balance and return to readiness |
| Defense | Incoming trajectories, protected regions, deflection and recovery after contact |
| Equipment handling | Capture/release, attachment retention, coordinated grips and control under load |
| Tactics | Arena opponents and conditions with specified component assemblies |

Start recovery work from the owner's existing target (`research/rising-bed.mjs --target`) and
the stand-up acceptance screen (`research/stand-up-acceptance.mjs`). Keep their distinct scopes
and report which one a result uses. The unassisted stand-up goal remains separate from assisted
recovery. Build locomotion entry points around the existing task and course work, including
`research/locomotion-run.mjs`.

A component is developed through its task, its interactions with neighboring components, and
then an Arena assembly. Recovery must return a body locomotion can actually use. Locomotion
must accommodate an attack's commitments. A shield guard and the opposite hand's weapon must
share the body coherently. Exercise these transitions through the normal control path.

Use a small permanent reference suite, focused suites for a changed capability or new item/body,
and occasional broader evaluations of representative compatible combinations. Record declared
coverage and unsupported cases. A comparison uses matched conditions within the implementations'
common scope; wider coverage is reported separately.

Fresh validation cases help reveal overfitting even when all code and findings are public.
Version task protocols when their physical conditions or scoring change, and evaluate reference
implementations again before comparing figures. Make fresh falls from physical recipes; saved
physics is an episode checkpoint whose construction identity must still match.

## Cooperative workflow and evidence

Each work item names the question, reference implementation, permitted scope, relevant task
recipes and intended outcome. Successive agents read earlier implementations and findings,
including unsuccessful approaches. A useful assignment can focus on recovery with a club on
the Warrior and Rogue, using the current reference components and demonstrating hand-back to
locomotion.

Use one shared repository. Sequential work can use one checkout. Concurrent agents have
separate branches and checkouts or local worktrees, so edits and tests do not interfere. Sync
committed branches between the laptop and desktop. Extend `AGENTS.md`'s contribution scopes and
`scripts/entrant-check.mjs` when reusable component contributions are introduced. Each component
can own its implementation, assets, registration and focused checks. Shared platform changes
remain separate changes, and unrelated registry entries stay intact.

An experiment recipe and compact result identify:

- The question, reference, candidate and which parts of the assembly change.
- Task/protocol versions, cases or seeds, bodies, loadouts, attributes, assists, sensing,
  decision periods and scoring.
- Code and asset identities, resolved engine configuration and solver artifact revision.
- The author or model and its reused components; when comparing LLM development processes,
  also the prompt, model settings, tools, resource allowance and human interventions.
- Outcomes, supported scope, failures, limitations and representative replay artifacts.

Use versioned machine-readable recipes under `research/experiments/` and compact findings under
`research/results/` when the corresponding runner and reader are added. Keep large recordings,
transcripts and temporary outputs under `research/runs/`. That directory is ignored by Git, so
transfer needed artifacts explicitly between machines and keep their identities in the compact
record. Update existing architecture and roadmap documents as behavior changes; ordinary
features do not require a separate prose study or measurement record.

Cache identity includes the actual controller code/assets, resolved environment and protocol.
A commit plus a generic dirty marker is insufficient. In particular, an engine override or an
updated learned asset must not reuse incompatible results. The runner preserves completed rows,
distinguishes controller faults, timeouts, invalid simulations and infrastructure failures, and
keeps unaffected jobs available to run. Add a watchdog at the worker boundary for evaluations
that execute candidate code. Keep this focused on reliable local work; stronger execution
isolation can be introduced if a concrete need arises.

## Evaluation checkpoints

Development is open and continuously shared. At a checkpoint, freeze the platform and task
protocols, record the selected assemblies, and evaluate references and candidates together.
An ordinary component iteration runs its relevant tasks; a broad tournament is a checkpoint
activity.

Keep three views of progress:

1. Capability results for recovery, locomotion, attacks, defense and equipment handling.
2. Controller comparisons on the same bodies and loadouts, with the changed components named.
3. Open Arena results where different fighters, bodies and equipment compete.

Report results by opponent and condition alongside rankings. A repeat of an identical
deterministic bout verifies execution; fresh conditions and independent development sessions
supply additional evidence about generality and authoring success. When comparing LLMs, record
all development attempts and their budgets, including invalid submissions. The friendly league
can begin before formal model comparisons are useful.

## Order of work

1. **Independent component registration.** Extend the current part/factory system and add small
   working authoring examples. Prove that existing and alternative locomotion or recovery
   implementations can be selected with implementation-local config and validation. Update
   contribution scopes and registration checks alongside this change.
2. **Shared recovery and locomotion entry points.** Expose existing physical protocols through
   reusable recipes and headless/visible runners. Exercise recovery-to-locomotion hand-back,
   retain the owner's stand-up target, and start a component development round.
3. **Explicit multi-item loadouts.** Connect the existing separate-equipment and grip paths to
   gameplay construction, state and recorded-command replay. Develop a concrete additional
   loadout, then expand through shields, swords and two-handed handling as their mechanics are
   ready. Bow mechanics receive their own task when introduced.
4. **Durable experiment results and checkpoints.** Consolidate run identity, compact findings,
   artifact references and fault handling. Evaluate named assemblies under a frozen protocol
   and preserve useful references for later authors.
5. **Broader body and equipment coverage.** Add task cases and family-specific components as
   content arrives. Reuse successful components where they fit and measure transfer explicitly.

These steps land in small, independently useful changes. Pilot work can start with existing
bodies, components and tasks while equipment and body extensions proceed.

Use the normal checks in `AGENTS.md`. Software gates protect execution, boundaries, lifecycle
and replay. Capability and competition claims use their relevant tasks and comparisons; retain
failures and the conditions needed to reproduce them. This plan establishes organization and
interfaces, and makes no claim that the unfinished stand-up or other capability goals are met.
