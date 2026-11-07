# Working on Auto-RPG

The rules for working here. [README](README.md) says what the game is; the
[architecture](docs/architecture.md) how it is built; the [roadmap](docs/roadmap.md) where it is
going.

## Commands

```powershell
npm ci                    # the exact lockfile, never `install`
npm run dev               # http://localhost:5180
npm run check             # type-check
npm test                  # the gate
npm run build             # type-check, then the bundle
npm run pull:merge        # fetch, merge, validate once, commit; -- --continue after resolving conflicts
npm run match -- <a> <b>  # two minds, each on each side, one digest
npm run evaluate -- <id>  # an evaluation's cases where no row has them; --write keeps a record
npm run evaluate -- table [--play] [--baseline]   # every body, loadout and skill: met or short, or against its baseline
npm run compare -- <before.jsonl> <after.jsonl> --subject <id>  # paired saved evidence
npm run clean             # delete crash dumps, bytecode and day-old .tmp/ work; list the strays
node scripts/fingerprint.mjs          # what the game computes, before and after a refactor
```

## Doing the work

- **The owner sets goals; how to reach them is the agent's.** A modelling choice (a muscle's
  curve, a joint's range, a solver setting, a bar's test) is decided toward the goal, never put to
  the owner. Stop only when the goal is met, no change is left to try, or the four-hour ceiling
  below is reached; ask only a choice whose effect in play the owner can judge.
- **Checks by change**: code, `npm run check` and `npm test`; browser code, assets, dependencies
  or build config, also `npm run build`; a refactor claiming no behaviour change, the fingerprint;
  prose-only documents, `node --test tests/documents.test.mjs` (the links), `git diff --check`
  and the line-ending gate. Run only these gates for prose-only changes; executable examples,
  commands or configuration changes also get the checks their behaviour requires.
- **No measurement unless the question is a measurement.** A feature lands without a battery or a
  fingerprint. Look in a browser, briefly, when the change is something to see.
- **A run answers a decision**: name the question and what each answer would change first. Play
  only what the decision reads; screen small (one body, one loadout, calm air) and widen where it
  is close. Price a run from its first trials (a training run from its first chunk's rate, never
  its first returns). Keep what is played as rows and reuse them.
- **Keep going without asking.** No run, training block or search waits for the owner's
  approval, however long it takes. A progress report, each hour with paired readings, is a
  message and never a pause; the owner interrupts when they want something else.
- **Do not spin.** A direction without a kept gain is changed: a training run at the recipe's
  plateau, any other work after an hour of tries. A training run whose screened checkpoints
  still improve is progress. After four hours without a kept gain toward the goal, whatever the
  directions tried, stop: put the best reading and what was tried in the plan, and report.
- **Training follows [the training recipe](docs/recipes/training.md)**: one actor a skill, a run
  of millions of decisions, checkpoints chosen on the evaluation's cases, a retrain after any
  change under the actor. Work of a kind that has a recipe in `docs/recipes/` follows it.
- **An iteration is one question**: one implementation changed, read paired against the one
  before (`npm run compare`, `--previous`, `npm run match`), kept or dropped with the reason in the
  commit message. A live alternative stays only while an open question uses it.
- **A claim that a skill works is a drill link**
  (`?play=ratings&evaluation=strike&subject=<mind>/<skill>&version=<version>`), sent after
  watching its reel, failures first, and saying what was seen.
- **Only the owner accepts a rung**: an agent writes a drill's `accepted.json` only with what the
  owner said.
- **Landing**: name the checks run and any failure left; commit each landable change on main. A
  branch only when the owner asks. Never push unless asked.
- **Pull and merge** with `npm run pull:merge`; resolve conflicts by meaning, stage only those
  files and `-- --continue`. Never stash or commit unrelated work.
- **Servers**: leave none running. Port 5180 may be the owner's: never restart or kill it; use
  `npm run preview` on another port and kill it by PID (`netstat -ano | findstr :<port>`; killing
  `npx` leaves `vite` running).
- **Temporary files** in `.tmp/<task>/`, worktrees in `.tmp/worktrees/<name>/`; deleted when the
  task lands. Something kept outside Git gets its own `.gitignore` line. `tests/workspace.test.mjs`.
- **A run's output goes to `.tmp/<task>/`**: checkpoints, traces, screens, rejected candidates.
  `research/runs/<task>/` keeps only what a later run reads (a selected model with its
  normalisation and configuration, rows a comparison reuses) and a README naming each file. A
  dropped experiment keeps nothing; its reading goes in the commit message. A folder there over
  1,000 files or 1 GB fails `tests/workspace.test.mjs`.

## Writing

