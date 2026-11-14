# What a saved result is keyed by

Notes on one rule for everything the game and its tools save and read again: a played trial, a
reading, a profile, a bout's save, a record made by a search or a training run. They describe a
design under consideration; nothing in it is built.

## Goal

- **A saved result is valid while what it read is the same, and no longer.** A change that
  touches nothing a result read leaves it valid. A change that touches what it read is named as
  voiding it, before the change lands.
- **One rule, written once**, that every kind of saved result keeps, with a test that walks it.
- **A reader that finds no valid result says so** where a person sees it, with what it did in
  its place.

## Where it stands

Three kinds of key are in use. Each is wrong in its own direction.

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

| Saved | Its key | What it takes in that it did not read |
| --- | --- | --- |
| A strike's profile | the body's whole spec but its wounds and skills (`specDigest`), the skill's config and the body's row of each record it reads (`skillDigest`), the rate, the reaction time, the mind's rate and the command delay (`measuredOn`, `src/skills/framework/profile.ts`) | a number a character sets, as an exact value: Balance, haste, the physique's scales |
| A technique's profile | its config and the body's whole row of each record (`techniqueDigest`) | every loadout's settings, where it read one loadout's ([the recipe's traps](../recipes/skill.md#traps)) |

A profile keyed to another spec is not read, and its reader takes something else in its place. A
body's mind prices its own strike by a prior set by hand (`measuredProfile`,
`src/minds/option/strike.ts`). A foe's mind models that body's strikes from the profiles measured
on it, and with none fresh it models them as its own strikes or by hand (`foeModel`,
`src/minds/option/percepts.ts`).
The test of profiles reads each model at its defaults (`profileKeys`,
`tests/harness/profile-keys.mjs`), so a character at another Balance loses its profiles and no
gate says so.

Sparring shows a fight that moves where the spec's digest does and little else. The Warrior's
punch at a Balance of 0.01 per cent, where the assist gives under 0.1 N, takes 3.6 times the life
it takes at 0 and holds less than half the table's value, on the same 240 starts; every level
above it takes that life. Both minds price the punch another way there. That this is the cause is
read in the code, and no run plays it apart from the assist
([the skills' notes](2026-11-14-many-skills.md#part-3-a-layer-under-the-skills)).

**Keyed by a name alone: narrower than what the result read.** Nothing tells these from results
whose ground has moved.

| Saved | Its key | What moves under it unseen |
| --- | --- | --- |
| A saved reading | its subject, its protocol and the commit it was read at, the newest read (`resultOf`, `src/evaluation/results.ts`) | the code and the records it played |
| A skill's record and its network | the body's model (`recordFault`, `src/skills/framework/records.ts`) | the body, the stance, the engine, the rate ([the approaches](../approaches.md#every-skill)) |
| The stance's envelope and calibration | the body's model (`assets/skills/locomotion/stance/`) | the same |

**What a key drawn from source text does.** Three forms differ only in how much text they take.

- **The commit**: every commit moves every key.
- **A hash of every build input**: every edit to any input moves every key.
- **A digest of the files a case imports** (`implementationOf` reads such a closure): any edit
  under the case moves its key, a comment included; a file every case imports moves them all;
  and what a case reads outside the static walk leaves a stale row looking current.

Text is the wrong thing to key by: it moves when nothing a result read has changed, and the
narrowest form of it can stand still when something has.

## The design

**Every input of a result has one of three roles, declared once for its kind of result.**

| Role | What it is | In the key |
| --- | --- | --- |
| Identity | what the result read and that must be the same: the body as it is built, the row of each record read, the engine, the rate, the command delay, what the case plays | its content's digest, equal or not |
| Level | a number a character or a case sets, which a result is measured at and read near: Balance, haste, a reaction time, a speed | the level measured at; a reader takes the nearest or reads between, and is refused outside the range measured |
| Outside | what the result did not read: the commit, the date, a name, a body's wounds, the skills it does not run | never |

A profile already keeps part of this: wounds and skills are left out of its spec's digest, and a
reaction time is read within half a step (`sameReaction`). The rule makes it whole and the same
everywhere: one declaration per kind of result, one function that makes its key, and one test
that changes each field and reads the key: an outside field leaves it, an identity field moves
it, a level moves the level alone.

**Code is told by what it computes, never by its text.** A trial's trace is every segment's
position and rotation after every step, and its digest is exact (`traceOf`,
`src/evaluation/trace.ts`; `playCase` returns it with each reading). The fingerprint already
tells a change that moves code from one that changes what it computes by these digests
(`scripts/fingerprint.mjs`).

- **A saved result keeps the trace digests of a small sample of its own trials**, chosen across
  its outcomes.
- **It is current while that sample plays to the same digests.** The check plays the sample, a
  few trials, in place of the result's hundreds.
- **One command reads every saved result's sample and names what the working copy voids**: the
  profiles, the readings, the records. A comment, a renamed function and a document void
  nothing. A change to a stance's gain voids what stood on the stance and names it, with the
  price of measuring it again.
- **A cache of played rows validates itself the same way.** Its rows are found by what each case
  plays; on code it has not seen it plays a sample of them, and reuses the rest where the sample
  holds.
- **A bout's saved state carries a short tape of its own**: the commands of its next steps and
  the digest they play to. A load plays them and compares, so a state is refused only when the
  bodies or the engine under it have changed.

The commit and the date stay on a result as where it came from. They gate nothing.

**A miss is one of two kinds, and each has one answer.** The lookups tell them apart as they
are: a skill no fight measured finds nothing, and one measured on something else is found with
why it is stale (`profileFor`, `profilesOn`, `src/skills/framework/profile.ts`).

| Miss | Where it arises | What its reader does |
| --- | --- | --- |
| Never measured | a strike's first fights; a limb no measured strike throws; a body with no profile, where the profiles are of the man, the woman and the skeleton | fights by its prior, and says so in what it reports |
| Measured on something else | a body, a skill or a rate that has moved under a profile | an evaluation, a tool and the gate refuse, naming what was wanted and why what was found is not it |

- **A reading played on a stale profile is no reading of the skill**, so nothing that reads a
  skill plays on one.
- **The measuring tool asks for the prior by name.** A skill whose profile is stale is measured
  again by fights played on its prior, and no other reader may ask.
- **The gate reads the bodies a person can make** as well as the defaults, so a stale profile
  reaches no player. A fight in the game that meets one all the same plays by the prior and
  shows a mark: the last resort, and never a fight refused.
- **A level between two measured is no miss.** A character at a Balance between levels reads
  from those measured, so a refusal comes only of a change to a body, a skill or the code under
  them, which the command above names before it lands.

**What it would bring.**

- A commit of documents, comments or a refactor voids nothing, and uncommitted work keeps its
  rows.
- A character's Balance, haste or scale no longer costs its profiles or changes how a foe fights
  it.
- A change under a trained record is named when it is made, where now it is found by a table cell
  that fell.
- The fight-state library of [the skills' notes](2026-11-14-many-skills.md#part-4-the-pipeline)
  has a state it can keep across commits.

## What it would cost what is saved

- **The strike and technique profiles are re-keyed in place with no play**, where they were
  measured at their bodies' defaults: the new key is made from the same spec and records.
- **A case or a fight that plays on a stale profile refuses until it is measured.** How many do
  is not counted.
- **Samples are played once.** No saved reading or profile holds a trace digest
  (`assets/evaluations/`, `assets/skills/strikes/strike-profiles/`), so each kind's first sample
  is a few trials played on the code it is kept on.
- **Saves and recordings made before it refuse as they do now.**

## Open

- **Whether a trace's digest is the same on another machine.** The fingerprint is compared on one
  machine. A sample that differs by machine would be kept per machine, or compared by its
  readings in place of its digests.
- **How large a sample catches a change.** A change inside a branch few trials reach moves few
  digests. Read by taking changes known to move a result and counting the samples that miss them.
- **Where the check runs**: on a command before a change lands, or in the gate, and what it may
  cost there.
- **What of a body's spec is identity and what a level**, for each attribute: the approaches
  record a controller tuned at one strength or speed not using more.
- **Whether a level is read at the nearest measured or between two.** Sparring at Balance 5, 10
  and 25 moved the landed total one way with shrinking steps and the table's value not
  detectably, so the nearest may do.

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
- **Traces**: `src/evaluation/trace.ts`, `scripts/fingerprint.mjs`.

## Completion

What lands puts the rule into [the code recipe](../recipes/code.md) and the keys' contracts into
[the architecture](../architecture.md). These notes are deleted once it has landed or been
dropped.
