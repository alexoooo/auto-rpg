# Readable code: named concepts, typed kinds, plain composition

## Why

The layers hold: `scripts/source-boundary.mjs` passes, the import graph of `src/` has four value
cycles of two or three modules, and the `Mind` contract (`src/minds/mind.ts`) is four members. The
gate reads import direction only. What a person meets inside a module is not gated, and it is
where the code cannot be followed:

- a central concept has no declaration to read;
- composition is done by wrapping whole modules in closures;
- one interface, `Part`, carries every role's concerns over configs the compiler cannot check;
- meaning is read from the spelling of names;
- computation and branching sit inside call arguments and object literals.

This plan removes each, a step at a time, with no change to what the game computes.

**The goal**: a person who opens a module named in the [architecture](../architecture.md) finds
each concept it names as one declared type, follows a call by go-to-definition, and reads one
operation a statement.

**What must not move**: every fingerprint case (`node scripts/fingerprint.mjs`), `npm run check`,
`npm test`, `npm run build`, every boundary `scripts/source-boundary.mjs` holds, and the step's
cost ([step cost](../reference/step-cost.md)).

**Decided here, which the owner may reverse**: the order of the steps; classes for the concepts
that own state and behaviour together, with their saved memory kept as a plain `state` object; a
120-character line; the formatter's rewrite of the whole tree landing in one commit while no other
plan has uncommitted work in `src/`.

## Constraints the steps work under

### Saved evaluation rows

A case's key holds a digest of the content of every file in its code's closure (`caseCoder`,
`scripts/build-identity.mjs`). Any edit to a file in a closure, a comment or a line break
included, re-keys every case that reaches it, and its saved rows and baselines replay. Step 1
changes what the digest reads so that an edit to layout, comments or types moves no key. Changing
the digest re-keys every case once. After it, a step re-keys only the cases whose executable code
it edits, and each commit names the evaluations it re-keys.

### The step's cost

Code that runs every world step allocates nothing it can avoid. The rules below that name
intermediates and gather arguments into records apply to code that builds; step-rate code keeps
positional arguments and arrays made once. Step 2 declares which modules are step-rate and gates
them, so the two sets of rules cannot be confused.

### Callers the compiler does not check

137 modules under `scripts/`, `research/` and `tests/` import 206 modules of `src/`, and
`tsconfig.json` includes only `src`. `tests/script-links.test.mjs` fails on an import of a module
or a name that is gone; nothing fails on a changed signature. A commit that changes an exported
function's parameters searches those three folders for its callers and changes them in the same
commit.

### Open registries

An entrant registers parts of its own (`<entrant>:<kind>`), so the set of kinds is open below
`src/app/`. A lower layer learns a role's kinds from a config map that each part's module extends
by `declare module` (`GuardConfigs`, `AimConfigs`, `TechniqueConfigs`). That is the registry's
type and it stays. The lists under `src/app/registration/` are where `caseCoder` cuts a case's
code part by part; each holds its imports and one list (`listOf`), and they stay.

## The findings

Counts are of `src/`, 708 modules.

### 1. Concepts with no declaration

Nothing is named `OptionMind`. `optionMind(assembly)` (`src/minds/option/mind.ts`) returns a
`Controller` written as one object literal of closures; `createOptionMind` has no declared return
type and returns what `driveBy` returns, a private `Driven` (`src/minds/decider.ts`). The object
with `act` and `think` is another literal built inside `hosting` (`src/minds/sub-mind.ts`) and
reaches the host as a side effect of `host.take`. A running Option Mind is four anonymous objects
(command layers, hosting mind, skills, decider) that meet only in `createOptionMind`'s local
variables. The skill set (`skillSet`), the command layers (`commandLayers`) and the toolkit
(`toolkitLists`) are the same: a function's result, no named type that says what it holds.

