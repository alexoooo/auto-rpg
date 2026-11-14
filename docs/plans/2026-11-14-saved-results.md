# What a saved result is keyed by

Notes on one key for everything the game and its tools save and read again: an evaluation's
played rows, a research tool's cache, a profile, a reading, a record, a bout's save. The aim is
development speed: nothing is played again unless what it played has changed, and then only
where seeing the change is the point. They describe a design under consideration; nothing in it
is built.

## Goal

- **A change plays again only what it touched.** A document, a comment, a refactor and another
  part's code leave a result as it is, and uncommitted work keeps its rows.
- **Only played rows are played again on their own**, since seeing what a change did is why it is
  evaluated. Every other result outlives a change, is used, and says where it is read that it was
  made on other code. It is measured again when a person asks.
- **One key, made by one function**, for every kind of saved result.

## Where it stands

Three kinds of key are in use, each wrong in its own direction.

**Keyed by the build: wider than what the result read.** The build's identity is the commit
checked out, and a mark made anew by each run where a build input is uncommitted
(`currentBuildIdentity`, `scripts/build-identity.mjs`). So every commit, a document's included,
voids what is kept under it, and uncommitted work keeps nothing from one run to the next.

| Saved | Where | What a new commit costs |
| --- | --- | --- |
| A bout's save and its tape | `Duel` (`recordingIdentity`, `Duel.load`, `src/game/arena/duel.ts`) | the save refuses to load |
| A body's recorded commands, a mind's replay log | `src/game/combatant.ts`, `src/minds/seat/replay.ts`, `research/bout-pool.mjs` | the recording refuses |
| An evaluation's played rows | `.tmp/evaluations/<id>/<commit>/` (`scripts/evaluate.mjs`) | every case plays again; with a build input uncommitted no row is kept or found |
| A research tool's cache rows | `research/skills/recovery/edge-profiles.mjs`, `research/skills/recovery/implementations/staged/rise-search.mjs`, `research/empty-hand-league.mjs` | every row plays again |

**Keyed by a digest of content, drawn too wide.**

