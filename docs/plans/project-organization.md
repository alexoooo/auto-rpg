# Project organization and entrant packages

## Problem

The source tree is not organized by responsibility, ownership or runtime. `src/core/` holds
foundations beside skill implementations, the Option Mind framework and one skill's private caches:
the staged rise's `RiseTables` sits beside world stepping and arithmetic. Runtime-neutral
simulation code also lives outside core, mixed with rendering in `src/arena/`, `src/dungeon/` and
`src/lab/`, and is found only by tracing imports from a list of builders. A path tells a reader
neither what a module is for, who owns it, what may depend on it, nor where it can run.

## Goal

A reader identifies a concept's implementation, its public contracts, the mechanisms it shares and
the applications that compose it from paths alone. An agent develops a new fighter idea within its
own entrant package.

This work changes organization and extension boundaries. Simulation behavior and the meaning of
existing configurations and data are preserved. Skill training and fighter improvements are
separate work. The [architecture](../architecture.md) describes the implemented structure; this plan
defines the target.

## Ownership and responsibility

Responsibility determines the main hierarchy. Each implementation owns its internal algorithms,
parameters and caches; a module used by one implementation lives under it. Shared code belongs to
the narrowest common scope of its consumers. Similar code alone does not justify an abstraction.

| Responsibility | Owns |
| --- | --- |
| Core | physical foundations: arithmetic, physics, body descriptions, muscles, the world's fixed step and state |
| Parts | the registration contract every layer uses: `Part`, catalogs, scoped kinds |
| Combat | blows, their energy and its sharing, wounds, life and the rulebook |
| Control | reusable mechanisms that turn motion and support goals into muscle commands |
| Skills | skill contracts and reusable implementations, grouped by capability |
| Minds | mind contracts and reusable decision-making frameworks and components |
| Game | Arena and dungeon gameplay, enlisting a fighter, levels, world construction |
| Evaluation | cases, readings, comparisons and evaluation orchestration |
| Entrants | independently developed fighters and everything specific to their ideas |
| Application | catalogs, entry points and composition of concrete implementations |

Public entry points identify what consumers may depend on; implementation modules remain private
to their package. Assets, tests and research tools mirror the same ownership paths under their own
roots (`assets/`, `tests/`, `scripts/`).

```text
src/
  core/        math/ physics/ bodies/ world/
  parts/
  combat/
  control/
  skills/      recovery/ locomotion/ strikes/ ...
  minds/       option/
  game/        arena/ dungeon/
  evaluation/
  entrants/    option/ walker/ bare/
  app/
```

Placements that are not obvious from the table:

| Today | Target |
| --- | --- |
| `core/rules/` except `levels.ts`, `core/touches.ts` | `combat/` |
| `core/rules/levels.ts`, `core/combatant.ts` (`enlist`) | `game/` |
| `core/mind/mind.ts` (`OwnBody`), `core/mind/senses.ts` | `core/bodies/`: control reads them |
| `core/control/assist.ts` | `core/bodies/`: an actuator the rulebook caps |
| `core/toolkit.ts` | `app/` |
| `core/option/` | `minds/option/`; the Option entrant's choice of Options stays in its package |
| `core/recovery/`, `core/navigation/` | `skills/recovery/`, `skills/locomotion/` |
| `assets/core/<skill>.json` | `assets/skills/<capability>/<implementation>/` |

Step 1 of the migration places every remaining directory.

## Runtime

Every module outside a `node/` or `browser/` directory is runtime-neutral, including its transitive
dependencies, and is checked as such by its path. Node adapters own filesystem access, CLI
integration and Node workers; browser adapters own DOM input and rendering. Both use the same
runtime-neutral simulation, gameplay and fighters. `src/arena/`, `src/dungeon/` and `src/lab/`
split into their runtime-neutral part and a `browser/` part.

## Competing skill implementations

A capability such as standing up admits several implementations, and several can apply to the same
body and situation. Each declares its applicability and entry conditions and provides the
performance information its consumer uses. Its recipes, control rules, tuning schema and caches
live under it: `RiseTables` lives under the staged rise. Recovery logic shared by several
implementations lives in `skills/recovery/`; a motor mechanism other capabilities use lives in
`control/`. No implementation imports another's internals.

Generic skill and mind wiring receives implementations through registration. Applicability and
Option selection decide which a fighter uses.

## Entrant packages

An entrant is a package with a public, runtime-neutral manifest and a private implementation,
registered by a line in the application catalog. Configuration is plain data naming registered
kinds; executable factories live in the package. The standard fighter uses the same contracts as
every other entrant.

A skill implementation's per-body records belong to that implementation. An entrant owns its
presets, its choice of Options and their settings, and anything trained only for its own design.

An entrant customizes by configuring registered components, by registering its own component of a
role (an Option, a chooser, a value model), or by supplying its own kind of Mind. A component
receives its inputs through its contract; a new idea needs no experiment-specific flag in shared
code.

## Dependency rules

- A layer imports only those before it: core, parts, combat, control, skills, minds, then game and
  evaluation. Minds read combat (a value model prices damage); combat never reads minds.
- Application composition knows concrete entrants, skills and mind frameworks; game and evaluation
  receive them through the catalog.
- Shared libraries never import entrants. An entrant imports published library APIs and itself,
  never another entrant. A mechanism two entrants share moves into a library.
- A capability's shared modules never import its implementations.

`tests/core-boundary.test.mjs` extends its `LAYERS` from core to all of `src/`, and its runtime
check from a list of builders to paths. The architecture documents the permitted directions, public
entry points and composition roots.

## Migration

1. Place every directory. Write the layer and runtime checks against the target, reporting only.
   Re-key stored evaluation rows when a slice moves modules: a case's code
   (`caseCoder`) hashes module paths and contents, so a move changes it; a slice whose fingerprint
   is unchanged maps old codes to new ones instead of replaying.
2. Recovery: each implementation owns its internals; shared recovery logic is identified; generic
   wiring receives implementations by registration. Its records, tests and tools move with it.
3. Separate the Option Mind framework from fighter assemblies; package each entrant behind its
   manifest and compose them in the application catalog.
4. The remaining skills, minds, combat, gameplay and evaluation; worker and page entry points use
   the shared composition with their own adapters.

Each slice updates with it the checks, the architecture, AGENTS.md, and the paths tooling names
(`CUTS` in `scripts/build-identity.mjs`, `entrantOf` and `REGISTRIES` in
`scripts/entrant-check.mjs`). Kind names, preset identifiers and data keys are preserved; obsolete
paths are removed once their callers move. Each slice lands on its own under
[the repository's checks](../../AGENTS.md#doing-the-work) with the fingerprint unchanged. Structural
work stays separate from tuning and performance changes.

## Acceptance

- Paths show responsibility, ownership and runtime; the layer check covers all of `src/` and the
  runtime check follows paths.
- `src/core/` holds only physical foundations; a module used by one implementation lives under it.
- Recovery implementations coexist, several applicable to one body, none importing another's
  internals.
- A new entrant supplies configuration and its own Option or chooser inside its package and owned
  assets, plus its catalog line, without editing another entrant or framework internals.
- Registered entrants receive the common mind, state and replay checks.
- Existing configurations keep their meaning, the fingerprint is unchanged, stored rows carry to
  their new case codes, and the required checks pass.