Building one mind passes through `BodyHost`, `HostGrants`, `MindWiring`, `MindMade`,
`MindConstruction`, `CommandedMind`, `OwnBody`, `Body`, `BodyView`, `BodyControl`, `Controller`,
`Catalog`, `Entrant`, `OptionAssembly`, `SkillKit`, `MindKit` and `Filled`. Several say nearly the
same thing.

### 2. Composition by closure

42 modules (5,400 lines) have the form `export function createX(context: GameContext) { ...the
whole module... }`.

- `evaluationApplication` (`src/app/evaluation.ts`) spreads 38 of them into one flat object;
  `src/app/node/evaluation.ts` destructures 57 names from it on one 770-character line.
- `createEvaluations` (`src/evaluation/evaluations.ts`) calls the `create*Index(context)`
  factories that `evaluationApplication` also calls, so each evaluation description is built
  twice, and registers all 14 with `as unknown as Evaluation`.
- `gameApplication` (`src/app/game.ts`) subclasses `Duel`, `TeamBout` and `DungeonRun` only to
  supply the context, typed with `ConstructorParameters<typeof Base>[n]`.

### 3. `Part` and `Catalog` carry everything

`Part` (`src/parts/parts.ts`) has about 20 members across unrelated concerns: what a screen shows
(`label`, `offered`, `fields`, `phases`), strikes (`strikes`), guards (`supportedEquipment`),
orders (`obeys`), data loading (`reads`, `fitReads`) and tree structure (`slots`, `slotsFor`,
`children`, `uses`). `Catalog` (`src/minds/catalog/catalog.ts`) adds about 20 `tree*` methods.

A config is `PartConfig`, `{ kind: string }`, walked by casting to `Record<string, unknown>`. The
walk over a slot's children is written twice inside `partRequirements`, again in the Option
controller's `describe`, and again in the catalog. `src/` holds 206 `as unknown as` casts.

A role's config map exists for some roles and is not what a slot is typed by, so the kinds the
maps hold check nothing where a tree is written.

### 4. Meaning read from strings

A string literal that is a member of a union (`kind: "box"`) is checked by the compiler and stays.
Three uses are not checked:

- **Part kinds**: `{ kind: "tree" }`, `{ kind: "visibility-navigation" }` and the technique list
  in `src/app/option-defaults.ts` are plain strings; a misspelt kind compiles and fails when the
  catalog looks it up.
- **Properties read from a name's spelling**: trunk segments by `name.endsWith("Trunk")` (three
  recovery modules), arm joints by `joint.startsWith("shoulder.")`
  (`src/core/bodies/human/skeleton.ts`), strike options by `option.kind.startsWith("strike-")`
  (`src/evaluation/drill-opponents.ts`), an action's ending by `stage.startsWith("ended:")`
  (`src/minds/option/rise.ts`, `rise-memory.ts`).
- **A body's parts named in general code**: `name === "middleTrunk"`, `"head"` and `"upperTrunk"`
  in a dozen places.

### 5. Logic inside arguments

- **Nested computation**: a call whose arguments build other objects, derive values and call
  further functions, positionally (`driveBy(body, optionDecider(...seven arguments...), make,
  {...}, aimsState(aims))` in `createOptionMind`).
- **Conditional spreads**: 333 of the form `...(condition ? { field } : {})`, some holding nested
  objects and closures, which hide a branch inside a literal and give objects of one type
  different sets of keys.
- **Density**: 1,369 lines over 160 characters, 114 over 220; several declarations to a line; a
  50-line `describe` of nested closures with inline `import("...")` types.

### 6. Indirection and load order

`OptionAssembly` takes `recovery`, `validate` and `replaceRecovery` callbacks;
`src/app/option-controller.ts` fills two with `waysUpIn` and `withWaysUp` from
`src/minds/option/rise.ts`, the folder that receives them. `catalogOf` reads its lists lazily and
`anyBody` is a function declaration so that a module may load in any order.

48 statements of the form `import { type X } from` name only types and still load their module
when Node runs `src/` directly. They add edges to the load order and files to every case's
closure.

