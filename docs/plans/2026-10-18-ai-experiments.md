# AI experiments on shared bodies

Make it easy to run different Minds, skills and motor controllers on the game's physical bodies,
against one another in the Arena, the Dungeon and future modes. An experiment can replace one
part or the whole control stack. Hand-built rules, search and learned policies are all valid
implementations. What runs in the game runs in the browser; training can happen offline.

The [whole-body controller plan](2026-10-17-general-controller.md) continues with its existing
gates. It develops one reusable execution stack. The options fighter is one client of that stack;
neither that Mind nor that solver is mandatory for every experiment.

## Replaceable parts

Keep small, explicit contracts at the useful boundaries:

| Part | Responsibility |
|---|---|
| Mind | Choose intentions from observations, objectives and execution feedback. |
| Skills and planners | Carry an intention out over time: choose steps, trajectories, contact sequences and other motion goals. |
| Motor controller | Turn motion goals into bounded muscle and permitted assist commands. |
| Direct policy | Replace the skills and motor controller through checked actuator commands. |

A tactical experiment can keep the skills and motor controller fixed. A skill experiment can
keep the Mind and motor controller fixed. A controller experiment can keep the requested motion
fixed. A complete replacement can use the direct policy boundary. Record which boundary an
experiment uses.

Each implementation declares the bodies, capabilities and command types it supports; reject an
incompatible combination clearly. Build reusable parts where they help, without requiring every
skill to work on every morphology or loadout. Separate defaults from the contracts they use.

## Commands and feedback

- Policies read detached observations and permitted capabilities, and return checked commands.
  Engine handles stay with trusted body and controller adapters. Another Mind's memory, goals
  and future commands are never observations.
- Commands go down; capabilities and execution feedback come back up. Report what is running,
  progress, completion, interruption and why an ask could not be met. Planners must be able to
  respond to unavailable force, reach or support instead of continuing an impossible plan.
- Physical limits and assist ceilings are enforced at actuation. Higher layers can read their
  effects when planning; stronger or faster actuators alone do not produce a better plan.
- Define ownership and interruption for competing skills. A task controller defines its
  priorities and how it scales errors before weighing them. Observed contacts and requested
  support are separate: requesting a contact cannot create one.
- Describe motion through physical frames, points, orientations and permitted grips. An item
  contributes geometry, mass and inertia; coordinated hands and changing grips can add
  constraints. Reuse those descriptions across loadouts.
- Each participant owns its state and immutable configuration. Include policy memory, random
  streams, action lifecycles and any solver history that affects the next command in saved
  state. Keep scratch work separate.
- Physics advances only through `World.step`. Decision periods are explicit simulation-step
  counts; define held commands, interruption and idle/resume behaviour at each boundary.

Build on the existing Mind registry (`src/core/mind/controllers.ts`), skill lifecycle and
ownership (`src/core/skills/arbiter.ts`), motion tasks (`src/core/control/tasks.ts`), detached
policy host (`src/core/mind/direct.ts`) and seeded environment (`src/core/tasks/environment.ts`).
Extend these contracts as an experiment needs them, keeping algorithm choices behind them.

## Modes and comparisons

Modes supply the scenario, permitted observations, objectives, participants and rules through
the same core interfaces. They do not require a particular Mind's internal structure. Navigation
and target selection are also choices an experiment can replace, with their inputs and authority
made explicit.

Select each participant's Mind, skills and controller independently, including Dungeon enemies
and actors with the same body model. A player character and AI enemies are sufficient for the
Dungeon. Companion following, party selection, formations and group orders are outside this
work; this plan neither develops nor removes those existing features.

An experiment recipe identifies the scenario and seeds, each participant's implementation and
configuration, bodies, loadouts, attributes, assists, rules, observations, decision periods,
engine revision and any learned-weight asset. Use the same execution path headlessly and in
the page. Save/restore includes the scenario and all participants as well as physics.

Keep scenario objectives and scoring independent of the controller. For comparisons, state what
changed and hold the remaining conditions fixed. Report failures and results against individual
opponents alongside any aggregate ranking. Reproducibility and software checks establish that
an experiment runs correctly; capability and fighting strength require their own evaluation.

## Order of work

1. Use two existing Minds to establish the smallest shared observation, command and feedback
   contracts. Allow each to select compatible skills and motor control without changing the
   scenario or the other participant. Continue the whole-body controller work alongside this.
2. Prove the complete path in a short Arena bout and a small Dungeon encounter with independently
   configured enemies. Check state restoration, feedback, interruption and refusal of unsupported
   combinations. This does not depend on completing every gait or recovery technique.
3. Add experiments at the skill, motion-task and direct-actuator boundaries as they are needed.
   Reuse fixtures and opponents to isolate what each replacement changes. Keep a working default
   and explicit comparison configurations as implementations evolve.

Land small changes under the repository's normal checks. Run the relevant scenario tests when
changing their paths; use measurements when evaluating a capability, strength or performance
claim. Existing acceptance criteria, including frozen stand-up acceptance, remain unchanged.
