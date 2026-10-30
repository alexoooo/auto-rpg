# Working on Auto-RPG

The rules for working here. The game is physically simulated, AI-driven melee in the browser
(Babylon.js 9, vendored Rapier). [README](README.md) says what it is; the
[architecture](docs/architecture.md) how it is built; the [roadmap](docs/roadmap.md) where it is
going.

## Commands

```powershell
npm ci                    # the exact lockfile, never `install`
npm run dev               # http://localhost:5180, strictPort
npm run check             # tsc --noEmit
npm test                  # the gate: step cost, the core's boundary, the Mind and Commander contracts, the probes, script links, no strays
npm run build             # check, then vite build
npm run match -- <a> <b>  # the standard match of two minds: each on each side, one digest
npm run evaluate -- <id>  # an evaluation's cases, played where no row has them; --write keeps a record
npm run evaluate -- baseline <mind>  # one mind's walk, punch, stand-up and fights on the Warrior, a record each
npm run compare -- <before.jsonl> <after.jsonl> --subject <id>  # paired saved evidence, no execution
npm run evaluate -- tournament --mind new.json --previous <mind> --against default --until settled  # the panel report
npm run evaluate -- court --previous duellist --ablate 'actions.thrust=null'  # a skill slot's worth at a battery; with --against, in fights
npm run clean             # delete crash dumps, bytecode and day-old .tmp/ work; list the strays
```

## Checking a change

**Do the work.** The owner sets goals; how to reach them is the agent's. A modelling choice (a
muscle's curve, a joint's range, a solver setting, a bar's test, a plan's own gate) is decided
toward the goal and recorded, never put to the owner. Stop only when the goal is met or no change
is left to try; ask only a choice whose effect in play the owner can judge.

**Speed comes first.** A change is checked for whether it broke the core, not re-qualified.

| Change | Checks |
| --- | --- |
| code | `npm run check` and `npm test`: the whole gate |
| browser code, assets, dependencies, build config | also `npm run build` |
| a refactor that claims no behaviour change | the fingerprint, `scripts/fingerprint.mjs` |
| documents only | the files and anchors they cite, `git diff --check`, the line-ending gate |

- **No measurement unless the question is a measurement.** A feature lands without a battery, a
  reference record, a step-cost reading or a fingerprint. Look in a browser, briefly, when the
  change is something to see; the owner judges motion there.
- **A run answers a decision.** Before it starts, name the question and what each likely answer
  would change; a run whose answers change nothing is not run. No full tournament, re-rating or
  re-calibration for its own sake; nothing measured at length just before a change that moves it.
- **A run plays only what its decision rule reads**, not a script's whole grid: it stops a case at
  the trial that decides it, and searches from the answer's side (the fastest speed down).
- **Screen small, widen where it is close**: one body, one loadout, calm air first; more only where
  the answer is near its limit.
- **Price a run on the pool before it runs**: the first trials' rate projects its wall time; past
  about 10 minutes it is cut or the owner asked. Nothing runs over an hour without the owner's
  go-ahead for that run. What is played is kept as rows and reused.
- **An iteration is one question**: the question and the evaluation that answers it; one
  implementation changed or added for the experiment; a paired reading against the version before
  (`npm run compare` for historical records; `--previous` for live configurations; `npm run match`
  for two minds); kept, or the reason it was not recorded. Git retains old implementations and
  records retain their evidence; a live alternative stays only while an open question uses it.
- **A claim that a skill works is a drill link**: its drill subject's Ratings page at the version
  claimed (`?play=ratings&evaluation=strike&subject=<mind>/<action>&version=<version>`); without
  the link there is no claim.
- **Watch the reel before sending the link**: play the drill's reel (the failures first) in a
  browser and say what was seen, the worst trials included, or that it could not be watched.
- **Only the owner accepts a rung**: numbers are necessary, not sufficient; an agent writes a
  drill's `accepted.json` only with what the owner said, and no agent marks a rung passed.
