# Project organization and entrant packages

## Goal

Organize the project by responsibility, ownership and runtime. A reader can identify a concept's
implementation, its public contracts, the mechanisms it shares and the applications that compose
it. An agent develops a new fighter idea within its own entrant package, including configuration,
Options, skills, models and decision-making customizations.

This work changes organization and extension boundaries. Preserve simulation behavior and the
meaning of existing configurations and data. Skill training and fighter improvements are separate
work. The [architecture](../architecture.md) describes the implemented structure; this plan defines
the target.

## Ownership and responsibility

Responsibility determines the main hierarchy. Each implementation owns its internal algorithms,
parameters and caches. Shared code belongs to the narrowest meaningful common scope of its
consumers. Reuse within one capability gives that capability ownership; reuse across capabilities
can justify a lower-level mechanism. Similar code alone does not justify an abstraction.

| Responsibility | Owns |
| --- | --- |
| Core | physical foundations: arithmetic, physics, body descriptions, muscles, world stepping and state |
| Control | reusable mechanisms that turn motion and support goals into muscle commands |
| Skills | skill contracts and reusable implementations, grouped by capability |
| Minds | mind contracts and reusable decision-making frameworks and components |
| Game | Arena and dungeon gameplay, world construction and game rules |
| Evaluation | cases, readings, comparisons and evaluation orchestration |
| Entrants | independently developed fighters and everything specific to their ideas |
| Application | catalogs, entry points and composition of concrete implementations |

Role-specific contracts live with their concept. Core contains the foundations those concepts
need. Public entry points identify what consumers may depend on; implementation modules remain
private to their package.

The target shape, with illustrative implementation names:

```text
src/
  core/
    math/
    physics/
    bodies/
    world/
  control/
    kinematics/
    dynamics/
    support/
  skills/
    api.ts
    recovery/
      contract.ts
      support.ts
      staged-rise/
        api.ts
        player.ts
        recipes.ts
        records.ts
      quadruped-righting/
    locomotion/
    strikes/
  minds/
    api.ts
    option/
      api.ts
      mind.ts
      search/
  game/
    arena/
    dungeon/
      map.ts
      run.ts
      browser/
  evaluation/
    node/
    browser/
  entrants/
    standard/
      index.ts
      fighter.ts
    adaptive-fighter/
      index.ts
      fighter.ts
      config.ts
      options/
      skills/
      search/
      models/
      node/
      browser/
  app/
    catalog.ts
    node/
    browser/
```

Create shared modules where actual consumers establish their purpose. Keep a small implementation
together where further subdivision obscures its ownership. Assets, tests and research tools use
the same ownership names under their respective roots, so their relationship to an implementation
is apparent.

## Runtime

Unqualified modules are runtime-neutral, including their transitive dependencies. Explicit
`node/` and `browser/` directories contain platform adapters and entry points, within the
responsibility or entrant that owns them.

- Runtime-neutral modules import runtime-neutral modules through permitted responsibility and
  package boundaries.
- Node adapters own filesystem access, CLI integration and Node-specific worker infrastructure.
- Browser adapters own DOM input, browser integration and rendering.
- Each adapter uses the same runtime-neutral simulation, gameplay and fighter implementations.
- An entrant's public manifest is runtime-neutral. Training tools and inspection UI have separate
  runtime entry points.

Headless compatibility is a transitive runtime property. Apply its checks to every simulation and
world-building path, including code outside core.

## Competing skill implementations

A capability such as standing up admits multiple independent implementations. A staged humanoid
rise, quadruped righting and more specialized techniques can coexist. Several implementations can
apply to the same body and situation.

Each implementation declares its applicability and entry conditions and provides the performance
information its consumer uses. Its recipes, control rules, tuning schema and derived caches belong
to that implementation. `RiseTables` remains private to the staged-rise player. A recovery helper
shared by several implementations belongs within recovery; a motor mechanism also used by other
capabilities belongs within control.

Generic skill and mind wiring receives implementations through contracts and registration.
Application composition selects the available implementations. Applicability and Option selection
determine which alternatives a fighter uses; a body-family dispatch does not make one technique
exclusive for that body.

