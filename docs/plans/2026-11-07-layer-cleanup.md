# Layer cleanup

## Goal

Make each layer's insides follow the same rule as the layers themselves: general code does not
import specific code. `scripts/source-boundary.mjs` checks only that a module imports its own layer
or a lower one, so inside a layer anything may import anything. Three places break the rule there:

- **`src/skills/framework/` depends on the capabilities built on it.** It imports `skills/intent/`
  and `skills/locomotion/` in about twenty places, and both import it back. The role contracts it
  needs live inside implementation files: `Locomotion`, `LegsDrive` and `LocomotionContext` in the
  human stance walk (`locomotion/locomotion.ts`), `Clearance` in `navigation/clear-step.ts`,
  `GaitName` in `gaits.ts`, `Navigator`, `NavigationSight` and `NavigationReport` in
  `navigation/navigator.ts`, `GaitLimits` in `intent/travel.ts`.
- **`src/minds/` is four groups in one flat folder**: seating a mind in the world, the mind-side
  runtime, the catalog, and the decision library. `MIND_ADAPTERS` in `tests/core-boundary.test.mjs`
  names by file which modules may touch the world, and the catalog and seat files import each
  other's types.
- **Game and evaluation share one layer index**, so either may import the other. Evaluation imports
  game; game never imports evaluation.