| Document | Holds |
| --- | --- |
| `README.md` | what the game is, its screens, how to run it |
| `AGENTS.md` | commands, rules no test enforces, the traps that have bitten |
| `docs/architecture.md` | the layers, their contracts, where each lives |
| `docs/roadmap.md` | current goals and open items, one line each; the plans in flight |
| `docs/plans/` | work the owner asked for over several sessions, in flight; deleted when it lands |
| `docs/analysis/` | the study behind a decision still open; deleted once decided |
| `docs/diagrams/` | pages showing the current design, or a target a plan in flight names |
| `docs/reference/` | only what code needs and a comment cannot hold |
| `docs/recipes/` | how a kind of work is done: its steps in order, budgets and traps |
| `docs/art/`, asset and vendor READMEs | where each asset comes from and how to rebuild it |

- **Every sentence is true of the code now, something a reader acts on, and said once.** Plain
  technical English, the present tense. No dates, session or step numbers, commit hashes, owner
  quotes, comparisons to other games, "there is no X", or what used to be. A paper or an asset
  path is provenance and stays. The story of a change, its before/after tables included, goes in
  the commit message.
- **A number cites a document only when it comes from a paper or an asset.** A value tuned for a
  result says in one line what it does, and has no record.
- **A reference record holds what code uses**: no history, no "tried and not kept". A deleted
  record is not cited, `path@commit` included.
- **Comments say what the code is**, and why where not obvious. Name the construct, not a line
  number. A comment about a code path is a hypothesis until the path has run.
- **What worked is kept**: before a plan is deleted, the steps, settings and budgets that met
  its goal go into the recipe for that kind of work. A recipe step that misled a run is
  corrected in the same change.
- **A wrong document is corrected or deleted**, not annotated; a change updates the documents it
  makes wrong. Status lives in the roadmap; code never cites a plan or an analysis.
- Links and anchors resolve; `src/` comments carry no dates, hashes, plan citations or "the owner":
  `tests/documents.test.mjs`.

## Simulation and source boundaries

- Responsibility, runtime and public API boundaries cover every source module:
  `scripts/source-boundary.mjs`, held by `tests/core-boundary.test.mjs`. Runtime-neutral code stays
  outside `node/` and `browser/`; application composition supplies catalogs and adapters. The same
  gate checks exact arithmetic (`EXACT_MATH`), engine access and what a Mind may read and do.
- **Simulation code uses the core's vectors** and plain poses; drawing code uses Babylon's, and a
  page poses a puppet from the simulated poses. A module that does both is split.
- **A spec's number is a `Quantity`** read from a `SOURCES` entry (`src/core/sources.ts`: a paper,
  an asset, or tuned with what it is set for) or derived by a named rule that writes no factor.
  A spec never spreads another family's.
- **Tuning is immutable**: an experiment passes an override in; nothing mutates a global.
- **One world step** (`World.step`, 120 Hz) owns physics, the clock and the order of its hooks;
  minds, control and blows run as hooks. A page advances by real time (`World.advance`). `scene.render()` never advances the world, and a test
  never steps by rendering.
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
- **Recovery cannot require the support state it exists to restore.**
- **A stand-up** is read on the [owner's target](docs/reference/rising.md#the-owners-target);
  assisted recovery cannot satisfy it.

## Code

- **Switch on a union with a `never` default.**
- **An expected refusal is a returned value.** A throw is a defect; a catch only at a reporting
  boundary, keeping the error's message.
- **A flag fixed for a caller is set when it builds**; no bare boolean positionals.
- **A module that owns a rule exports its predicate.** A published field needs a reader; an
  export needs an importer.
- **What changes step to step is plain data in one `state` object** per module
  (`src/core/state.ts`), so a bout forks by copying its state; a constant a state points at is
  frozen.
- **The step's dear functions work in arrays made once**; a speed rewrite does the same
  operations in the same order, moves no fingerprint, and reads its time before and after
  ([step cost](docs/reference/step-cost.md)).
- **A screen is an explicit argument**, never inferred from a state machine. Pause freezes the
  world, not the camera.
- **Two watchers on one body**: set a flag in the callback; act on it at the next control step.
- **Every page is in `vite.config.ts`'s `rollupOptions.input`**; one missing works in dev and is
  absent from `dist`.

## Babylon and Rapier

- **Rapier is vendored** (`vendor/rapier`); never the npm SIMD package. Its wasm loads once a realm,
  only through `rapierModule`: two `init`s make two instances whose worlds cross.
- **Motor impulse** is applied to the joint's parent; `jointMotorImpulse` reads the last substep,
  `jointMotorStepImpulse` sums the step. Neither measures work.
- **Side-effect imports are load-bearing** (shadows, depth renderer, post-process, HDR, shaders,
  `Culling/ray.js` for `scene.pick`, the glTF loader).
- **Read a mesh's transform from `position` and `rotationQuaternion`**: `getWorldMatrix()` caches
  per render id. Turn a vector with `applyRotationQuaternionToRef`, never `rotateByQuaternionToRef`.
- **A joint's angles are the ones its limit reads** (`jointAngles`); press a limit before trusting
  a reading. **Build a jointed body in the pose its joints demand**, or the solver flings it.
- **A fast chain's controller asks for the motion under way** (`bias` in `bodyDynamics`,
  gyroscopic torque included).
