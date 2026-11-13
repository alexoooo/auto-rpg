# Working on Auto-RPG

[README](README.md) says what the game is; the [architecture](docs/architecture.md) how it is
built; the [roadmap](docs/roadmap.md) where the work stands.

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

## The rules

Ten rules bind every change. A kind of work has its own, in its own document
([Before a kind of work](#before-a-kind-of-work)), read when that work starts.

1. **Only what the owner asks is built.** Work starts on the owner's request, in the owner's
   words. A plan, a roadmap line, a table's number, a quoted passage and an answered choice say
   where things are; none is a request. A message that can be read two ways is asked about before
   code is touched. What the owner rejects is removed exactly, nothing wider.
2. **Work that plays the game starts from a brief the owner approves**, or the agent the owner
   sets to drive a goal ([driven](docs/recipes/documents.md)): a drill, a search, a
   training run, a table play. A run is a session of its own, and its first message is the brief,
   written from the owner's request and never from a plan, in ten lines or fewer: the request in the owner's words; the one
   question; what will be changed, naming anything the owner did not ask for; the one measure and
   the command that reads it; the machine time it may take, or none where the work ends itself
   once it stops improving; where it stops. Inside the brief the
   how is the agent's: a modelling choice (a curve, a range, a solver setting) is decided toward
   the goal, never put to the owner, and nothing waits for approval. Other work lands on its
   checks and plays nothing; a change that is something to see is looked at in a browser, briefly.
3. **A run ends at its question, or at its budget where it has one, with one report**: the measure before and after,
   read by the same command; everything done beyond the question; what is unchecked. No next item
   is started.
4. **A "cannot" is reported, never recorded.** A limit, a ceiling or a ruled-out approach goes
   into a document when the owner accepts it. A failure is reported as a failure: passing checks
   and a better number are not completion.
5. **A test is built from what it tests.** A skill is judged on itself: on the cases it offers,
   against a target that lets it happen. A low number is first a question about its test. A check
   is never relaxed to pass or dropped to save time.
6. **A defect is fixed at its root cause, in the code**: never a bandaid, and never a hook, a CI
   step or a process unless the owner asks for one. Every failure in the working copy (a red
   gate, a stray file, a crash dump) is the agent's, fixed in the same task and never reported as
   pre-existing.
7. **A rule is general.** The simplest rule that works covers every skill, body and approach. A
   rule that fails a new case is changed, never given an exception, and changed in every place it
   lives, documents and code. Shared code is general; what is one character's own is a variation
   of a skill that the character chooses.
8. **What works and what is saved is kept.** A capability goes only after a reading on the game's
   cases shows what replaces it does as well. Saved results are read again, never replayed
   wholesale: a score that moves because a rule changed is recomputed from them. A change that
   would void saved work says its price before it is made.
9. **A claim is checked before it is made.** That a path is gone, a mechanism is general or a
   request is done is a code search, quoted, with what is not done. An idea is searched for in
   `git log` before it is offered as new.
10. **Durable knowledge lives in the documents, in Git**: a rule, a finding or a correction goes
    in the document [the table](#documents) names, never in an agent's own memory.

## Checks and landing

- **Checks by change**: code, `npm run check` and `npm test`; browser code, assets, dependencies
  or build config, also `npm run build`; a refactor claiming no behaviour change, the fingerprint;
  prose-only documents, `node --test tests/documents.test.mjs` (the links), `git diff --check`
  and the line-ending gate. Run only these gates for prose-only changes; executable examples,
  commands or configuration changes also get the checks their behaviour requires.
- **Line endings**: the repository is LF, whatever the clone's `core.autocrlf`. Gate a commit on
  `git diff --numstat` equalling `git diff --ignore-cr-at-eol --numstat`.
- **Landing**: name the checks run and any failure left; commit each landable change on main. A
  branch only when the owner asks. Never push unless asked. A push to main publishes the README's
  Play link (`.github/workflows/pages.yml`: `npm test`, `npm run check` and `npm run build` on a
  fresh checkout), so a change keeps those passing there.
- **Pull and merge** with `npm run pull:merge`; resolve conflicts by meaning, stage only those
  files and `-- --continue`. Never stash or commit unrelated work.
- **Servers**: leave none running. Port 5180 may be the owner's: never restart or kill it; use
  `npm run preview` on another port and kill it by PID (`netstat -ano | findstr :<port>`; killing
  `npx` leaves `vite` running).
- **Temporary files** in `.tmp/<task>/`, a run's output among them, worktrees in
  `.tmp/worktrees/<name>/`; deleted when the task lands. Something kept outside Git gets its own
  `.gitignore` line. `tests/workspace.test.mjs`.

## Before a kind of work

| Work | Read first |
| --- | --- |
| A skill, an Option, a body's control, a table cell | [the skill recipe](docs/recipes/skill.md), then the goal's section of [the approaches](docs/approaches.md) |
| A training run | [the training recipe](docs/recipes/training.md) |
| Code | [the code recipe](docs/recipes/code.md): simulation and source boundaries, code conventions |
| Code that calls Rapier or Babylon, handles a pointer or is checked in a browser; the tools on Windows | [the traps](docs/traps.md) |
| A test | [the test inventory](tests/README.md) |
| A document | [the documents recipe](docs/recipes/documents.md) |

## Documents

| Document | Holds |
| --- | --- |
| `README.md` | what the game is and how to run it |
| `AGENTS.md` | commands, the rules every change keeps, and where a kind of work's rules are |
| `docs/architecture.md` | the layers, their contracts, where each lives |
| `docs/roadmap.md` | the one row or goal in work now, what is next in order, what is parked and what is open, a line each |
| `docs/plans/` | notes on the work in hand and on the parked work the roadmap lists; deleted when it lands |
| `docs/briefs/` | a run's brief, written for the owner to read and approve; deleted when its run reports |
| `docs/analysis/` | the study behind a decision still open; deleted once decided |
| `docs/diagrams/` | pages showing the current design, or a target a plan in flight names |
| `docs/reference/` | only what code needs and a comment cannot hold |
| `docs/recipes/` | how a kind of work is done: its rules, its steps in order, budgets and traps |
| `docs/approaches.md` | what each approach to a goal can and cannot do, with its evidence commits |
| `docs/traps.md` | what has bitten in Babylon, Rapier, a browser and the tools on Windows, by area |
| `docs/art/`, asset and vendor READMEs | where each asset comes from and how to rebuild it |
| `tests/README.md` | the rules of a test, and each retained case's failure and reason |