Each chunk below lands as its own commit, with the checks its change needs (AGENTS.md, "Checks by
change"). A chunk that moves or renames code claims no behaviour change, so it also runs
`node scripts/fingerprint.mjs` before and after. Each chunk ends by trying to refute itself: search
for the old name or path across `src/`, `tests/`, `research/`, `scripts/` and `docs/` and find none.

## 1. Delete what nothing uses

- `hostedMind` (`src/minds/minds.ts`) and the sentence citing it in `src/minds/host.ts`. Its only
  caller is an untracked script under `research/runs/` that imports a deleted path.
- `src/app/option-defaults.ts` is the same code as `src/entrants/option/options.ts`. The application
  keeps one; `OPTION_MIND` imports it.
- Exports with no importer in `src/`, `tests/`, `research/` or `scripts/`: about 320, listed by a
  TypeScript walk over every import and re-export (`export *` included). Keep `declare module`
  augmentation targets (`DataOf`, `RoleParts`, the `*Configs` maps). An export used only in its
  own file loses the `export` keyword. A whole symbol no one uses is deleted, for example
  `checkedMotionCommand`, `JointStopSettings`, `remainingOf`, `lowOpponent`, `solve3`,
  `fixedSolve`, `boundedLeastSquares`, `HUMAN_PARENTS`, `GAIT_NAMES` and `toggle`.
- The published entry points (`PUBLISHED`) re-export names no entrant imports: about 25 in
  `src/minds/option/index.ts`, 14 in `src/parts/index.ts`, 11 in `src/minds/index.ts`. A name stays
  published only if an entrant would need it to build a mind; the rest are dropped from the barrel.
- `src/app/browser/evaluation.ts` exports 58 names and one is imported; `src/app/browser/game.ts`
  re-exports five game modules no page reads. Both export only what pages import.
- Shims with one caller fold into it: `src/app/commanders.ts`, `src/app/recovery-leg-adapters.ts`,
  `src/app/recovery-selections.ts`, `src/minds/option/down.ts`.

Check: `npm run check`, `npm test`, `npm run build`, the fingerprint.

## 2. Skills contracts in the framework

- The role contracts listed under Goal move into `src/skills/framework/`, next to `guard.ts` and
  `support.ts`, which already follow that pattern. So do `Intent`, `Cover`, `MovementRequest`,
  `GroundPoint`, `directMovement`, `Aimed`, `Estimate` and `EstimateUnit`, and `MindKit` from
  `src/skills/kit.ts`.
- `framework/menu.ts` stops calling `windowSpot`, which pulls in perception and navigation.
  `assembly.ts` passes the spot in, or the readers compute it as `minds/option/strike.ts` already
  does.
- `intent/orders.ts`, `ordered.ts` and `cover-hand.ts` move to `src/minds/`: no skill imports
  them. `intent/conditions.ts` and `intent/travel.ts` move to `src/skills/locomotion/`.
- The hand and reach geometry in `strikes/` (`handConfiguration` and `aimOf` in `held-strike.ts`,
  `arm-reach.ts`, `attack-path.ts`) imports only control and core. It moves to a leaf folder
  `src/skills/reach/`, which removes the perception-to-strikes and guard-to-strikes imports.
- `segmentDistanceSquared` moves from `perception/openings.ts` to `src/core/math/`; `SensedObstacle`
  moves to perception; `nearestFoe` moves from `intent/targets.ts` to perception.
- `locomotion/arm-swing.ts` reads the guard's posture through `GuardSkill` instead of importing
  the human `GUARD` constant.
- `kit.ts`, `assembly.ts` and `action-config.ts` move into `src/skills/assembly/`.
- `PUBLISHED` follows any published file that moves.

Check: as chunk 1. Refute: `framework/` imports nothing from another skills folder.

## 3. Minds in folders

- `src/minds/seat/`: the world side (`embodiment.ts`, `host.ts`, `physical-body.ts`,
  `hosted-body.ts`, `sheets.ts`, `minds.ts`, the writer half of `mirror.ts`). `MIND_ADAPTERS`
  becomes the folder rule; `mirrorBody` keeps its own exemption while it reads
  `core/bodies/build/configurations.ts`.
- `src/minds/catalog/`: `config.ts`, `controller.ts`, `entrant.ts`, `catalog.ts`, `description.ts`,
  `config-link.ts`.
- The mind contract, its runtime (`mind.ts`, `execution.ts`, `command-layers.ts`, `sub-mind.ts`) and
  the decision library (`choice.ts`, `engagement.ts`, `report.ts`, `decider.ts`) stay at the root.
- Type loops break: `MindWiring` and `MindMade` move into `controller.ts`, `describeMind` into
  `catalog.ts`, `HostMind` into `command-layers.ts`; `sheets.ts` splits into the log and the replay.
- `deriveSpec` moves from `apart.ts` to its only caller, `src/app/apart/thread.ts`, so the thread
  transport stops reaching into skill caches.
- `minds/option/model.ts` and `profile-model.ts` import `../decider.ts` directly, like their
  siblings, instead of the `src/minds/index.ts` barrel.
- Names that read alike get one meaning each: `minds.ts` becomes `create-mind.ts`,
  `command-layers.ts` becomes `motor-layers.ts` (the sibling `command/` is team Commanders),
  `hostBody` becomes `takeBody` beside `bodyHost`, `HostMind` becomes `LayersMind`, and the
  application's `commandedBody` gets a name of its own (`stockBody`).

Check: as chunk 1, plus the six worker and fork cases (Option sword and hands, seeded Bare, the
three registered entrants) matching in-process at one and two Mind workers.

## 4. Order inside the layers

- `LAYERS` in `scripts/source-boundary.mjs` gains ranks inside core
  (math < physics < bodies < world, data) and inside skills
  (framework and `config.ts` < reach < perception < locomotion < guard < strikes < recovery <
  assembly).
- Evaluation becomes the layer above game; the gate then refuses game importing evaluation.
- The tuple `Vec3` and `Quantity` move from `src/core/bodies/spec/quantity.ts` to `src/core/math/`,
  and gravity and friction constants with them, so physics does not import bodies.
- `GameContext` moves from `src/game/arena/context.ts` to `src/game/context.ts`: the dungeon and
  the Lab read it too.

Check: as chunk 1. Refute: the gate run on the commit before chunk 2 names the framework's imports.

## 5. Names and owners

- `REPTILE_MOTOR` and `REPTILE_TRAVEL` (`src/control/quadruped/tuning.ts`) become `PAW_MOTOR` and
  `PAW_TRAVEL`: the paw motor fits any body on three or more paws.
- The Option code finds hands and feet from what the body declares, not from the names
  `hand.left`, `hand.right` and the `hand.`/`foot.` prefixes (`minds/option/rest.ts`, `cover.ts`,
  `limbs.ts`). The body domain (`src/core/bodies/`) exports the predicate the skills share.
- The stance calibration (`src/app/data/stance-calibration.json` and `src/app/stance-calibration.ts`)
  moves beside the stance envelope it was measured with, under `src/skills/locomotion/stance/` and
  `assets/skills/locomotion/stance/`. The application keeps composing it into `STANCE_BALANCE`.
  `src/app/stance-balance.ts` moves into `src/app/registration/` as `stock-motor.ts`.
- The loose stance files in control (`stance.ts`, `stance-tuning.ts`, `stance-envelope.ts`,
  `stance-balance.ts`) move into `src/control/stance/`; `StanceGoal`, `SwingGoal`, `StanceReading` and
  `StanceEnd` go to `control/stance/goal.ts`, which breaks that folder's type loop.
- One name, one thing: `framework/support.ts` becomes `low-support.ts` (`LowSupportSkill`); the two
  `paceToward` and the two `kitOf` get distinct names.

Check: as chunk 1. Moving the calibration must leave every staged recovery profile identity and
spec digest unchanged; a moved identity is a defect in the move.

## 6. Documents

Each chunk corrects the documents it makes wrong. Already wrong now:

- `docs/architecture.md`: the Skills row misses `guard/`, `intent/` and `perception/`; the
  registration list misses executors, locomotions and move rules; "Game and evaluation are peers"
  becomes "evaluation builds on game"; `assets/entrants/<name>/` is described as existing but no
  entrant has data yet.
- `docs/roadmap.md` names the layers "framework, motor control, skills, minds, command"; it links
  the architecture's layers instead.
- `assets/forge/README.md` cites `src/arena/forge-*.ts`, now under `src/app/browser/arena/`.

Check: `node --test tests/documents.test.mjs`, `git diff --check`, the line-ending gate.
