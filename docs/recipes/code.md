# Changing code

The rules a change to code keeps, read before the first edit. [The architecture](../architecture.md)
says what each layer is and where it lives; [the traps](../traps.md) what has bitten in Rapier,
Babylon, a browser and the tools on Windows; [the test rules](../../tests/README.md) the rules
of a test.

## Simulation and source boundaries

- **[The layers](../architecture.md#the-layers)' boundaries are a gate**
  (`scripts/source-boundary.mjs`, held by `tests/core-boundary.test.mjs`): which layer imports
  which, runtime-neutral code outside `node/` and `browser/`, exact arithmetic (`EXACT_MATH`),
  engine access and what a Mind may read and do.
- **A Mind is an entrant** ([adding one](../architecture.md#adding-an-entrant)); it imports
  published library APIs and itself, never another entrant.
- **Simulation code uses the core's vectors** and plain poses; drawing code uses Babylon's, and a
  page poses a puppet from the simulated poses. A module that does both is split.
- **A spec's number is a `Quantity`** read from a `SOURCES` entry (`src/core/sources.ts`: a paper,
  an asset, or tuned with what it is set for) or derived by a named rule that writes no factor.
  A spec never spreads another family's.
- **Tuning is immutable**: an experiment passes an override in; nothing mutates a global.
- **`scene.render()` never advances the world**, and a test never steps by rendering:
  [one world step](../architecture.md#one-world-step) owns physics, the clock and its hooks.
- **Rapier is vendored** (`vendor/rapier`); never the npm SIMD package. Its wasm loads once a realm,
  only through `rapierModule`: two `init`s make two instances whose worlds cross.
- **One engine**: training, tuning, evaluation and tests run the game's `DEFAULT_ENGINE`; a
  script names another only to compare engines. A setting tuned on one engine is not read on
  another.
- **A body's level** comes from where the bodies are, never from the machine; a body is not
  rebuilt to save a step.
- **Solver conditioning is not anatomy**: an iteration count, inertia floor or damping for the
  solver is named so (`SOLVER`) and kept out of the body's numbers.
- **An assist is not anatomy** (`Assist`, [motor control](../architecture.md#motor-control)): a
  skill is read unassisted, and a figure read under an assist names each side's steadiness.
- **A muscle's strength and speed serve the owner's goal**: from a source where one pins them,
  tuned for the result asked for where none does, never raised for feel.
- **Cosmetics never carry authority**: the visible room is not the collision arena
  (`validateRoomPlacements`).
- **A controller cannot require the state it exists to bring about.**

## Code

- **Clean, simple and general.** A smell met along the way (needless complexity, two concerns in
  one module, dead code) is fixed in the work, as a rule applied everywhere rather than a shim.
  General means every body and every Option through the same code: no seam, hardening or
  declaration for a consumer that does not exist. Nothing is kept for backwards compatibility,
  and third-party projects are not patched upstream.
- **Switch on a union with a `never` default.**
- **An expected refusal is a returned value.** A throw is a defect; a catch only at a reporting
  boundary, keeping the error's message.
- **A flag fixed for a caller is set when it builds.**
- **A module that owns a rule exports its predicate.** A published field needs a reader; an
  export needs an importer.
- **A name is filed by what it is**, whoever reads it, one idea a file; a default is in the file
  of the part it is a default of.
- **What changes step to step is plain data in one `state` object** per module
  (`src/core/state.ts`), so a bout forks by copying its state; a constant a state points at is
  frozen. A class or a closure holds three kinds of memory, told apart by where each sits:
  - **parts**: `readonly` fields, made once and never replaced;
  - **memory**: `state`, which a parent points at and never copies. A load writes back into the
    objects a state holds, so an owner may keep hold of one; it puts a new object in a slot that
    was null, frozen or of another length, or whose object another state read earlier shares,
    and such a slot is reached through `state` each time;
  - **caches**: a field or a module's map whose comment says what it is keyed by and why that
    never changes (a spec, a data table, a config, none written after it is made; one step's own
    reading), so dropping one changes no result.
- **The fingerprint's relay checks that** (`node scripts/fingerprint.mjs --relay 127`): each arena
  fight is played again with a fresh bout, its Minds new, taking over from a save every 127
  steps (a count no decision period divides, so the handovers fall at every phase of a Mind's
  decisions), and must end on straight play's save. A fresh bout drops what a Mind or a skill
  keeps in a field or a closure outside `state`. It does not drop a module's map; it plays only
  the arena's fights; it compares only the saves the two end on; and it loads only into a bout
  that has not played. It found three ways the rule above breaks: a punch that kept one commit's
  memory in a closure (`MOVING_THROW`); an empty posture every motor's state pointed at that
  was not frozen, so a load wrote one motor's pose into all of them (`initialGuardPosture`);
  and a goal that held the state's arrays from when it was made, where a load had put new ones
  (`rightingByRoutes`). *Shown.*
- **The step's dear functions work in arrays made once**, which carry nothing between calls,
  under the step's allocation ceilings (`tests/core-step-cost.test.mjs`); a
  speed rewrite does the same operations in the same order, moves no fingerprint, and reads its
  time before and after ([step cost](../reference/step-cost.md)).
- **The fingerprint reads a change bout by bout**: its fixed fights and scenes, the game's Mind
  against itself at 25 ranges, and a trial of each table reading, each a case `--compare` names
  where it moved. A few fixed bouts alone missed a change that moved only states they never
  reach (`98bbd2ae8` moved 3 of 144 mirror bouts by rounding). *Shown.*
- **A number set by hand that prices a fight is a registry entry** (`handSet`,
  `src/core/hand-set.ts`): where the code reads it, with its name, its sort (a guess of what
  happens in a fight, a preference a player sets, or the Mind's own working) and a sentence that
  says what it is. A scan of the parsed source fails one written any other way in the code that
  prices a fight (`scripts/hand-set.mjs`, held by `tests/core-boundary.test.mjs`). The scan's
  header lists what it cannot see, among them a guess of 0, 1 or 2 that is no constant of its
  own, a number not written as one, and a guess imported from outside the code it reads.
- **A reading and a price say where they come from** (`Source`,
  `src/skills/framework/profile/source.ts`): measured (whose rows, found by numbers, by a name or
  by a rule, and how far off), by hand (which registry entries), given, or not priced. None is
  built without one: an Option's price carries its four (`Terms.from`), a priced line the foe's
  and its end's, and the Mind's report all six for each offer. The inventory
  (`node scripts/inventory.mjs`) lists them as a bout begins and plays no bout: each body in
  front of the empty-handed man, and him in front of each. Its rows that fail, each guess in the
  registry among them, are held to the list known today with the standings each fails for
  (`scripts/inventory-known.json`, by `tests/minds/inventory.test.mjs`). A mended row leaves the
  list, and a row joins it only with the change that says why. The price of an Option that is
  not on offer as a bout begins is not on the list: the bout trace counts its answers
  (`research/skills/strikes/strike-bouts.mjs`).
- **A screen is an explicit argument**, never inferred from a state machine. Pause freezes the
  world, not the camera.
- **Two watchers on one body**: set a flag in the callback; act on it at the next control step.
- **Every page is in `vite.config.ts`'s `rollupOptions.input`**; one missing works in dev and is
  absent from `dist`.
- **A played row is found by the question it answers**, never by the code it was played on:
  nothing a tool keeps holds the commit or the build in what finds it
  ([the architecture](../architecture.md#evaluations)). What is under work plays and everything
  else is found; a row is played again when there is reason to believe it misleads a decision
  (`npm run evaluate -- <id> <subject> --fresh`).
- **Comments say what the code is**, and why where not obvious. Name the construct, not a line
  number. A comment about a code path is a hypothesis until the path has run. A comment in `src/`
  carries no date, commit hash, plan citation or "the owner": `tests/documents.test.mjs`.

## What a change does not add

- **A fix adds no flag, cast, optional parameter or second copy.** A field every maker gives is
  required; what two modules need is one export of the module that owns it; a cast a type could
  carry is that type (a generic over the config, a type guard).
- **An experiment is a kind behind its contract**, selected by a config, or it is deleted on the
  owner's word; never a flag, a string or an optional parameter in the code every kind shares.
- **A list beside a registry is the registry**: what the registered parts offer (a Mind's Options,
  Move's gaits) is read from them, never written again by hand, so a part registered is a part in
  use; a test guards only what structure cannot.
- **A script or flag made for one reading goes when the reading is done**, its finding kept in the
  document that holds its kind; a case a command already takes gets no script of its own.
- **A stored file has one shape.** When the shape changes, the file is rewritten or made again in
  the same commit; no reader allows for the old one.
- **A new need is not a new trailing parameter.** A function written, reshaped or added to takes
  named fields past three positionals or at its first boolean; a boolean that is the value itself
  (what a setter sets, an outcome recorded) is a value, not a mode. A kernel on the step's dear
  path (the stance's geometry, the swing leg's reach) may keep its scalars, and its comment says
  why: an object a call there is allocation the step's ceiling counts.
