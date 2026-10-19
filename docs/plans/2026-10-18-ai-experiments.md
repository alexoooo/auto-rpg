# AI experiments on shared bodies

A testbed where many authors, people or AI agents, develop competing Minds over time and run
them on the game's physical bodies against one another, in the Arena, the Dungeon and future
modes. Adding a Mind is a folder and a line in the registry, and touches no game mode and no
other Mind. An experiment can replace one part or the whole control stack. Hand-built rules,
search and learned policies are all valid implementations. What runs in the game runs in the
browser; training can happen offline.

The [whole-body controller plan](2026-10-17-general-controller.md) continues with its existing
gates. It develops one reusable execution stack. The options fighter is one client of that stack;
neither that Mind nor that solver is mandatory for every experiment.

## The contract

Every Mind, the game's own included, meets the world through one boundary, on the same terms.

- **What it is given once**: its body's fixed description (segments and joints, masses and
  inertia, joint ranges, muscle strengths and speeds, what it holds), its own config, and what its
  fight grants it (its assist's ceiling, grip and hand-pose ports, a script).
- **What it reads each step: the report.** A detached copy, made by the game: its own body whole
  (every joint's angle, rate and effort, every segment's position, turn, velocity and spin, every
  contact it makes with its impulse, its hand poses, its assist's meter); other bodies as anyone
  watching would see them (each segment's pose and motion, the centre and its velocity, whether
  down or out, what it is built from and holds); the solids and objects its fight grants; the
  clock; its orders. Never another Mind's memory, orders or command, nor anyone's hit points.
- **What it returns each step: the order sheet.** Muscle activations and speeds, its assist's
  ask, grips and hand poses. The game checks it (muscle bounds, the assist's ceiling, geometric
  capture for a grip) and applies it. Nothing else a Mind does reaches the physics.
- **What it may report back**: a status for screens and tests (what it is doing, an ask it
  cannot meet, whether it holds the body), never read by the rules.
- **How that is held**: a Mind's factory is never given the world, the built body or an engine
  handle, and a source rule in `npm test` refuses an import of the engine, the build, the world or
  Rapier, and `globalThis`, from a Mind's folder or the shared toolkit. That stops drift and
  copied code, not a determined cheat: every Mind runs in one JavaScript process. A Mind in its own
  worker is built only if deliberate exploitation appears.
- **What is open by choice**: other bodies are seen exactly, all the way round and through walls,
  with the senses' delay (`createSenses`) the one handicap. A field of view, noise or a longer
  delay is one change in the senses layer, for every Mind at once, made when a comparison needs it.
  Computation per step is not capped; a comparison states each entrant's allowance.

The game's skills, motor control, sub-minds and the options fighter are a **toolkit** under the
same rule: they read the report and write the order sheet, so a Mind may use any of them or none,
and a learned or searched skill stands in for a hand-built one on equal terms.

**Adding a Mind**: a folder of its own under `src/core/entrants/`, holding its factory, its config
type with its faults, and its presets; one entry in the registry. Its config is plain data the
registry validates through the entrant's own faults; no shared union names it. Every registered
Mind passes one contract test in `npm test` (below); a league or capability reading is a
measurement, not a gate.

## Structure

Four responsibilities describe the usual stack:

| Part | Responsibility |
|---|---|
| Mind | Choose intentions from observations, objectives and execution feedback. |
| Skills and planners | Carry an intention out over time: choose steps, trajectories, contact sequences and other motion goals. |
| Motor controller | Turn motion goals into bounded muscle and permitted assist commands. |
| Physics | Apply actuation and determine the actual motion, contacts and collisions. |

These are conceptual responsibilities, not four mandatory runtime classes. Compose ordinary
modules behind the existing participant lifecycle and checked actuation boundary. A direct Mind
can replace skills and motor control together. It still uses the same physical limits, permitted
actions, world step and state handling.
An entrant may replace everything above that actuation boundary through an implementation factory
and explicit configuration. Use the existing Mind registry; registration does not restrict the
algorithm or require the options fighter, named skills or the whole-body solver.

A tactical experiment can hold skills and motor control fixed; a skill experiment can hold its
Mind and motor control fixed; a controller experiment can hold motion goals fixed. Record
which boundary changes. Each boundary has its own small typed vocabulary; avoid one command
object containing every algorithm's settings. Add a shared abstraction when distinct working
implementations need it.

## Rules for shared code

- **Keep algorithms local.** Shared orchestration does not choose behaviour through special
  cases for a model, item, mode, opponent or seed. Describe bodies and items through physical
  data and capabilities. Hand-authored skills, learned policies and tuned parameters belong to
  their implementation and explicit configuration. Defaults remain separate from contracts.
- **Make compatibility explicit.** Each implementation declares what commands and capabilities
  it needs. Reject unsupported compositions when building them. Report temporary inability
  during execution. No silent substitution of another controller. A skill can support a limited
  family of bodies or loadouts without making the framework specific to that family.
- **Keep authority at the boundary.** Policies read detached observations and return checked
  commands; engine handles stay with trusted adapters. Physical limits, assist ceilings and grip
  permissions apply to every implementation. Inputs include permitted motion and contact readings
  and immutable physical-model data: geometry, joint structure, masses, inertia and actuator limits.
  Threat estimates and preferred actions belong to the Mind, not the observation contract.
  Optional dynamics queries or prediction use only that permitted information, never privileged
  live-world state. Describe inputs and motion goals with explicit frames and units.
- **Return useful feedback.** Commands go down; capabilities, execution status and reasons an ask
  could not be met come back up. Define skill ownership and interruption, and task priorities
  and error scaling. Observed contacts differ from requested support. Physical success is judged
  from the resulting observations, independently of a controller's claimed completion.
- **Own time and state.** Physics advances only through `World.step`. Define decision periods,
  held commands and idle/resume behaviour. Each participant owns immutable configuration and
  explicit memory for supported live save/resume, including policy memory and solver history.
  Restoring a Mind need not reproduce its future decisions. Scratch work carries no history.
  Sense the world before policies act, applying each policy's declared observation restrictions;
  another Mind's private state is never sensed.

Build on the existing Mind registry (`src/core/mind/controllers.ts`), skill lifecycle and
ownership (`src/core/skills/arbiter.ts`), motion tasks (`src/core/control/tasks.ts`), detached
policy host (`src/core/mind/direct.ts`) and seeded environment (`src/core/tasks/environment.ts`).
Use explicit factories and configuration; extend these modules only as a concrete experiment
requires. Keep one path for stepping, applying commands, saving and disposing a participant.

## Execution

Minds run synchronously within `World.step`, as today. Asynchronous or GPU execution is not
planned; it is built when a concrete experiment needs it. Every Mind in the game today is
deterministic, and the checks that rely on that stay: a bout played twice, a forked bout, a bout
replayed from its recipe and orders tape (`Duel.tape`, `src/arena/duel.ts`).

Deterministic replay is a simulation guarantee. AI decision-making may be nondeterministic;
repeatable inference is not a condition of entry. Record commands losslessly at the
final actuation boundary, with their application steps and ordering, plus other external inputs
that affect the simulation. Include muscle commands, permitted assists, grips and hand poses.
An orders-only tape cannot reproduce nondeterministic downstream control.

Replay uses the recorded inputs and matching initial state, rules and physics configuration,
without executing the participating Minds. Test that the resulting physical state agrees exactly.
Simulation rules must not depend on unrecorded private policy state.
Replay checkpoints need simulation state and the recording position; restoring AI execution is
a separate live-continuation capability. Re-running a Mind can produce a different bout. Preserve
deterministic physics and existing exact implementations without requiring exact AI computation.

Reuse existing performance targets and experiment-specific work limits. A comparison states its
computation allowance, hardware and decision periods for each entrant; cadence and
episode duration alone do not bound computation. Add enforcement as an experiment requires,
without building a separate budget framework in advance.

## Modes and comparisons

Modes supply the scenario, permitted observations, objectives, participants and rules through
the same core interfaces. They do not require a particular Mind's internal structure. Navigation
and target selection are also choices an experiment can replace, with their inputs and authority
made explicit.

Select each participant's Mind, skills and controller independently, including Dungeon enemies
and actors with the same body model. A player character and AI enemies are sufficient for the
Dungeon. Companion following, party selection, formations and group orders are outside this
work. Removing existing party features is a separate task.

An experiment recipe identifies the scenario and seeds, each participant's implementation and
configuration, bodies, loadouts, attributes, assists, rules, observations, decision periods,
starting conditions, declared computation allowance, code and engine revisions and any
learned-weight asset. Use the same control and simulation interfaces headlessly and in the page.
Distinguish simulation replay checkpoints from live saves that also restore supported policy
memory.

Keep scenario objectives and scoring independent of the controller. For comparisons, state what
changed and hold the remaining conditions fixed. Report failures and results against individual
opponents alongside any aggregate ranking. Software checks protect execution and recorded-action
replay; capability and fighting strength require their own evaluation, with repeated trials
where decision-making varies.

## Where things stand

The contract above is not yet the code's:

- Only the joint-feedback Mind (`createPolicyBody`, `src/core/mind/direct.ts`) meets the world
  through the report and the order sheet. Every game Mind is made by `embody`
  (`src/core/mind/mind.ts`) with the whole `BuiltBody` and the `World`, and its skills, sub-minds
  and motor control read live engine bodies (for example `skills/hold.ts`, `whole-body-strike.ts`,
  `ground/plant-up.ts`, `rise/staged.ts`, `ground/reading.ts`); the engine body also takes
  impulses, forces and mass changes. The order sheet (`BodyAction`) has no assist ask: the toolkit
  asks `Assist` directly.
- Adding a kind of Mind means editing `MindConfig` and `Minded` (`src/core/mind/config.ts`,
  `minds.ts`); the Arena, the Dungeon and the Lab read a fighter's skills through
  `kind === "fighter"`.
- Recorded replay is of orders (`Duel.tape`) and re-runs the Minds; nothing records the order
  sheets.
- Within the stack, the options fighter chooses its skills by boolean tuning flags, not by
  composition (`tuning` in `OptionsConfig`, one memoised kit map a flag in
  `src/core/mind/options/mind.ts`); motor control is one `motorControl` made inside `commandMind`
  (`src/core/body.ts`), with the whole-body solve a flag beside it; skills ask motor control through
  one `BodyCommand` holding every kind of goal.
- The Dungeon chooses a party member's Mind by its body's model and an enemy's from the map.

## Order of work

Each stage lands in small commits under the normal checks; a stage that claims to change no
behaviour is held to the fingerprint (`scripts/fingerprint.mjs`).

1. **One boundary.** The report gains what the toolkit reads (segment poses and motion already
   there; the fixed description with masses and inertia; the dynamics a controller asks, computed
   from the report and the description); the order sheet gains the assist's ask. Every
   controller's factory is given the description, config and fight's grants, never the world or
   the built body. The toolkit reads the report; `embody`'s raw path stays inside the adapter. The
   source rule lands with it, over the toolkit and `src/core/entrants/`.
2. **Recorded order sheets.** Every body's checked order sheet is recorded at the boundary with
   its step; a bout replays from its recipe and that record with every Mind disabled, its
   physical state equal to the bit. One contract test runs over every registered Mind: a short
   bout runs and stays finite, flings nobody, replays exactly from its record, and forks and
   resumes.
3. **The registry by folder.** A Mind's kind, config and faults live in its folder; `MindConfig`
   and `Minded` stop naming kinds; a common status replaces the `kind === "fighter"` reads; the
   joint-feedback Mind moves to `src/core/entrants/` as the first entrant written that way, with a
   short guide for authors in `docs/architecture.md`.
4. **Composition in the stack.** The options fighter's skills become slots filled from
   registered implementations, each declaring what it needs, a composition that cannot work refused
   when built; the tuning flags and their kit maps go, each flag an implementation.
5. **Motor control as a part.** `BodyCommand` splits into each kind of goal's own vocabulary, and
   the motor controller is chosen as a part: the bearing solve and the whole-body solve are its
   first two implementations.
6. **The Dungeon by participant.** Each participant's Mind is chosen on its own, enemies
   included.

Land small changes under the repository's normal checks. Run the relevant scenario tests when
changing their paths; use measurements when evaluating a capability, strength or performance
claim.
`AGENTS.md` (Tests) says what the gate holds and how a controller is compared.