## Entrant packages

An entrant is a source package with a public manifest and private implementation. It exports its
identity, fighter presets and supplied implementations. Scoped identifiers distinguish its parts
from those of other packages. Application composition registers the package in the catalog.
Configuration remains plain data referring to registered implementations; executable factories
live in the package's code.

An agent improving a fighter normally changes its entrant package, its owned artifacts and its
registration entry. Idea-specific configuration, Options, skills, search, models and tools stay
together. Shared libraries supply reusable building blocks. The standard fighter is an assembly
using the same contracts as other entrants.

The Option Mind framework supports these levels of customization:

1. Configure existing components: skills, Options, models, search settings and trained records.
2. Replace individual components through explicit contracts, including Options, search strategies
   and value models, while retaining the surrounding framework.
3. Supply a different Mind through the common Mind contract when an idea changes the decision
   architecture itself.

Expose extension seams where implementations vary. Each component receives its required inputs
through its contract and owns its evolving state under the save/replay rules. A custom search
strategy uses those interfaces rather than the private state of the default search. A new idea
does not require an experiment-specific flag in a shared implementation.

## Dependency rules

- Control depends on physical foundations. Skill implementations depend on appropriate control
  mechanisms, foundations and skill contracts.
- Minds use skill contracts and supplied catalogs to select and drive available skills.
- Application composition knows concrete entrants, skill implementations and mind frameworks.
  Lower-level contracts receive the dependencies they need.
- Shared libraries never import entrants. Entrants import published library APIs and their own
  internals; they never import another entrant's private implementation.
- Extract a mechanism shared by entrants into its appropriate library with a defined contract.
  Each entrant then depends on that library.
- A capability's shared modules never import its concrete implementations. Consumers reach an
  implementation through its public entry points.
- Runtime rules apply independently of responsibility and ownership rules.

Enforce these rules with import checks. Derive a dependency view from imports and document the
permitted directions, public entry points and composition roots in the architecture. Retain
headless execution, exact arithmetic, mind access and save/replay checks across moved modules.

## Migration

1. Inventory responsibilities, runtime dependencies, public consumers and registrations. Identify
   implementation details imported by shared wiring. Define the package and runtime import rules
   before moving modules.
2. Use recovery as a complete slice: give each competing implementation an owner, keep staged-rise
   internals private, identify genuinely shared recovery logic and inject implementations into
   generic wiring. Move its owned records, tests and tools consistently.
3. Separate reusable Option Mind machinery from fighter assemblies. Establish the component
   contracts needed by existing Options, search and models. Package existing entrants behind
   explicit public manifests and compose them through the application catalog.
4. Apply the same responsibility and runtime boundaries to the remaining skills, minds, gameplay
   and evaluation code. Update worker and page entry points to use the shared application
   composition with their own platform adapters.
5. Update the architecture, import checks and test discovery with each landed slice. Preserve
   published kind names, preset identifiers and data keys through structural moves. Remove obsolete
   paths and compatibility shims once their callers move.

Each slice preserves behavior and lands independently under [the repository's checks](../../AGENTS.md#doing-the-work).
Read the fingerprint before and after a behavior-preserving refactor; explain any changed case
before landing. Keep structural work separate from controller tuning and performance changes.

## Acceptance

- Responsibility, implementation ownership and runtime are evident from paths and public entry
  points; import checks enforce their dependency directions.
- Competing recovery skills coexist, including multiple skills applicable to one body, with
  implementation-specific caches and recipes private to their owner.
- A new entrant supplies configuration and a custom Option or search component inside its own
  package and owned artifacts, plus its catalog registration, without editing another entrant or
  framework internals. Contract fixtures demonstrate both component extension paths.
- The standard fighter and alternative entrants use the same registration and execution contracts.
- Node evaluation and browser applications discover the same runtime-neutral entrant manifests.
- Test discovery includes package-owned tests; registered entrants receive the common mind,
  applicability, state and replay checks.
- Existing configurations retain their meaning, structural slices preserve the simulation
  fingerprint, and required checks pass.
- The architecture describes the landed hierarchy and links its package and runtime boundaries.
