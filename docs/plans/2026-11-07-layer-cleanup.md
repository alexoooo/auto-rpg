# Layer cleanup

## Goal

Make each layer's insides follow the same rule as the layers themselves: general code does not
import specific code. `scripts/source-boundary.mjs` checks only that a module imports its own layer
or a lower one, so inside a layer anything may import anything. Four places break the rule there:

- **Core's foundations live in its specific folders.** The state rule (`saveState`, `loadState`,
  `deepFreeze`) is in `core/world/state.ts`, and every layer imports it. Provenance (`Quantity`,
  `sourced`, `SOURCES`) is in `core/bodies/`, and physics imports it. Bodies import `World` for the
  hooks they register, while the world imports bodies to sense them.
- **`src/skills/framework/` depends on the capabilities built on it.** It imports `intent/` and
  `locomotion/` in 21 places, and both import it back. The contracts it needs live in
  implementation files: `Locomotion`, `LegsDrive` and `LocomotionContext` in the human stance walk
  (`locomotion/locomotion.ts`), `Clearance` in `navigation/clear-step.ts`, `GaitName` in `gaits.ts`,
  and `Navigator`, `NavigationSight` and `NavigationReport` in `navigation/navigator.ts`.
- **`src/minds/` is four groups in one flat folder**: the mind contract and its runtime, the decision
  library, the catalog, and the seat that places a mind in the world. The catalog and the seat import
  each other, and `option/mind.ts` imports the seat's `host.ts`.
- **Game and evaluation share one layer index**, so either may import the other. Evaluation imports
  game; game never imports evaluation.

## How each change is made

- **A contract sits in the lowest folder that uses it; an implementation imports its contract**,
  never the reverse. Where general code needs a computation that lives higher up, the code that
  composes them passes it in as an argument, as `menuOf` already takes `readiness`.
- **A file that is all contract moves whole.** A file is split only where it holds both a contract
  and an implementation.
- **Every importer is edited.** No re-export at an old path, no alias for an old name, no new
  exemption in the gate.
- **A gate rule lands in the commit that makes it true**, so nothing creeps back between chunks.
- **Each chunk lands as its own commits**, with the checks AGENTS.md names for its change. A chunk
  that changes code also runs:
  - `node scripts/fingerprint.mjs` before and after, with every line unchanged;
  - `node scripts/entrant-check.mjs`, which names it a toolkit change that moves no fingerprint case;
  - `node research/minds-apart.mjs --entrants --threads 1,2 --fork 10`, every case the same on
    worker threads and from its fork as in the world's thread.
- **Each chunk ends by trying to refute itself**: `git grep` for every old name and path finds none
  in the tracked files. Ignored folders, such as `research/runs/`, hold old copies of the code and
  are not searched.

## 1. One call plays every mind apart and every fork

The fingerprint plays every mind in the world's thread. A move can break the other two paths a bout
takes and leave every fingerprint line the same:

- minds on Mind workers, as the Arena, the crowd and the Crypt run them;
- a bout saved and loaded into a fresh one, as the evaluations fork it.

Examples are a registration the worker's entry no longer loads, a state object that no longer
copies whole, and a module-level value that differs between threads.

`research/minds-apart.mjs` reads both paths. It plays each case in the world's thread, then with
its minds on worker threads, and forks a duel with `--fork`. A case passes when it matches the
in-thread run: the physics hashed every second, the blows and the ending. Today the whole panel
needs three calls, because `--entrants` replaces the cases and `--fork` refuses the crowd and the
Crypt, which do not save. The change:

- `--entrants` adds every registered entrant to the cases instead of replacing them;
- `--fork` forks each case that saves and lists the others as played unforked;
- the script's header, `research/README.md` and `docs/reference/step-cost.md` say so.

Check: `npm run check`, `npm test`; `node research/minds-apart.mjs --entrants --threads 1,2 --fork 10`
passes.

## 2. Documents that are wrong now

- `docs/architecture.md`:
  - the Skills row misses `guard/`, `intent/` and `perception/`;
  - the registration list misses executors, locomotions and move rules;
  - it describes `assets/entrants/<name>/` as existing, but no entrant has data yet.
- `docs/roadmap.md` names the layers "framework, motor control, skills, minds, command". It links
  the architecture's layers instead.
- `assets/forge/README.md` cites `src/arena/forge-*.ts`, now under `src/app/browser/arena/`.

Check: `node --test tests/documents.test.mjs`, `git diff --check`, the line-ending gate.

## 3. Ranks inside a layer

- `LAYERS` in `scripts/source-boundary.mjs` becomes one ordered list of ranks. A module's rank is
  the one whose prefix is its longest match, so `src/skills/` can rank the files at its root while
  `src/skills/strikes/` ranks above them. A module imports its own rank or a lower one.
- Evaluation becomes the rank above game.
- The probe in `tests/core-boundary.test.mjs` gains two imports the gate must refuse:
  - one from game into evaluation;
  - one from a folder into a higher-ranked folder of the same layer.
