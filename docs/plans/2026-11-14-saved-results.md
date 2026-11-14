# Played rows kept and found

Notes on how the game's tools keep and find the rows they play: an evaluation's cases and a
research judge's trials. The aim is development speed: a try of an idea plays what it changed,
and every other row is found. They describe a design under consideration; nothing in it is built.
Profiles, saves and recordings are in
[notes of their own](2026-11-14-profiles-and-saves.md).

## Goal

- **A played row is found by the question it answers**, never by the code it was played on.
- **What is under work plays; everything else is found.** A row played on older code is used. It
  is played again when a person, or an agent's brief, has reason to believe it misleads a
  decision.
- **A row says where it came from**, so a reader can judge it.

## Where it stands

- **A row's key is its question.** A case's key is a digest of its evaluation, how it is played,
  the engine, its world and its seconds; the world holds every subject's value in full, and the
  code it runs on is not in it (`keyOf`, `src/evaluation/run.ts`). A run plays a case only where
  no row has its key (`runEvaluation`).
- **A folder and one rule tie the rows to the commit.** A run keeps its rows in
  `.tmp/evaluations/<evaluation>/<commit>/` and reads that folder alone, and where a build input
  differs from the commit it keeps and finds none (`scripts/evaluate.mjs`). So every commit, a
  document's included, plays every case again, and uncommitted work keeps nothing from one run to
  the next.
- **`npm run clean` deletes them**: `.tmp/evaluations/` goes whole once nothing under it has
  changed for a day (`scripts/clean.mjs`). Reading a row does not change it.
- **Two rows of one key that read differently stop a run** (`indexRows`,
  `src/evaluation/rows.ts`): on one commit that is a play that does not repeat.
- **A case is played again by the table alone**: `npm run evaluate -- table ... --fresh` plays a
  cell's readings again; `npm run evaluate -- <id>` plays where no row has the key.
- **A research judge keeps no row.** `punch-sparring.mjs --bar` plays every held-out start by its
  candidate and by the installed drive, each time it is asked (`bar`,
  `research/skills/strikes/straight-punch/punch-sparring.mjs`). It makes each trial's world as an
  evaluation's cases are made (`cases.world`, as in `casesOf`, `src/evaluation/run.ts`), so the
  drive's trial on a start is the case of `strike`, its protocol, `option/straight-punch` and
  that start.
- **Three research tools key a cache of their own by the commit**:
  `research/skills/recovery/edge-profiles.mjs`,
  `research/skills/recovery/implementations/staged/rise-search.mjs` and
  `research/empty-hand-league.mjs`.

## The design

**One store of played rows**, an evaluation's and a judge's alike.

- **Rows are kept in `.cache/evaluations/<evaluation>/`**: outside Git by a line of
  `.gitignore`, and outside what `npm run clean` deletes. They are kept whether or not the work
  is committed, and found by key as now.
- **A row carries where it came from, which gates nothing**: its commit, whether build inputs
  differed from it, and when it was played. A report names the oldest commit among the rows it
  read.
- **The newest row of a key stands.** Two that read differently on one commit with no build
  input changed stop the run as now; otherwise they are a change to the code between them.
- **A run finds every row unless it is told to play**:
  `npm run evaluate -- <id> <subject> --fresh` plays the named subjects' cases again. Their
  counterparts (`--previous`, `--against`) are found, and paired by case as now.
- **A research judge reads the same store.** Its candidate plays. What the candidate is read
  beside is found by its cases' keys (`casesOf`), and played and kept where no row has one.

**What is under work plays; everything else is found.**

- **The subject a run names fresh plays**, and a research tool's candidate is its subject.
- **A variation of its own moves no other**
  ([the skills' notes](2026-11-14-many-skills.md#part-1-a-variation-declares-its-record)), so
  another variation's rows are its rows on the code now. Where that is in doubt, the fingerprint
  shows which cases a change moved (`node scripts/fingerprint.mjs --compare <file> --variation
  <skill/variation>`).
- **A change to code a counterpart runs is the reason to play it again**: the stance, the solve
  or shared strike code, under both sides of a comparison. Its rows are then another code's, and
  the differences a judge reads are small beside its interval: a search's best reads 1.08 times
  the drive's damage a second, 95 % 0.79 to 1.47, on 240 starts (`punch-sparring.mjs --bar`).

**What it would bring.**

- A try of an idea plays its own variation and nothing else; uncommitted work keeps its rows.
- A commit, documents and code alike, plays nothing again.
- A judge's comparison plays one side: each of the readings that come first
  ([the skills' notes](2026-11-14-many-skills.md#the-readings-that-come-first)) is a `--bar`
  against the same drive on the same starts.

**What it would cost what is saved.** Nothing is played. The rows under each commit's folder
become one set an evaluation, the newest row of a key kept, each with the commit its folder
names.

## Open

- **What it saves a try**: the time of a `--bar`, the drive's side of it every start played once
  more, and of a row's play.
- **What a result made from rows of several commits names.** A result is written from a commit
  with no build input changed, and names it (`--write`); its rows are each of the commit they
  were played on. A result made from them names the oldest.
- **Whether the three research tools' caches are rows of the store.**

## To pick it up

- **The key and the run**: `src/evaluation/run.ts` (`keyOf`, `casesOf`, `runEvaluation`),
  `src/evaluation/rows.ts`, `src/evaluation/play.ts`, `scripts/evaluate-worker.mjs`.
- **Where rows are kept and found**: `scripts/evaluate.mjs`, `scripts/build-identity.mjs`,
  `scripts/clean.mjs`, `.gitignore`, `scripts/workspace.mjs`.
- **A result written from rows**: `src/evaluation/results.ts`, `scripts/table.mjs`.
- **A research judge**: `research/skills/strikes/straight-punch/punch-sparring.mjs`.

## Completion

What lands puts the rule into [the code recipe](../recipes/code.md) and where rows are kept into
[the architecture](../architecture.md). These notes are deleted once it has landed or been
dropped.
