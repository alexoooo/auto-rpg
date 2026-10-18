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
  permissions apply to every implementation. Higher layers can read capability estimates.
  Describe motion with named frames, points, orientations and units, including coordinated grips.
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
code and engine revisions and any learned-weight asset. Use the same execution path headlessly
and in the page. Save/restore includes the scenario and all participants as well as physics.

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