- `docs/architecture.md`: "Game and evaluation are peers" becomes "evaluation builds on game", and
  the layers section says that folders inside a layer are ranked too.

Check: as for code. The fingerprint is not needed: no `src/` module changes.

## 4. Delete what nothing uses

- `hostedMind` (`src/minds/minds.ts`) and the sentence citing it in `src/minds/host.ts`.
- Exports with no importer in the tracked `src/`, `tests/`, `research/`, `scripts/`, the pages or
  `vite.config.ts`: about 320. They are found by a TypeScript walk over every import and re-export
  (`export *`, HTML `<script>` and JSDoc `import()` included).
  - An export used only in its own file loses the `export` keyword.
  - A symbol no one uses is deleted, for example `checkedMotionCommand`, `JointStopSettings`,
    `remainingOf`, `lowOpponent`, `solve3`, `fixedSolve`, `boundedLeastSquares`, `HUMAN_PARENTS`,
    `GAIT_NAMES` and `toggle`.
  - `declare module` augmentation targets stay (`DataOf`, `RoleParts`, the `*Configs` maps).
  - A name a published entry point (`PUBLISHED`) re-exports is the toolkit's API for entrants, and
    stays.
- `src/app/browser/evaluation.ts` exports 58 names, of which pages import one. `src/app/browser/game.ts`
  re-exports five game modules that no page reads. Both export only what pages import.
- Each shim with one caller folds into that caller: `src/app/commanders.ts`,
  `src/app/recovery-selections.ts`, `src/minds/option/down.ts`.
- The role lists outside `src/app/registration/` move into it: `recovery-techniques.ts` becomes
  `techniques.ts`, `recovery-leg-adapters.ts` becomes `leg-adapters.ts`, and `quadruped-parts.ts`
  keeps its name. Each holds its imports and one list, as the build identity's cuts require.

## 5. Core's order

- **Shared modules move to core's root**, beside `refusal.ts`:
  - `core/world/state.ts` becomes `core/state.ts`;
  - `core/bodies/spec/quantity.ts` becomes `core/quantity.ts`, with `Vec3`;
  - `core/bodies/sources.ts` becomes `core/sources.ts`.

  Every importer is edited. AGENTS.md and `docs/architecture.md` cite the new paths.
- **Gravity and contact friction move to core's root**, as `core/constants.ts`: numbers that
  belong to no body and no engine, which minds may read and `physics/` is barred to.
- **`core/world/index.ts` goes.** It only re-exported the state rule; `PUBLISHED` names
  `core/state.ts` itself.
- **`core/world/command-delay.ts` moves to `core/bodies/`.** Only bodies and the mind's embodiment
  use it.
- **Bodies stop importing the world.** The world-shaped contract a body needs to run in a step moves
  into `core/bodies/step-host.ts`:
  - the members `physics`, `dt`, `delay`, `actuation`, `prepare`, `beforeStep` and `afterStep`;
  - the types `Hook` and `StepHook`.

  Body code takes a `StepHost`, and `World` extends it.
- **Ranks:** core's root files, `math/` and `data/` < `physics/` < `bodies/` < `world/`.

Refute: the ranks applied to the commit before this chunk name `physics -> bodies`,
`bodies -> world` and `data -> world`, and on this chunk they name nothing.

## 6. Skills' order

The work lands as two commits.

**Contracts into `framework/`.** Every edge from `framework/` into another skills folder goes.

- These `intent/` files are contracts, and move whole into `framework/`:
  - `intent.ts` (`Intent`, `Cover`);
  - `movement.ts` (`MovementRequest`, `GroundPoint`);
  - `estimate.ts`;
  - `action-aim.ts` (`Aimed`);
  - `aim-on.ts`.
- Contracts split out of implementation files into `framework/`:
  - `Locomotion`, `LegsDrive`, `LocomotionContext` and `GaitLimits`;
  - `GaitName`;
  - `Clearance`;
  - `Navigator`, `NavigationSight` and `NavigationReport`;
  - `MindKit`, from `src/skills/assembly/kit.ts`.

  `PUBLISHED` names the framework file that holds `Navigator`, in place of `navigator.ts`.
- `menuOf` takes the spot finder as an argument, the same way it takes `readiness`. The arbiter
  receives the finder from assembly, which passes `windowSpot`. `Spot`, which `MenuEntry` holds,
  and the finder's type move into `framework/`; `windowSpot` stays in `intent/action-window.ts`.

**Everything else into its rank**, with the skills ranks added to the gate:

- `intent/orders.ts` and `ordered.ts` move to `src/minds/`, `cover-hand.ts` to `src/minds/option/`: no
  skill imports them.
