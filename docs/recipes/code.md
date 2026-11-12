# Changing code

The rules a change to code keeps, read before the first edit. [The architecture](../architecture.md)
says what each layer is and where it lives; [the traps](../traps.md) what has bitten in Rapier,
Babylon, a browser and the tools on Windows; [the test inventory](../../tests/README.md) the rules
of a test.

## Simulation and source boundaries

- Responsibility, runtime and public API boundaries cover every source module:
  `scripts/source-boundary.mjs`, held by `tests/core-boundary.test.mjs`. Runtime-neutral code stays
  outside `node/` and `browser/`; application composition supplies catalogs and adapters. The same
  gate checks exact arithmetic (`EXACT_MATH`), engine access and what a Mind may read and do.
- **A Mind is an entrant** (`src/entrants/<name>/`, a line in `ENTRANTS`); it imports published library APIs and
  itself, never another entrant. The registry is `src/app/entrants.ts`. `node scripts/entrant-check.mjs` names a change an entrant's, the
  toolkit's or mixed; an entrant's change touches its own files and its registry line; a toolkit
  change names its moved fingerprint cases.
- **Simulation code uses the core's vectors** and plain poses; drawing code uses Babylon's, and a
  page poses a puppet from the simulated poses. A module that does both is split.
- **A spec's number is a `Quantity`** read from a `SOURCES` entry (`src/core/sources.ts`: a paper,
  an asset, or tuned with what it is set for) or derived by a named rule that writes no factor.
  A spec never spreads another family's.
- **Tuning is immutable**: an experiment passes an override in; nothing mutates a global.
- **One world step** (`World.step`, 120 Hz) owns physics, the clock and the order of its hooks;
  minds, control and blows run as hooks. A page advances by real time (`World.advance`). `scene.render()` never advances the world, and a test
  never steps by rendering.
- **Rapier is vendored** (`vendor/rapier`); never the npm SIMD package. Its wasm loads once a realm,
  only through `rapierModule`: two `init`s make two instances whose worlds cross.
- **One engine**: training, tuning, evaluation and tests run the game's `DEFAULT_ENGINE`; a
  script names another only to compare engines. A setting tuned on one engine is not read on
  another.
- **A body's level** comes from where the bodies are, never from the machine; a body is not
  rebuilt to save a step.
- **Solver conditioning is not anatomy**: an iteration count, inertia floor or damping for the
  solver is named so (`SOLVER`) and kept out of the body's numbers.
- **An assist is not anatomy**: a force no muscle gives (`Assist`), capped by the character's
  balance and metered every step. A figure read under an assist names each side's balance.
- **A muscle's strength and speed serve the owner's goal**: from a source where one pins them,
  tuned for the result asked for where none does, never raised for feel.
- **Cosmetics never carry authority**: the visible room is not the collision arena
  (`validateRoomPlacements`).
- **A controller cannot require the state it exists to bring about.**
- **A skill is read unassisted**; a reading under an assist is the assist's.

## Code

- **Clean, simple and general.** A smell met along the way (needless complexity, two concerns in
  one module, dead code) is fixed in the work, as a rule applied everywhere rather than a shim.
  General means every body and every Option through the same code: no seam, hardening or
  declaration for a consumer that does not exist. Nothing is kept for backwards compatibility,
  and third-party projects are not patched upstream.
- **Switch on a union with a `never` default.**
- **An expected refusal is a returned value.** A throw is a defect; a catch only at a reporting
  boundary, keeping the error's message.
- **A flag fixed for a caller is set when it builds**; no bare boolean positionals.
- **A module that owns a rule exports its predicate.** A published field needs a reader; an
  export needs an importer.
- **What changes step to step is plain data in one `state` object** per module
  (`src/core/state.ts`), so a bout forks by copying its state; a constant a state points at is
  frozen.
- **The step's dear functions work in arrays made once**, under the step's allocation ceilings; a
  speed rewrite does the same operations in the same order, moves no fingerprint, and reads its
  time before and after ([step cost](../reference/step-cost.md)).
- **A screen is an explicit argument**, never inferred from a state machine. Pause freezes the
  world, not the camera.
- **Two watchers on one body**: set a flag in the callback; act on it at the next control step.
- **Every page is in `vite.config.ts`'s `rollupOptions.input`**; one missing works in dev and is
  absent from `dist`.
- **Comments say what the code is**, and why where not obvious. Name the construct, not a line
  number. A comment about a code path is a hypothesis until the path has run. A comment in `src/`
  carries no date, commit hash, plan citation or "the owner": `tests/documents.test.mjs`.