- **A new test answers a specific need** ([Tests](#tests)), and is fast (under about 10 s).
- **Landing**: name the checks run and any failure left. Commit each landable change as it lands.
- **Work on main.** A new branch only when the owner asks for one.
- **Servers**: leave none running. Port 5180 may be the owner's: never restart or kill it; use
  `npm run preview` on another port and kill it by PID. Killing `npx` leaves `vite` running: find
  the PID with `netstat -ano | findstr :<port>`.
- **Temporary files**: in `.tmp/<task>/`, a worktree in `.tmp/worktrees/<name>/`; nowhere else in
  the working copy, and never hidden through `.git/info/exclude`. Delete them when the task lands;
  `npm run clean` deletes what is a day old. What is kept outside Git (a toolchain, research runs)
  gets its own line in `.gitignore`. `tests/workspace.test.mjs` fails on anything else
  (`scripts/workspace.mjs`).

## Pages

Every page is listed in `vite.config.ts`'s `rollupOptions.input`; one missing there works in dev
and is absent from `dist`.

| Page | Source |
| --- | --- |
| `/` main menu, `?play=tools`, `?play=arena`, `?play=dungeon`, `?play=lab&scenario=`, `?play=ratings` | `src/app.ts`, `src/arena/`, `src/dungeon/`, `src/lab/scenarios.ts`, `src/ratings/` |
| `/character-lab.html` | `src/character-lab/` |
| `/control-foundation.html` | `src/control-foundation/`, `src/core/tasks/` |
| `/control-tasks.html` | `src/control-foundation/tasks.ts` |
| `/physics-bench.html` | `src/physics-bench/`, `research/physics-bakeoff/` |

An Arena link's parameters are its recipe (`src/arena/`); an edited mind travels as its whole
config (`src/ui/mind-link.ts`). The shell mounts one screen at a time, disposes the last explicitly,
and keeps setup choices for the tab; loading runs with physics suspended.

## The core (`src/core/`)

Bodies, muscles, motor control, skills, minds and the rules of a fight. The screens build on it;
it never imports them.

- **The core reaches only itself**, `@babylonjs/core`, its engine's package and JSON under
  `assets/`. `tests/core-boundary.test.mjs` walks the imports and holds the engine's package to
  `src/core/engine/` (`engine.ts` the contract, `engines.ts` the list).
- **Every number in a spec says where it came from**: a `Quantity` read from a `SOURCES` entry
  (`src/core/sources.ts`: a paper, an asset, a measurement, the owner's decision) or derived by a
  named rule that writes no factor. A deleted record is cited
  `path@<commit>`; a spec never spreads another family's. It is bookkeeping, not a bar: a number
  the game wants is set to what gets the result, sourced as the owner's decision.
- **The same arithmetic in every JavaScript engine.** The core, and whatever builds a case's world
  (what the bout's, the Crypt run's and the falls' builders, the Lab's scenarios and each
  evaluation's `cases.ts` reach beside the core, less the Crypt's look), computes with `+ - * /`, `Math.sqrt` and its own functions
  (`src/core/math/real.ts`, `turn.ts`); never `Math.sin` and kin, `Math.hypot`, `Math.pow` or
  `**`, which engines round their own way. The boundary test enforces it (`EXACT_MATH`) and lists
  the Babylon math read and found exact (`EXACT_BABYLON`): read a member's source before adding it.
- **Tuning is immutable.** An experiment passes an override in; nothing mutates a global.
- **A body's level** (`levelsOf`, `src/core/rules/levels.ts`) comes from where the bodies are,
  never from the machine; a body is not rebuilt to save a step.
- **One world step** owns physics, control, combat and the clock at 120 Hz: `World.step`
  (`src/core/world.ts`); a page advances by real time with `World.advance`. `scene.render()`
  never advances the world, and a test never steps by rendering.
- **Solver conditioning is not anatomy**: an iteration count, inertia floor or damping that exists
  for the solver is named so (`SOLVER`, `src/core/engine/rapier.ts`), measured, and kept out of
  the body's numbers.
- **An assist is not anatomy**: a force or moment no muscle gives (`Assist`,
  `src/core/control/assist.ts`), capped by the character's balance (a per cent of body weight,
  `AttributeSpec`, `Rulebook.balance`), metered every step. A figure read under an assist names
  each side's balance.
- **A muscle's strength and speed serve the owner's goal**: sourced where a source pins them, and
  set for the result the owner asked for where none does (sourced as the owner's decision), never
  raised for feel. A change to one carries its measured before/after table.
- **A mind reaches the world only through its body**: its senses (`Senses`,
  `src/core/mind/senses.ts`) and `OwnBody` in; muscle commands and granted grip requests out
  (`Mind.step`, `src/core/mind/equipment-port.ts`). A grip request moves nothing and must pass
  geometric capture; no engine handles, no camera state. A person gives `Orders`; the body's own
  mind carries them out. A mind's maker gets a `BodyHost` (`src/core/mind/host.ts`), never the
  world or the built body; the folders `mind`, `skills`, `control`, `reptile`, `option` and `src/entrants/` import
  no engine, world, builder or read-view maker and read no `globalThis`, `Math.random` or clock
  (chance comes from the host's seed, `BodyHost.seed`), beside the adapters the
  boundary test names.
- **A Commander reaches the world only through its team**: its members' pooled view (`TeamView`,
  `src/core/command/team.ts`) and the level its host answers (`TeamLevel`) in, its members' orders
  out; its memory in `state`. `src/core/command/` imports no engine, world, body, enlistment, mind
  host or senses hub, and reads no `globalThis`.
- **Cosmetics never carry authority.** The visible room is not the collision arena;
  `validateRoomPlacements` (`src/arena/room.ts`) refuses a piece naming a missing collider, and a
  solid-looking piece within reach that names none.
- **Recovery cannot require the support state it exists to restore.**

## Babylon and Rapier

- **Rapier is vendored** (`vendor/rapier`, built from its pinned source and patch; `npm ci`
  installs the tarball). Never swap in the npm SIMD package; the bench keeps npm's plain one.
- **Rapier's wasm loads once a realm**, only through `rapierModule` (`src/core/engine/rapier.ts`):
  two `init`s make two instances, and their worlds cross.
- **Motor impulse**: applied to the joint's first body (the parent); `jointMotorImpulse` reads the
  last substep, `jointMotorStepImpulse` sums the step; the contract converts to the child's sign.
  Neither measures work.
- **Side-effect imports are load-bearing**: the shadow, depth-renderer, post-process and HDR imports
  (`src/arena/scene.ts`, `src/render/post.ts`), the shaders (`src/arena/forge-style.ts`),
  `Culling/ray.js` for `scene.pick`, the glTF loader. Removing an "unused" one breaks at runtime.
- **Read transforms from `mesh.position` and `mesh.rotationQuaternion`.** `getWorldMatrix()` caches
  per render id, so its first reader freezes the frame for every later one. The core may not use
  it or what derives from it (`WORLD_MATRIX_READERS`). From a console, `computeWorldMatrix(true)`.
- **Turn a vector with `applyRotationQuaternionToRef`**, never `rotateByQuaternionToRef` (a float32
  matrix: 1e-8 m of noise per point).
- **A fast chain's controller asks for the motion under way** (`bias` in `bodyDynamics`,
  `src/core/build/dynamics.ts`, gyroscopic torque included).
- **A joint's angles are the ones its limit reads** (`jointAngles`,
  `src/core/build/joint-state.ts`); press a limit before trusting a reading.
- **Build a jointed body in the pose its joints demand**, or the solver flings it.
- **Bodies never sleep** (a sleeping body reads a perfect zero); **linear velocity is the centre of
  mass's**, not the node's.
- **Zero self-contacts proves only that no pair was admitted**: measure clearance geometrically.
  Adjacent capsules overlap at their joints by construction.
- **Materials belong to the scene**: a body part disposes with `dispose(false, false)`.
- **Pointer events only.** Read `event.buttons` (release events are not guaranteed). A DOM control
  over the canvas stops `pointerdown` and `pointermove`, lets `pointerup` through, and blurs on
  click.
- **Observers are removed asynchronously**: count the active ones, not the calls to remove.

## In a browser

- **A hidden tab does not render** (no paint, no `requestAnimationFrame`, `scene.pick` misses).
  Check `document.visibilityState` and that `engine.frameId` moves; from a background tab step
  `__arena.world.step()` and call `scene.render()` yourself.
- **Look before probing.** `Material.isReady(mesh)` is false outside a render pass;
  `scene.materials` is incomplete (use `mesh.material`); after a hot reload, navigate.

## Tests

The gate (`npm test`, every `tests/*.test.mjs`) holds eight contracts: the step's time and
allocation (`tests/core-step-cost.test.mjs`), the core's imports and arithmetic
(`tests/core-boundary.test.mjs`), what a Mind may read and do (`tests/mind-contract.test.mjs`),
what a Commander may (`tests/command-contract.test.mjs`), a part of each converted role swapped in
from outside `src/` by configuration alone (`tests/swap.test.mjs`), each legs, balance and motor
doing or reporting every term of the body layer's vocabulary (`tests/probes.test.mjs`), research
scripts and scripts importing what exists (`tests/script-links.test.mjs`) and a working copy with
no stray files (`tests/workspace.test.mjs`).

- **Tests are a liability; less is more.** A test is added only for a specific need, such as
  reproducing a bug that has been found, never casually or for coverage.
- **A test catches a class of problems**, not one instance: it is general enough that the next
  defect of the kind fails it too.
- **A test that asserts an ephemeral value is debt**: a tuned number, a trajectory, a default, a
  count that moves with the next change. How well a mind plays is a match or a rating, never a
  test.
- **Test the contract**: inputs, outputs, what can be observed. Rules and replay are held to exact
  equality; replay of recorded inputs needs no mind. A physical outcome is judged in its task's
  units and limits, never against the last run's trajectory.
- **A fixture that did not reach its case says so** before the asserts run. Windows are found
  from what the run saw; bouts are capped.
- **A saved world loads only into a world built as it was**: a fixture is a recipe or a placed
  pose, not stored bytes.
- **Never green by relaxing**: no eased threshold, easier seed, hidden assist or regenerated
  expectation. Name what is red (a broken contract, an unmet goal, an invalid fixture, a broken
  test) and fix that; retire an assertion only with its requirement kept elsewhere.
  A red physical check says the recipe, seed, condition and value against its limit.
- **A green test can assert nothing**: assert whole records; choose a fixture that can show the
  defect. **Test the whole path**, not its two ends.
- **Node imports `src/` directly**: relative imports carry `.ts`, and no TypeScript parameter
  properties.
- **The headless stand** (`tests/harness/core-stand.mjs`): `coreStand(spec)` builds one body on a
  ground; `createWorld(scene, await freshEngine())` a bare world. `CORE_ENGINE=<name>` picks
  another engine.
- **Parallel runs need worker threads.** Under CPU load a dropped test count is a timeout, not a
  regression: re-run on a quiet machine.

## Competing minds

- **A Mind is an entrant**: `src/entrants/<name>/`, its manifest (`index.ts`: presets, its own
  parts and kinds, scoped `<name>:`) a line in `ENTRANTS` (`src/entrants/index.ts`), its data under
  `assets/entrants/<name>/`; it imports the core and itself, never another entrant. What it may read
  and do is the architecture's (Adding an entrant), held by `tests/core-boundary.test.mjs` and
  `tests/mind-contract.test.mjs`.
- **An entrant's change touches its own files and its registry line**;
  `node scripts/entrant-check.mjs` names a change an entrant's, the toolkit's or mixed.
- **A toolkit change** (to what Minds are built on) is read with the fingerprint against the
  commit before it, and its message names the moved cases.
- **Compare minds alike**: the same scenarios, bodies, physics, permissions, assists and
  scoring; results by opponent; fresh cases to confirm a gain; repeated trials where decisions
  vary. A seed names conditions, not a mind's choices.
- **A claim is a match**: `npm run match -- <a> <b>` (`src/evaluation/match/`) gives the protocol,
  commit, each mind's digest and the match's. Bouts are the same on every machine; a figure from
  another commit or protocol is read again before it is compared.

## Measurement

When the question is a measurement:

- **Name the harness** of every figure (Node stand or page, engine, rate). An arena bout and a
  crypt run are the same in both to the bit; a fall and a lab scenario compute as exactly, unread
  on a page.
- **Say whether a peak was driven or struck**; exclude startup and the time after a contact.
- **Read the faster physics rate at the slower one's spacing** before calling a difference physical.
- **Believe the stand over the fight**: a flung weapon improves every bout column.
- **A conclusion is void once its reference is corrected**: keep the argument, measure again.
- **Counts over a bout are not scale-free**: prefer a rate or more bouts; never one seed.
- **A stand-up** is read on the owner's target ([rising](docs/reference/rising.md#the-owners-target));
  assisted recovery cannot satisfy it. Failures and rejected external actuation are reported as
  failures; passing checks and a better battery are not completion.

## Code

- **Comments say what the code is**, and why where not obvious, in the present tense. Never work
  sessions, plan stages, commit hashes, dates of change, what the code used to do, or what no
  longer exists. The story goes in the commit message.
- **A tuned constant of the body or the rules** (`src/core/spec`, `human`, `muscle`, `build`,
  `items`, `rules`) cites a `SOURCES` entry or a `docs/reference/` section that names it.
  Elsewhere a constant's comment says what it does.
- **Name the construct, not a line number.** A comment about a code path is a hypothesis until
  the path has run.
- **Switch on a union with a `never` default.**
- **An expected refusal is a returned value.** A throw is a defect: no catch decides what the
  game does from one. A catch at a reporting boundary (a fault shown as a sentence, a failed
  asset load) keeps the error's message and catches only what it reports.
- **A flag fixed for a caller is set when it builds.** Construction takes it, named; a call passes
  only what changes from call to call. No bare boolean positionals.
- **A module that owns a rule exports its predicate.** A copy that names its fields drops the ones
  added later.
- **A published field needs a reader**, or a named one that is coming, written down. **An export
  needs an importer**; a test or a script is one.
- **What changes step to step is plain data in one `state` object** per module
  (`src/core/state.ts`), hung on the bout's, so a bout forks by copying its state.
  A body, a node or a function is not state; a constant a state points at is frozen.
- **The step's dear functions work in arrays made once**, which carry nothing between calls and
  no two bodies share; a speed rewrite does the same operations
  in the same order, moves no fingerprint, and lands with its time read before and after
  (`docs/reference/step-cost.md`, `tests/core-step-cost.test.mjs`).
- **A screen is an explicit argument**, never inferred from a state machine. Pause freezes the
  world, not the camera, and opens only its own panel.
- **Two watchers on one body**: set a flag in the callback; act on it at the next control step.

## Documents

Each document has one job. A wrong document is corrected or deleted, not annotated; a change
updates the documents it makes wrong.

| Document | Holds | Shape |
| --- | --- | --- |
| `README.md` | the game for people: play, run, where things are | short sections, tables |
| `AGENTS.md` | rules for working here | one rule a bullet |
| `docs/architecture.md` | how it is built, now: each layer's job, files, contracts | a section a layer |
| `docs/roadmap.md` | direction; the order of plans in flight; what waits on the owner; open items by layer | one line an item |
| `docs/plans/` | only work the owner asks for, over several sessions, in flight; deleted when it lands | Why, steps with checks, Done when |
| `docs/reference/` | records code cites, and measurements the owner asked for | summary; what is used; measurement; tried and not kept |
| `docs/analysis/` | the study behind a decision still open, named by date; deleted once decided | question, options, findings, answer |
| `docs/art/` | how the art is made and rebuilt | source, rebuild, rules |
| `docs/diagrams/` | the design drawn; each page says whether it shows now or a target | a self-contained HTML page |

- **Lead with the answer**; short paragraphs, lists and tables; present tense; say a thing once
  and link to the document that owns it.
- **No history in prose** ("first we tried, then"); the commit or harness a figure was read at is
  provenance and stays.
- **Status lives in the roadmap**, findings in reference records; code and comments never cite a
  plan or an analysis.
- **A cited heading is a contract**: code cites `docs/<file>.md#<anchor>`; the anchor exists, and
  a constant's section names the constant.

## Line endings

The clone has `core.autocrlf = true`; the repository is LF. Gate a commit on `git diff --numstat`
equalling `git diff --ignore-cr-at-eol --numstat`: a file where they differ has had its endings
rewritten. `.gitattributes` keeps shell scripts and patches LF in every working copy.