- `intent/conditions.ts` and `intent/travel.ts` move to `locomotion/`, their only skills users.
- The hand and reach geometry moves to a new folder, `src/skills/reach/`:
  - `strikes/held-strike.ts`, as `reach/hand.ts` (`aimOf` needs the rest of it);
  - `strikes/arm-reach.ts`;
  - `strikes/attack-path.ts`.

  This geometry imports only control and core, so the move removes the imports from perception and
  from guard into strikes.
- `segmentDistanceSquared` moves from `perception/openings.ts` to `src/core/math/`.
- `SensedObstacle` moves from `locomotion/navigation/sensed-bounds.ts` to `perception/`.
- `intent/targets.ts` moves to `perception/`: all of it reads the senses.
- `locomotion/arm-swing.ts` gives only the shoulders' flexions, all its one user reads, and stops
  importing the human `GUARD` constant.
- `kit.ts`, `assembly.ts` and `action-config.ts` move into `src/skills/assembly/`.
- **Ranks:** the skills root (`config.ts`) and `framework/` < `reach/` < `perception/` <
  `locomotion/` < `intent/` < `guard/` < `strikes/` < `recovery/` < `assembly/`. `intent/` keeps
  `action-window.ts`: where to stand to act, read from perception and navigation.

Refute: the ranks applied to the commit before this chunk name the framework's imports, and on this
chunk they name nothing.

## 7. Minds in folders

This chunk also lands as two commits: the moves first, then the renames.

**The moves:**

- `src/minds/catalog/`: `config.ts`, `controller.ts`, `entrant.ts`, `catalog.ts`, `description.ts`,
  `config-link.ts`.
- `src/minds/seat/`: `embodiment.ts`, `host.ts`, `physical-body.ts`, `hosted-body.ts`, `sheets.ts`,
  `minds.ts`, `apart.ts` and the writer half of `mirror.ts`. In `MIND_ADAPTERS`, the minds files are
  replaced by the folder; the core files stay listed.
- The root keeps:
  - the mind contract, now including `BodyHost`;
  - the runtime (`mind.ts`, `execution.ts`, `command-layers.ts`, `sub-mind.ts`, the reader half of
    `mirror.ts`);
  - the decision library (`choice.ts`, `engagement.ts`, `report.ts`, `decider.ts`).
- The import loops break:
  - `MindWiring` and `MindMade` move into `controller.ts`;
  - `describeMind` moves into `catalog.ts`;
  - `HostMind` moves into `command-layers.ts`;
  - `sheets.ts` splits into the log and the replay.
- `deriveSpec` moves from `apart.ts` to its only caller, `src/app/apart/thread.ts`. The thread
  transport then stops reaching into skill caches.
- `minds/option/model.ts` and `profile-model.ts` import `../decider.ts` directly, as their siblings
  do, not through the `src/minds/index.ts` barrel.
- **Ranks:** the root < `catalog/` < `seat/` < `option/`, `command/` < `src/minds/index.ts`, the
  published barrel.

**The renames.** Names that read alike get one meaning each:

- `minds.ts` becomes `create-mind.ts`;
- `command-layers.ts` becomes `motor-layers.ts`: its sibling folder `command/` holds the team
  Commanders;
- `hostBody` becomes `takeBody`, beside `bodyHost`;
- `HostMind` becomes `LayersMind`;
- the application's `commandedBody` becomes `stockBody`.

## 8. Names and owners

- **No body is named in control code.** `REPTILE_MOTOR` and `REPTILE_TRAVEL`
  (`src/control/quadruped/tuning.ts`) become `PAW_MOTOR` and `PAW_TRAVEL`: the paw motor fits any
  body on three or more paws.
- **The Option code finds hands and feet from what the body declares.** It stops relying on the
  names `hand.left` and `hand.right` and the `hand.`/`foot.` prefixes (`minds/option/rest.ts`,
  `cover.ts`, `limbs.ts`). The body domain (`src/core/bodies/`) exports the predicate the skills
  share.
- **The stance calibration moves beside the stance envelope it was measured with.**
  `src/app/data/stance-calibration.json` and `src/app/stance-calibration.ts` go under
  `src/skills/locomotion/stance/` and `assets/skills/locomotion/stance/`. The application still
  composes it into `STANCE_BALANCE`. `src/app/stance-balance.ts` moves into `src/app/registration/`
  as `stock-motor.ts`.
- **Control's loose stance files move into `src/control/stance/`.** These are `stance.ts`,
  `stance-tuning.ts`, `stance-envelope.ts` and `stance-balance.ts`. `StanceGoal`, `SwingGoal`,
  `StanceReading` and `StanceEnd` go to `control/stance/goal.ts`, which breaks that folder's import
  loop.
- **One name, one thing:**
  - `framework/support.ts` becomes `low-support.ts` (`LowSupportSkill`);
  - the two functions named `paceToward` get distinct names;
  - so do the two named `kitOf`.

A staged recovery profile's identity reads the calibration's value, not its path. So every identity
and spec digest stays the same; one that moves is a defect in the move.