| Saved | Its key | What it takes in that it did not need |
| --- | --- | --- |
| A strike's profile | the body's whole spec but its wounds and skills (`specDigest`), the skill's config and the body's row of each record it reads (`skillDigest`), the rate, the reaction time, the mind's rate and the command delay (`measuredOn`, `src/skills/framework/profile.ts`) | a number a character sets, as an exact value: Balance, haste, the physique's scales |
| A technique's profile | its config and the body's whole row of each record (`techniqueDigest`) | every loadout's settings, where it read one loadout's ([the recipe's traps](../recipes/skill.md#traps)) |

A profile keyed to another spec is not read. The body's own mind prices its strike by a prior set
by hand (`measuredProfile`, `src/minds/option/strike.ts`), and a foe's mind models it as its own
strikes or by hand (`foeModel`, `src/minds/option/percepts.ts`). Sparring the Warrior's punch at a
Balance of 0.01 per cent, where the assist gives under 0.1 N, takes 3.6 times the life it takes
at 0 on the same 240 starts, and holds less than half the table's value
([the skills' notes](2026-11-14-many-skills.md#part-2-a-layer-under-the-skills)).

**Keyed by a name alone: narrower than what the result read.** Nothing tells these from results
whose ground has moved.

| Saved | Its key | What moves under it unseen |
| --- | --- | --- |
| A saved reading | its subject, its protocol and the commit it was read at, the newest read (`resultOf`, `src/evaluation/results.ts`) | the code and the records it played |
| A skill's record and its network | the body's model (`recordFault`, `src/skills/framework/records.ts`) | the body, the stance, the engine, the rate ([the approaches](../approaches.md#every-skill)) |
| The stance's envelope and calibration | the body's model (`assets/skills/locomotion/stance/`) | the same |

## The design

**A result's key is what it ran.**

| Part of the key | What it holds |
| --- | --- |
| Identity | the body's model and the row of each record read; the engine, the rate and the command delay; what a case plays: its bodies, its settings, its foe |
| Code | the code of each part it ran |

The commit, the date, a name, a body's wounds and the skills it did not run are not in it. The
commit and the date stay on a result as where it came from.

**What a part's code is.**

- **The parts a result ran are recorded as it plays**, as the fingerprint names the variations a
  fight's bodies run (`variationsOf`, `scripts/fingerprint.mjs`), and each record as it is read
  (`dataOf`, `src/core/data/store.ts`). A part is a registered piece of a mind: an Option, an
  executor, the balance, the motor, a tactic.
- **A part's code is the modules it imports, with comments and layout stripped.**

This answers what a digest of a case's import closure (`implementationOf`, the same file as the
build's identity) gets wrong:

- A comment, a blank line or a document moves no key.
- What a case ran is recorded, never walked from its imports, so a part chosen by registration or
  a record read through the store is in its key.
- A file under every part (the world, the stance, the solve) moves every key. The fingerprint
  clears such a change: where it plays to the same digests before and after
  (`node scripts/fingerprint.mjs --compare`), the rows are carried to their new keys with no play.

**A number a character sets is a condition of a trial, never part of a key.** A profile's trial
records where it began: the range, the closing and across velocities and the place in a window
(`Start`, `profile.ts`). A reading takes the nearest ten trials, and a start outside what was
measured is read at its nearest measured edge (`within`).

- **Balance, haste and the physique's scales, the striker's and the target's, are further
  coordinates of a start.** They leave the spec's digest.
- **Every trial begins at its bodies' defaults**, so a character at another Balance reads
  its profiles as measured at the default, with no play.
- **A sparring run that draws each trial's levels from a range measures them with the same
  trials**, where a decision needs it.
- **A played row stays exact**: a case's settings are its identity.

The stance's envelope is read the same way: a pace and a heading between measured points
(`heldPace`, `src/control/stance/stance-envelope.ts`).

**What a kind of result does when its key no longer matches.**

| Saved | What a reader does |
| --- | --- |
| An evaluation's played rows, a research tool's cache | plays the cases whose key moved and reuses the rest |
| A strike's or technique's profile, the stance's envelope and calibration | reads it, and marks where it is read that it was made on other code; measured again on request |
| A skill's record and its network | runs it; the change is named, and it is read or trained again when a person decides |
| A saved reading | stands as read; the table marks a reading whose key is not the working copy's |
| A bout's tape, a body's recorded commands, a mind's replay log | replays on its own key alone, and refuses otherwise |

A profile never measured is priced by its prior, as now, and the mind's report says so. The
lookups already tell it from a profile made on something else (`profileFor`, `profilesOn`,
`profile.ts`).

**One command names what the working copy moves**: each saved result whose key it changes, by
kind, with the price of playing it again. It reads keys and plays nothing, apart from the
fingerprint where shared code moved.

**What it would bring.**

- A commit of documents or comments, or a refactor the fingerprint clears, plays nothing again.
- Evaluating a change to one skill plays the cases that ran it.
- A character's Balance, haste or scale keeps its profiles, and its foe models it as measured.
- A change under a trained record is named when it is made.

## What it would cost what is saved

- **The strike and technique profiles are re-keyed in place with no play.** The numbers a
  character sets leave their key, and each trial's start is given its bodies' defaults. A profile
  holds no record of the code it was measured on, so it is taken as made on the code checked out
  where the key lands.
- **Played rows under a commit's folder play again once**: a row holds no record of the parts its
  case ran.
- **Saved readings keep the commit they were read at**, and the table reads them as now.
- **Saves and recordings made before it refuse as they do now.**

## Open

- **What clearing shared code costs.** The fingerprint plays the arena, the crypt, the lab and the
  levels; where it costs more than playing the rows a change moved, the rows are played. Read by
  timing it.
- **Where a part's code ends.** Shared code is in every part's key: the more of it, the more a
  change to it costs before the fingerprint clears it.
- **How far a level read at the nearest measured is true.** Against a Balance at which both minds
  lose their profiles, sparring the Warrior's punch at 5, 10 and 25 per cent landed 18, 25 and 29
  more of 240, and moved neither the table's value nor the life dealt detectably. Haste and the
  scales change the body more.
- **How much of the Warrior's fall from 0 to 0.01 is the minds' pricing.** With its profiles read it
  takes under a third of the life it takes where neither mind reads them. Read by the same starts with each profile
  read as at 0.
- **Whether a trace's digest is the same on another machine.** It decides whether the fingerprint
  of one machine clears rows played on another.

## To pick it up

- **The build's identity**: `scripts/build-identity.mjs`, `src/core/world/recording.ts`.
- **Saves and recordings**: `src/game/arena/duel.ts`, `src/game/combatant.ts`,
  `src/minds/seat/replay.ts`.
- **Played rows and saved readings**: `scripts/evaluate.mjs`, `src/evaluation/results.ts`,
  `scripts/table.mjs`, `src/evaluation/play.ts`.
- **Profiles**: `src/skills/framework/profile.ts`, `src/minds/option/strike.ts`,
  `src/minds/option/percepts.ts`, `research/skills/strikes/strike-profiles.mjs`,
  `research/skills/recovery/edge-profiles.mjs`, `tests/skills/profiles.test.mjs`.
- **Records**: `src/skills/framework/records.ts`, `src/core/data/store.ts`.
- **Parts and traces**: `src/app/catalog.ts`, `src/evaluation/trace.ts`, `scripts/fingerprint.mjs`.

## Completion

What lands puts the rule into [the code recipe](../recipes/code.md) and the key's contract into
[the architecture](../architecture.md). These notes are deleted once it has landed or been
dropped.
