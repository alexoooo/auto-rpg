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
`npm test`, `npm run build`, and every boundary `scripts/source-boundary.mjs` holds. A step that
moves or renames a module changes the case keys that reach it (`caseCoder`,
`scripts/build-identity.mjs`), so saved evaluation rows for those cases replay; each step's commit
names the evaluations it re-keys.

**Decided here, which the owner may reverse**: the order of the steps; classes for the concepts
that own state and behaviour together, with their saved memory kept as a plain `state` object; a
120-character line.

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

Types are assembled by module augmentation: 49 `declare module` blocks, 15 of them on `RoleParts`.
What a role is cannot be read at one definition.

### 4. Meaning read from strings

A string literal that is a member of a closed union (`kind: "box"`) is checked by the compiler and
stays. Three uses are not checked:

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
  objects and closures, which hide a branch inside a literal.
- **Density**: 1,369 lines over 160 characters, 114 over 220; several declarations to a line; a
  50-line `describe` of nested closures with inline `import("...")` types.

### 6. Indirection that serves the gate

`OptionAssembly` takes `recovery`, `validate` and `replaceRecovery` callbacks;
`src/app/option-controller.ts` fills two with `waysUpIn` and `withWaysUp` from
`src/minds/option/rise.ts`, the folder that receives them. `src/app/registration/` is 19 modules
of at most 18 lines. `catalogOf` reads its lists lazily and `anyBody` is a function declaration so
that a module may load in any order: load order is a constraint the code works around.

### 7. Mind-facing seams in the core

`src/core/bodies/` holds the senses, `own-body.ts`, `body-control.ts`, the command pipeline and
the assist, which are the seam between a body and its mind and not physical foundations. Least
urgent; taken last.

## The rules this adds

Each goes into [AGENTS.md](../../AGENTS.md)'s Code section in the step that first enforces it,
with its check.

- **A concept the architecture names is one declared type**: an interface or a class with that
  name. A factory states the type it returns.
- **A kind is a member of a closed union** derived from its registry; `kind: string` is only at a
  boundary that reads a save or a link, which validates it once.
- **No property is read from a name's spelling**: a segment's region, a joint's limb, an Option's
  category and an action's status are declared fields.
- **A call's arguments are names or simple literals**; what they hold is computed in statements
  above the call. More than three positional arguments become one named record.
- **A branch is a statement**: an optional field is set by an `if`, or is a field that holds
  `undefined`.
- **One declaration a line; a line fits the formatter's width.**

## The steps

Each step is one kind of change over the whole of `src/`, landed in commits a module family at a
time, each with `npm run check`, `npm test`, `npm run build` and an unmoved fingerprint. A step
ends with a code search for the old form and a report of what remains.

1. **Gate the surface first.** A formatter with a 120-character line and one declaration a line,
   run by `npm test`; a lint that fails on an inline `import("...")` type, a spread of a
   conditional, and `startsWith`/`endsWith`/`includes` on a segment, joint, kind or stage name.
   The formatter's rewrite lands alone, so later diffs are readable. The lint lands with its
   present offenders listed and the list only shrinks.
2. **Unwrap the closures.** Each `createX(context)` module becomes plain exports; a function that
   reads the context takes it as its first parameter. `EVALUATIONS` is one typed list built once,
   with no cast; `src/app/evaluation.ts` and the 57-name destructure go. `Duel`, `TeamBout` and
   `DungeonRun` take the context where they are constructed and the subclasses in
   `src/app/game.ts` go.
3. **Name the concepts.** `OptionMind` becomes a declared type that holds its skills, decider,
   options and state, and implements `Mind`; `createOptionMind` returns it. The same for the skill
   set, the command layers and the hosting mind. The construction vocabulary is cut to the names
   that differ in meaning: one name for what a fight grants (`HostGrants`, `MindWiring`), one for
   what a maker returns (`MindMade`, `MindConstruction`, `CommandedMind`), one for the parts under
   the skills (`SkillKit`, `MindKit`, `Filled`). The architecture's Minds section is rewritten to
   the names that remain.
4. **Split `Part`.** A small core (role, kind, defaults, `fits`, `faults`, slots); a role's own
   members on that role's interface (`strikes` on the executor's, `supportedEquipment` on the
   guard's); what a screen shows (`label`, `fields`, `phases`, `offered`) in a description beside
   the part, read by `src/app/browser/`. One tree walker (`visitParts`) replaces every hand-written
   slot walk, and `Catalog`'s `tree*` methods become functions over it.
5. **Type the kinds.** Each role's config is the union of its registered parts' configs, so a slot
   accepts only a kind its role has and `option-defaults.ts` fails to compile on a misspelt
   technique. `PartConfig` with `kind: string` remains only where a save or a link is parsed. The
   `as unknown as` count is reported before and after; each cast that remains has a comment saying
   what the compiler cannot see.
6. **Declare what names spell.** `SegmentSpec` gains its region (trunk, arm, leg, head), `JointSpec`
   its limb, an Option part its category, and an action's stage becomes a status field beside its
   name. Every `startsWith`/`endsWith` in step 1's list is replaced by a read of the field; general
   code that names `middleTrunk`, `head` or `upperTrunk` reads a role the spec declares.
7. **Flatten the calls.** Module by module, largest offenders first (`src/minds/option/mind.ts`,
   `src/evaluation/`, `src/skills/`): intermediates get names, positional lists become records,
   conditional spreads become statements. Step 1's lint list reaches empty.
8. **Remove gate-serving indirection.** `OptionAssembly`'s callbacks become direct calls where the
   import already points down; the registration lists that only forward imports merge into one
   module a layer, if `caseCoder` keys cases as finely from it, and stay otherwise with that reason
   in the module. Each load-order workaround is removed once its cycle is, and the cycles
   `scripts/source-boundary.mjs` allows inside a rank are reported.
9. **Move the body-to-mind seam out of the core.** The senses, `OwnBody`, `BodyControl` and the
   command pipeline move to a layer of their own between the core and control, with its rank in
   `RANKS`.

## How it is checked

- **No behaviour change**: the fingerprint before and after each commit; a moved case is a defect
  of the commit.
- **The goal**: after steps 3 and 4, a fresh agent given only the architecture's Minds section and
  the code, and no account of this work, traces how an Option Mind is built and stepped and
  reports each place it could not follow a name to its declaration. Those places are fixed before
  the step is reported done.
- **Counts reported at each step's end**: `createX(context)` modules, `as unknown as`,
  `declare module`, conditional spreads, name-spelling reads, lines over the width.

## When it lands

The rules are in AGENTS.md with their checks, the architecture names only declared types, and this
plan is deleted.