- **Bodies never sleep**; **linear velocity is the centre of mass's**, not the node's.
- **Zero self-contacts proves only that no pair was admitted**: measure clearance geometrically.
- **Materials belong to the scene**: a body part disposes with `dispose(false, false)`.
- **Pointer events only**; read `event.buttons`. A DOM control over the canvas stops `pointerdown`
  and `pointermove`, lets `pointerup` through, and blurs on click.
- **Observers are removed asynchronously**: count the active ones, not the calls to remove.

## In a browser

- **A hidden tab does not render**: check `document.visibilityState` and that `engine.frameId`
  moves.
- **The Arena's, crowd's and Crypt's worlds are in workers**: `await __arena.step(n)` (or
  `__crowd`, `__dungeon`) steps and draws; `__arena.world.tape()`, `__arena.verdict` and
  `__dungeon.run` read the state.
- `Material.isReady(mesh)` is false outside a render pass; use `mesh.material`, not
  `scene.materials`; after a hot reload, navigate.

## Tests

- **Tests are a liability; less is more.** Each retained case has a concrete failure and a reason
  capability drills or existing diagnostics do not establish it, in [the test inventory](tests/README.md).
  Skill behaviour belongs in drills and paired evaluations; allocation profiling and broad replay
  batteries are explicit diagnostics. No test file has a blanket exemption. A new test reproduces
  a concrete observed regression: its commit names the failure and the broken code on which it
  fails. A new feature, a contract by itself or an artificial mutant is not a reason to add one.
  Keep it under about 10 s; how well a mind plays is a match, not a test.
- **Test the contract**: inputs, outputs, what can be observed; never a tuned number or a last
  run's trajectory. Rules and replay are held to exact equality.
- **A fixture that did not reach its case says so** before the asserts; bouts are capped. A
  fixture is a recipe or a placed pose, not stored bytes.
- **A green test can assert nothing**: assert whole records, with a fixture that can show the
  defect, along the whole path.
- **Never green by relaxing**: no eased threshold, easier seed or regenerated expectation. A red
  physical check names its recipe, seed, condition and value against its limit.
- **Node imports `src/` directly**: relative imports carry `.ts`; no parameter properties. The
  headless stand is `tests/harness/core-stand.mjs`.
- **Under CPU load a dropped test count is a timeout**, not a regression: re-run on a quiet
  machine.

## Minds and measurement

- **A Mind is an entrant** (`src/entrants/<name>/`, a line in `ENTRANTS`); it imports published library APIs and
  itself, never another entrant. The registry is `src/app/entrants.ts`. `node scripts/entrant-check.mjs` names a change an entrant's, the
  toolkit's or mixed; an entrant's change touches its own files and its registry line; a toolkit
  change names its moved fingerprint cases.
- **Compare minds alike**: the same scenarios, bodies, physics, assists and scoring, results by
  opponent, fresh cases to confirm a gain. A claim is `npm run match`; a figure from another
  commit or protocol is read again before it is compared.
- **Name the harness** of every figure (Node stand or page, engine, rate); say whether a peak was
  driven or struck; read the faster physics rate at the slower one's spacing; believe the stand
  over the fight; never one seed. A conclusion is void once its reference is corrected.
- **Failures are reported as failures**: passing checks and a better battery are not completion.

## Developing skills and Options

- **A bug is fixed to its own layer's contract** (a step lands, a walk stops where it was asked),
  never judged by a reading above it; what the fix breaks above is a defect there, fixed next in
  the same push. A table cell that drops meanwhile is named in the commit.
- **What a change is judged on**: a record or a variant on its own body; a shared piece on every
  body. A body a shared change sets back is searched again on the new code first; a setback that
  remains is a defect in its path or the reason it gets a record or a variant of its own, never
  the reason to reject the change.
- **Stand-up and the run are met or short** on their definitions; no push ends with either set
  back. **Every other cell is read against its baseline** (its first reading when its work begins,
  kept with `npm run evaluate -- table --baseline`) and raised by paired readings against the
  version before: a gain is kept, a loss is not. A cell's work gets a search or training run,
  following the run-review rule above, and the fixes of the bugs it exposes; where an
  iteration brings no gain, its best is kept and its ceiling named from a reading (the body, the
  controller or the drill).
- **The person's figures are a scale** (`BAR`, `src/evaluation/strike/read.ts`), reported beside
  each reading; they gate nothing.
- **No Option makes its body fall** unless its design states it, its fall rate by outcome measured
  into its profile; any other fall is a defect.
- **One act an Option**: one skill used one way, its limbs, target and aim; what blows share is
  code the Options call, never a kind of Option that makes one of each.
- **No body is named in control code**: settings are a record per
  body (`SkillRecord`, `recordFault`); other logic for a body is a skill only that body fits.

## Line endings

The clone has `core.autocrlf = true`; the repository is LF. Gate a commit on `git diff --numstat`
equalling `git diff --ignore-cr-at-eol --numstat`.
