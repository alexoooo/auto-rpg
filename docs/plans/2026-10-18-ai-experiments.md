# AI experiments on shared bodies

Make it easy to run different Minds, skills and motor controllers on the game's physical bodies,
against one another in the Arena, the Dungeon and future modes. An experiment can replace one
part or the whole control stack. Hand-built rules, search and learned policies are all valid
implementations. What runs in the game runs in the browser; training can happen offline.

The [whole-body controller plan](2026-10-17-general-controller.md) continues with its existing
gates. It develops one reusable execution stack. The options fighter is one client of that stack;
neither that Mind nor that solver is mandatory for every experiment.

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
  explicit saved state, including random streams, policy memory and solver history that affects
  later commands. Scratch work carries no history. Sense the world before policies act, applying
  each policy's declared observation restrictions; another Mind's private state is never sensed.

Build on the existing Mind registry (`src/core/mind/controllers.ts`), skill lifecycle and
ownership (`src/core/skills/arbiter.ts`), motion tasks (`src/core/control/tasks.ts`), detached
policy host (`src/core/mind/direct.ts`) and seeded environment (`src/core/tasks/environment.ts`).
Use explicit factories and configuration; extend these modules only as a concrete experiment
requires. Keep one path for stepping, applying commands, saving and disposing a participant.

## Execution

CPU and GPU implementations are in scope. A trusted host schedules asynchronous work from a
declared observation step and delivers prepared, checked commands at declared action steps.
`World.step` keeps synchronous control application and physics. Define late-result handling and
save/restore of pending work explicitly. Backend support must not change an entrant's permitted
observations or physical authority.

Record accepted commands with their simulation steps for action replay. Distinguish that replay
from re-executing the policy: GPU numerical results are not assumed bit-identical across devices.
Declare the backend and reproducibility guarantees. GPU support requires an explicit host and
replay path while preserving deterministic physics and the existing exact execution path.

Reuse existing performance targets and experiment-specific work limits. A comparison states its
computation allowance, hardware/backend and decision periods for each entrant; cadence and
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
starting conditions, declared execution allowance/backend, code and engine revisions and any
learned-weight asset. Use the same control and simulation interfaces headlessly and in the page;
backend availability and reproducibility are explicit. Save/restore includes the scenario and
all participants as well as physics.

Keep scenario objectives and scoring independent of the controller. For comparisons, state what
changed and hold the remaining conditions fixed. Report failures and results against individual
opponents alongside any aggregate ranking. Reproducibility and software checks establish that
an experiment runs correctly; capability and fighting strength require their own evaluation.

## Order of work

1. Establish the common participant boundary with existing implementations that use different
   execution paths, including a composed fighter and a direct policy. Reuse their lifecycle and
   validation. Continue the whole-body controller work alongside this.
2. Exercise independent configuration in a short Arena bout and a small Dungeon encounter.
   Check restoration, feedback, interruption and rejection of unsupported compositions. This
   does not depend on completing every gait or recovery technique.
3. For each skill or motor-control boundary an experiment needs, exercise two distinct
   implementations against it. Add a compatible implementation through its module, configuration
   and registration, without changing game modes or unrelated algorithms. Extend the contract
   only when a real shared requirement is missing. Keep a working default for comparison.

Land small changes under the repository's normal checks. Run the relevant scenario tests when
changing their paths; use measurements when evaluating a capability, strength or performance
claim. Existing acceptance criteria, including frozen stand-up acceptance, remain unchanged.
The [testing strategy plan](2026-10-18-testing-strategy.md) covers verification policy and migration
of the existing suite; the current repository gates apply until those changes land.
