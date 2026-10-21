# The framework: layers, components, and a fast cycle

## Goal

A general, clean and simple testbed for AI-controlled bodies, built into a game. The project
moves forward by advancing every layer of it: the framework, the controllers, the skills
(locomotion, stand-up, strikes and holds), the tactics that choose among them, and the command
of teams. People and LLM agents, on more than one machine, build on one another's work.

No plan is tied to one mind or one implementation without a reason. A layer names its tasks,
its evaluations and the reference it is read against, and any implementation may advance it.
Which implementation is a default follows from its readings, never from a plan.

## The layers and their plans

| Layer | What it holds | Plan |
|---|---|---|
| Framework: parts | Roles, registration, compatibility, contribution | This plan |
| Framework: evaluation | Evaluations, kept records, the paired report, the Ratings screen | [Ratings](2026-10-21-ratings.md) |
| Framework: data | Mind data loaded per use, packed per kind | [Mind data](2026-10-21-mind-data.md) |
| Capabilities | Locomotion, recovery, strikes and holds, assists | [Capabilities](2026-10-21-capabilities.md) |
| Movement and command | One movement pipeline; Commanders over teams | [Movement and command](2026-10-21-movement-and-command.md) |
| Tactics | What a fighter decides, and what a player may choose of it | [Tactics](2026-10-21-tactics.md) |

What is built is in the [architecture](../architecture.md); standing rules are in `AGENTS.md`.

## The cycle

Every layer moves by the same cycle:

1. Pick one question in the layer and the evaluation that answers it: a task's battery, or a
   contest against a panel.
2. Change one implementation, or add one beside it. Existing selectable implementations stay.
3. Read the paired report against the previous version (Ratings, step 5), within its budget.
4. Keep the change, or keep the record of why not. Land it under the normal gate.

A layer's work does not wait for another's. It runs on the platform as it is, and its report
names the pool it was read in.

## Compute: nothing long, nothing thrown away

The plans exist to replace long runs whose results were discarded (full tournaments,
re-calibrations, batteries read again for their own sake) with a cycle of minutes.

- **Every run states its expected wall time first**, from a rate measured on the machine that
  runs it. The 10-hour tournament played about 19 bouts a minute on the desktop, so a paired
  report against a panel of eight, on four conditions and both sides, is 64 bouts: about
  3.5 minutes, twice that if the previous version plays again in a new pool.
- **An iteration's evaluation fits in about 10 minutes.** It stops when its answer is clear
  (`--until settled`); an inconclusive answer at the budget is a result.
- **Nothing runs over an hour without the owner's go-ahead**, given for that run.
- **What is played is kept.** Every case is a row kept by its key, and reused while its code is
  unchanged. Nothing is played only to be summarised and discarded.
- **No step of any plan re-rates the field or re-calibrates for its own sake.** A figure is read
  again only when a question needs it, and only the cases that question needs.
- **Screen small, confirm large.** A candidate runs a small subset of its task first (a few
  falls, one body, one loadout), and the full target only when the screen passes.
- **Nothing is measured at length just before a change that moves it.** Movement's Part A moves
  every bout, so no panel, cap or long reading is chosen before it lands.
- **Durable rows come from separate code.** While an implementation lives in the toolkit, any
  toolkit change makes its cases play again. Moving it into a folder of its own (below) is what
  lets its rows survive unrelated changes (Ratings, step 12).

## Order across the plans

1. **Now, cheap and independent:** Ratings step 1 (secure the 10-hour rows); Mind data
   chunks 0 and 1; Movement A0.
2. **Movement A1 to A4**, beside Ratings steps 2 and 3, which change no behaviour.
3. **Ratings steps 4 to 6**, on bouts played after Part A: the import, the paired report, the
   margin and the cap.
4. **Then, in parallel:** Movement B0 to B2; Ratings steps 7 and 8; registration (below);
   capability and tactics work through the paired report.
5. **As needed:** the remaining steps of Ratings, Mind data and Movement.

## Components

The part system (`src/core/mind/parts.ts`, `catalog.ts`) supplies roles, slots, validation and
compatibility. Whole Minds own their config, defaults, faults and factory under
`src/core/entrants/`. Below them, implementations still sit in shared config unions
(`src/core/mind/config.ts`) and factory switches.

An implementation of a role owns its typed config, defaults, validation, factory, `fits`,
explicit state, lifecycle and assets. Adding one is its own files and one registration line.
Role interfaces stay narrow and distinct. No plugin framework and no second runtime: the
catalogue and the factories are extended where they are.

Registration moves the switches in this order, each its own toolkit change with the fingerprint
unmoved:

1. **Locomotion** (`legsOf` and `runsOf`, `src/core/mind/fighter.ts`): seven kinds, and the
   layer most worked on.
2. **Recovery and other sub-minds** (`src/core/mind/sub-minds.ts`): six kinds.
3. **Executors** (`ExecutorConfig`).
4. **Motor control** (`src/core/control/motors.ts`): one kind; a second motor brings the goal
   vocabulary it needs.

An implementation moves into `src/core/components/<role>/<implementation>/`, with its data under
`assets/components/<implementation>/`, when work on it would gain from durable rows, not before.
`AGENTS.md`'s contribution scopes and `scripts/entrant-check.mjs` learn the component scope with
the first move.

New roles join the same way when a working implementation needs them: the Commander and the
gait's limits (Movement, B0 and A0).

## Tasks

A task is physical conditions, observations and independent scoring, built on the core world
(`src/core/tasks/`). There is one notion of a task: an evaluation's case module (Ratings) plays a
core task where one exists, the Lab shows the same task, and the Ratings screen opens its cases.
A task's score never reads a component's own report of success.

## Bodies and equipment

An implementation declares the structure it needs (support chains, grasping effectors, reach,
contact geometry, equipment operations), derived from the body's and the items' descriptions
where possible, through its `fits`. An unsupported composition fails with its reason; a temporary
inability is reported through the role's ordinary feedback. The humanoids and the reptile
exercise the boundary; a new body family or item brings its own tasks. A shared name does not
show that an algorithm works on another family; its tasks there do.

Equipment mechanics are the platform's; components choose and carry out their use. Armour,
two-handed items and bows come through concrete items and their tasks, building on
`src/core/equipment.ts`, `src/core/mind/equipment-port.ts` and `src/core/tasks/bar.ts`.

## Participant contracts

Extended only when a concrete implementation needs it:

- Recorded actuation carries every accepted grip request and other external input with its
  step and order, so a bout replays with its Minds disabled.
- A nondeterministic policy separates exact physical replay (from recorded commands, for every
  implementation) from live continuation (explicit state, not identical future choices).
- A slower policy states its cadence, held actions and work allowance; asynchronous or GPU
  execution comes with its first client, and waits for late answers so wall time never changes
  a bout.

Every implementation keeps the same muscle limits, assist ceilings and geometric grip admission.

## Done when

- Locomotion, recovery, executors and motors are registered implementations, each added by its
  own files and one line.
- An implementation in a folder of its own keeps its evaluation rows through unrelated changes.
- Each layer's plan names its tasks, evaluations and references, with no tie to one mind.