### 7. Mind-facing seams in the core

`src/core/bodies/` holds the senses, `own-body.ts`, `body-control.ts`, the command pipeline and
the assist, which are the seam between a body and its mind and not physical foundations. Least
urgent; taken last.

### 8. A layer has no declared surface

A module may import any module of its own rank or a lower one. `PUBLISHED` lists what an entrant
may import; nothing lists what `src/skills/` may import of `src/control/`. A reader learns a layer
by reading all of it.

### 9. Nothing checks the architecture's names or what is unused

The [architecture](../architecture.md) names concepts in backticks that no test resolves to a
declaration. AGENTS.md's rule that an export needs an importer has no check, and the
[roadmap](../roadmap.md) lists research-only code still under `src/core/`.

## The rules this adds

Each goes into [AGENTS.md](../../AGENTS.md)'s Code section in the step that first enforces it,
with its check.

- **A concept the architecture names is one declared type**: an interface or a class with that
  name. A factory states the type it returns.
- **A slot's config is typed by its role's config map**; `kind: string` is only where a save or a
  link is parsed, which validates it once. A registration list is checked against its map.
- **No property is read from a name's spelling**: a segment's region, a joint's limb, an Option's
  category and an action's status are declared fields.
- **Building code calls with names or simple literals**; what they hold is computed in statements
  above the call, and more than three positional arguments become one named record.
- **Step-rate code allocates nothing it can avoid**: no object or array literal, closure, spread
  or `map`/`filter` in a module the step-rate list names, outside what it makes once.
- **Objects of one type hold the same keys**: an optional field holds `undefined`; a branch is a
  statement.
- **A module that names only types of another imports them with `import type`.**
- **A layer's modules that other layers may import are listed.**
- **One declaration a line; a line fits the formatter's width.**

## The steps

Each step is one kind of change over the whole of `src/`, landed in commits a module family at a
time, each with `npm run check`, `npm test`, `npm run build` and an unmoved fingerprint. A step
ends with a code search for the old form and a report of what remains.

1. **Make structural edits free, and shrink the tree.**
   - A code file's hash in the file table (`readFileTable`) is of its syntax with comments, type
     annotations and layout removed. A test edits a comment, a type and a line break in a module
     and reads the same case key.
   - Every `import { type X } from` that names only types becomes `import type`; a lint holds it.
   - A check names each export of `src/` that nothing in `src/`, `scripts/`, `research/` or
     `tests/` imports; each is deleted or its importer named. Research-only code under
     `src/core/` moves to `research/`.
2. **Gate the surface.**
   - The formatter and the tool that splits declarations are chosen by a trial on three dense
     modules (`src/minds/option/mind.ts`, `src/core/sources.ts`, one recovery implementation),
     with the installed TypeScript. The formatter runs in `npm test` at 120 characters. Its
     rewrite of the tree lands alone in one commit.
   - A lint over `scripts/syntax.mjs`, beside the boundary gate, fails on an inline
     `import("...")` type, a spread of a conditional, and `startsWith`/`endsWith`/`includes` on a
     segment, joint, kind or stage name. It lands with its present offenders listed and the list
     only shrinks.
   - A step-rate list names the modules that run inside `World.step`'s hooks, drawn from what
     [step cost](../reference/step-cost.md) measures. The same lint fails there on an object or
     array literal, a closure, a spread or `map`/`filter` outside a module's set-up, again with
     present offenders listed.
3. **Unwrap the closures.** Each `createX(context)` module becomes plain exports; a function that
   reads the context takes it as its first parameter, as `mindFaults` does. The evaluations are
   one typed record built once where the application is composed, with no cast;
   `src/app/evaluation.ts` and the 57-name destructure go. `Duel`, `TeamBout` and `DungeonRun`
   take the context where they are constructed and the subclasses in `src/app/game.ts` go. Each
   commit changes the callers under `scripts/`, `research/` and `tests/` with it.
