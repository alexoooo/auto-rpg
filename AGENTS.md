# Working on Auto-RPG

The rules every change keeps. [README](README.md) says what the game is; the
[architecture](docs/architecture.md) how it is built; the [roadmap](docs/roadmap.md) what is in
work now and what is next.

## Commands

```powershell
npm ci                    # the exact lockfile, never `install`
npm run dev               # http://localhost:5180
npm run check             # type-check
npm test                  # the gate
npm run build             # type-check, then the bundle
npm run pull:merge        # fetch, merge, validate once, commit; -- --continue after resolving conflicts
npm run match -- <a> <b>  # two minds, each on each side, one digest
npm run evaluate -- <id>  # an evaluation's cases where no row has them; --write keeps its results
npm run evaluate -- table                         # the grid from saved results: every cell's value against its baseline; plays nothing
npm run evaluate -- table --body <model> --skill <name> [--by <field>]   # a row's lines from saved results, its outcomes by a condition's field; plays nothing
npm run evaluate -- table [--play] [--baseline]   # --play plays only what has no result; --baseline names a cell's first reading
npm run evaluate -- table --body <model> --skill <name> [--loadout <left,right>] --fresh   # one cell or row, played again on the code now
npm run clean             # delete crash dumps, bytecode and day-old .tmp/ work; list the strays
node scripts/fingerprint.mjs          # what the game computes, before and after a refactor
```

## Doing the work

- **The owner sets goals; how to reach them is the agent's.** A modelling choice (a muscle's
  curve, a joint's range, a solver setting, a bar's test) is decided toward the goal, never put to
  the owner. Stop only when the goal is met or no approach that can work is left to try; ask only a choice whose effect in play the owner can judge.
- **Only what the owner asks is built or offered.** Work starts on the owner's request: a quoted
  passage, a written plan or an answered choice is not one, and an ambiguous message is asked
  about before code is touched. A plan's own step naming a skill is not a request for it; what the
  owner rejects is removed exactly, nothing wider.
- **A rule is general.** A rule here covers every skill, body and approach; what holds for one
  skill belongs in its plan or record. The simplest rule that works is chosen, and a rule that
  fails a new case is changed, never given an exception. A principle the owner states is applied
  by finding every place the old rule lives, documents and code, and changing them all; an
  exception needs the owner's own words.
- **A defect is fixed at its root cause, in the code**: never a bandaid, and never a hook, a CI
  step or a process unless the owner asks for one.
- **Every failure in the working copy is the agent's**: a red gate, a stray file or a crash dump
  is fixed in the same task, never reported as pre-existing.
- **Skill work follows [the skill recipe](docs/recipes/skill.md)**: a change to a skill, an
  Option, a body's control, a training run or a table cell. Read it before starting; its rules
  bind as these do: one row of the table at a time, an approach checked against
  [the approaches](docs/approaches.md), a change kept on the skill's value, a claim that is its
  table cell checked by a fresh agent. Training follows
  [the training recipe](docs/recipes/training.md). Work of a kind that has a recipe in
  `docs/recipes/` follows it.
- **What works is not deleted as cruft**: a capability goes only after a reading on the game's
  cases shows what replaces it does as well. A change under a body (anatomy, engine, rate, timing)
  reads every skill on it in the same change, and its commit names each loss.
- **A structural claim is a code search**: before reporting that a path is gone, a mechanism is
  general or a request is done, search the code and quote what the search shows, with what is not
  done. An idea is searched for in `git log` before it is offered as new.
- **Saved work is carried forward**: results are read again by their commit, never recomputed
  wholesale; a change that would void saved work says its price before it is made.
- **Speed is working results sooner**: a check that shows a change works (the table cell, the
  fresh agent, the fingerprint) is never dropped to save time; time is saved on everything else.
- **Checks by change**: code, `npm run check` and `npm test`; browser code, assets, dependencies
  or build config, also `npm run build`; a refactor claiming no behaviour change, the fingerprint;
  prose-only documents, `node --test tests/documents.test.mjs` (the links), `git diff --check`
  and the line-ending gate. Run only these gates for prose-only changes; executable examples,
  commands or configuration changes also get the checks their behaviour requires.
- **No measurement unless the question is a measurement.** A feature lands without a battery or a
  fingerprint. Look in a browser, briefly, when the change is something to see.
- **Keep going without asking.** No run, training block or search waits for the owner's
  approval, however long it takes. A progress report, each hour with paired readings, is a
  message and never a pause; the owner interrupts when they want something else. What the owner
  should see goes on the roadmap's list to watch, and an agent never marks it seen.
- **Failures are reported as failures**: passing checks and a better battery are not completion.
- **Landing**: name the checks run and any failure left; commit each landable change on main. A
  branch only when the owner asks. Never push unless asked. A push to main publishes the README's
  Play link (`.github/workflows/pages.yml`: `npm test`, `npm run check` and `npm run build` on a
  fresh checkout), so a change keeps those passing there.
