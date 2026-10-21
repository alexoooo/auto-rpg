# Component registration

## Why

A Mind is assembled from implementations of roles: locomotion, recovery, executors, motor control
and, with [Movement and command](2026-10-21-movement-and-command.md), the Commander. Adding an
implementation today means editing shared config unions (`src/core/mind/config.ts`) and factory
switches, so every new gait or recovery is a toolkit change. Registration makes adding one its own
files and one line, and lets an implementation live in a folder of its own, which is what lets
[Ratings](2026-10-21-ratings.md) keep its evaluation rows through unrelated changes (its step 12).

## Where it starts

The part system (`src/core/mind/parts.ts`, `catalog.ts`) supplies roles, slots, validation and
compatibility. Whole Minds already own their config, defaults, faults and factory under
`src/core/entrants/`. Below them, implementations are cases of shared unions and switches:

- locomotion: `legsOf` and `runsOf` (`src/core/mind/fighter.ts`), seven kinds;
- recovery and the other sub-minds: `src/core/mind/sub-minds.ts`, six kinds;
- executors: `ExecutorConfig` (`src/core/mind/config.ts`) and their factory;
- motor control: `src/core/control/motors.ts`, one kind.

## Design

An implementation of a role owns its typed config, defaults, validation, factory, `fits`, explicit
state, lifecycle and assets. Its role's interface stays narrow and distinct from the others'. The
catalogue and the factories are extended where they are: no plugin framework and no second
runtime. A registered part's `fits` stays the one source of compatibility for construction, the
pickers and evaluation, and returns a reason when it refuses (for example, two grasping effectors
needed).

## Steps

Each is a toolkit change of its own, with the fingerprint unmoved:

1. **Locomotion.** The seven kinds register. The gait's limits (top speed by direction, stopping
   deceleration) join the locomotion role's interface when Movement's A0 needs them.
2. **Recovery and the other sub-minds.**
3. **Executors.**
4. **Motor control.** A second motor brings the goal vocabulary it needs.
5. **The Commander** registers as a role when Movement's B0 builds it.

An implementation moves into `src/core/components/<role>/<implementation>/`, with its data under
`assets/components/<implementation>/`, when work on it would gain from durable rows, not before.
With the first move, `AGENTS.md`'s contribution scopes and `scripts/entrant-check.mjs` learn the
component scope.

## Checks

The normal gate, the fingerprint unmoved at each step, and a test that each role's registered
implementations validate their stored configs through their own registration.

## Done when

Locomotion, recovery, executors and motors are registered implementations, each added by its own
files and one line, and an implementation in a folder of its own keeps its evaluation rows through
unrelated changes. The roadmap's Order then drops this plan, and this file is deleted.

## Relations

- [Movement and command](2026-10-21-movement-and-command.md): its A0 adds the gait's limits to the
  locomotion role (step 1), and its B0 builds the Commander role (step 5).
- [Ratings](2026-10-21-ratings.md): an implementation's own folder is what its step 12 cuts out of
  the environment, so its rows outlive unrelated changes.