4. **Name the concepts.** `OptionMind` becomes a declared class that holds its skills, decider,
   options and state, and implements `Mind`; `createOptionMind` returns it. The same for the skill
   set, the command layers and the hosting mind. A class keeps its methods on its prototype and
   what changes step to step in its `state`. The construction vocabulary is cut to the names that
   differ in meaning: one name for what a fight grants (`HostGrants`, `MindWiring`), one for what
   a maker returns (`MindMade`, `MindConstruction`, `CommandedMind`), one for the parts under the
   skills (`SkillKit`, `MindKit`, `Filled`). The architecture's Minds section is rewritten to the
   names that remain, and `tests/documents.test.mjs` fails on a backticked identifier in the
   architecture that no module of `src/` exports.
5. **Split `Part` and type its slots.**
   - A small core (role, kind, defaults, `fits`, `faults`, slots); a role's own members on that
     role's interface (`strikes` on the executor's, `supportedEquipment` on the guard's); what a
     screen shows (`label`, `fields`, `phases`, `offered`) in a description beside the part, read
     by `src/app/browser/`.
   - One tree walker (`visitParts`) replaces every hand-written slot walk, and `Catalog`'s `tree*`
     methods become functions over it.
   - Every role has a config map; a slot is typed by its role's map, so `option-defaults.ts` fails
     to compile on a misspelt technique. Each registration list is written `satisfies` its map, so
     a kind typed and not registered fails. `PartConfig` with `kind: string` remains only where a
     save or a link is parsed. The `as unknown as` count is reported before and after; each cast
     that remains has a comment saying what the compiler cannot see.
6. **Declare what names spell.** `SegmentSpec` gains its region (trunk, arm, leg, head), `JointSpec`
   its limb, an Option part its category, and an action's stage becomes a status field beside its
   name. Every `startsWith`/`endsWith` in step 2's list is replaced by a read of the field; general
   code that names `middleTrunk`, `head` or `upperTrunk` reads a role the spec declares.
7. **Flatten the calls.** Module by module, largest offenders first (`src/minds/option/mind.ts`,
   `src/evaluation/`, `src/skills/`). In building code intermediates get names and positional
   lists become records. A conditional spread becomes a field that holds `undefined`, with a
   search for each reader of the object's keys (`in`, `Object.keys`, an equality over the whole
   record) in the same commit. In step-rate code a spread becomes a write into what the module
   made once. Both of step 2's lists reach empty.
8. **Remove the callbacks and the load-order workarounds.** `OptionAssembly`'s callbacks become
   direct calls where the import already points down. Each load-order workaround (`catalogOf`'s
   lazy lists, `anyBody`) is removed once the cycle it serves is, and the cycles
   `scripts/source-boundary.mjs` allows inside a rank are reported.
9. **Give each layer a surface, and move the body-to-mind seam.** Each rank in `RANKS` lists the
   modules a higher rank may import, as `PUBLISHED` does for entrants, and the gate fails on an
   import of another. The lists name modules and re-export nothing, so no case's closure widens.
   The senses, `OwnBody`, `BodyControl` and the command pipeline move to a layer of their own
   between the core and control, with its rank and its list.

## How it is checked

- **No behaviour change**: the fingerprint before and after each commit; a moved case is a defect
  of the commit.
- **No cost change**: the step's time read before and after steps 4 and 7
  ([step cost](../reference/step-cost.md)).
- **The goal**: after steps 4 and 5, a fresh agent given only the architecture's Minds section and
  the code, and no account of this work, traces how an Option Mind is built and stepped and
  reports each place it could not follow a name to its declaration. Those places are fixed before
  the step is reported done.
- **Counts reported at each step's end**: lines of `src/`, `createX(context)` modules,
  `as unknown as`, conditional spreads, name-spelling reads, step-rate allocations, lines over the
  width.

## When it lands

The rules are in AGENTS.md with their checks, the architecture names only declared types, and this
plan is deleted.