- **Pull and merge** with `npm run pull:merge`; resolve conflicts by meaning, stage only those
  files and `-- --continue`. Never stash or commit unrelated work.
- **Servers**: leave none running. Port 5180 may be the owner's: never restart or kill it; use
  `npm run preview` on another port and kill it by PID (`netstat -ano | findstr :<port>`; killing
  `npx` leaves `vite` running).
- **A browser check uses the Chrome on this machine**: the browser tools can reach the owner's
  other computer too, and both report themselves local; the one on this machine is the one that
  loads its preview server.
- **Temporary files** in `.tmp/<task>/`, worktrees in `.tmp/worktrees/<name>/`; deleted when the
  task lands. Something kept outside Git gets its own `.gitignore` line. `tests/workspace.test.mjs`.
- **A run's output goes to `.tmp/<task>/`**: checkpoints, traces, screens, rejected candidates.
  `research/runs/<task>/` keeps only what a later run reads (a selected model with its
  normalisation and configuration, rows a comparison reuses) and a README naming each file. A
  dropped experiment keeps nothing; its reading goes in the commit message. A file loose in
  `research/runs/`, a folder there with no README or an entry its README does not name, or a
  folder over 1,000 files or 1 GB fails `tests/workspace.test.mjs`. `npm run evaluate` caches
  played rows in `.tmp/evaluations/`; its results are what it keeps, a few numbers a trial in
  `assets/evaluations/<id>.json`, committed with the change they read.

## Writing

| Document | Holds |
| --- | --- |
| `README.md` | what the game is and how to run it |
| `AGENTS.md` | commands and the rules every change keeps |
| `docs/architecture.md` | the layers, their contracts, where each lives |
| `docs/roadmap.md` | the one row or goal in work now, what is next in order, what is parked and what is open, a line each |
| `docs/plans/` | the plan of the work in hand and the parked plans the roadmap lists; deleted when it lands |
| `docs/analysis/` | the study behind a decision still open; deleted once decided |
| `docs/diagrams/` | pages showing the current design, or a target a plan in flight names |
| `docs/reference/` | only what code needs and a comment cannot hold |
| `docs/recipes/` | how a kind of work is done: its rules, its steps in order, budgets and traps |
| `docs/approaches.md` | what each approach to a goal can and cannot do, with its evidence commits |
| `docs/traps.md` | what has bitten in Babylon, Rapier, a browser and the tools on Windows, by area |
| `docs/art/`, asset and vendor READMEs | where each asset comes from and how to rebuild it |

- **Durable knowledge lives in these documents, in Git**: a rule, a finding or a correction goes
  in the document the table names, never only in an agent's own memory.
- **Every sentence is true of the code now, something a reader acts on, and said once.** Plain
  technical English, the present tense. No dates, session or step numbers, commit hashes, owner
  quotes, comparisons to other games, "there is no X", or what used to be. A paper or an asset
  path is provenance and stays, as do the approaches' evidence commits. The story of a change,
  its before/after tables included, goes in the commit message; what it shows a mechanism cannot
  do goes in the approaches as well.
- **A plan holds its goal, where the work stands as the table reads it, the next question and how
  to pick it up.** A reading taken on the way goes in its commit message; a plan keeps only the
  readings its next question starts from, each with the command that reads it again.
- **A number cites a document only when it comes from a paper or an asset.** A value tuned for a
  result says in one line what it does, and has no record.
- **A reference record holds what code uses**: no history, no "tried and not kept"; what an
  approach cannot do is an entry in the approaches. A deleted record is not cited, `path@commit`
  included.
- **Comments say what the code is**, and why where not obvious. Name the construct, not a line
  number. A comment about a code path is a hypothesis until the path has run.
- **What worked is kept**: before a plan is deleted, the steps, settings and budgets that met
  its goal go into the recipe for that kind of work, and what could not meet it into the
  approaches. A recipe step that misled a run is corrected in the same change.
- **A wrong document is corrected or deleted**, not annotated; a change updates the documents it
  makes wrong. Status lives in the roadmap; code never cites a plan or an analysis.
- Links and anchors resolve; `src/` comments carry no dates, hashes, plan citations or "the owner":
  `tests/documents.test.mjs`.

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
- **The step's dear functions work in arrays made once**; a speed rewrite does the same
  operations in the same order, moves no fingerprint, and reads its time before and after
  ([step cost](docs/reference/step-cost.md)).
- **A screen is an explicit argument**, never inferred from a state machine. Pause freezes the
  world, not the camera.
- **Two watchers on one body**: set a flag in the callback; act on it at the next control step.
- **Every page is in `vite.config.ts`'s `rollupOptions.input`**; one missing works in dev and is
  absent from `dist`.
- **Engine, drawing and page code has [traps](docs/traps.md)**: read them before changing code
  that calls Rapier or Babylon, handles a pointer, or is checked in a browser; the tools on
  Windows have theirs there too.

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

## Line endings

The clone has `core.autocrlf = true`; the repository is LF. Gate a commit on `git diff --numstat`
equalling `git diff --ignore-cr-at-eol --numstat`.
