# What a saved result is keyed by

Notes on how the game and its tools find what they saved: an evaluation's played rows, a research
tool's cache, a profile, a bout's save. The aim is development speed: a try of an idea plays what
it changed, and every other result is found. They describe a design under consideration; nothing
in it is built.

## Goal

- **A saved result is found by the question it answers**, never by the code it was computed on.
- **What is under work plays; everything else is found.** A result made on older code is used.
  It is computed again when a person, or an agent's brief, has reason to believe it misleads a
  decision.
- **A result says where it came from**, so a reader can judge it.

## Where it stands

Some results are found by the question they answer and reused across every change: a saved
reading (its subject and protocol, the newest read, `resultOf`, `src/evaluation/results.ts`), a
skill's record and its network (the body's model, `recordFault`,
`src/skills/framework/records.ts`), and the stance's envelope and calibration (the body's model,
`assets/skills/locomotion/stance/`). That is the form this design gives every saved result.

The rest are thrown away or refused on a change that does not touch them.

**Keyed by the build.** The build's identity is the commit checked out, and a mark made anew by
each run where a build input is uncommitted (`currentBuildIdentity`,
`scripts/build-identity.mjs`). So every commit, a document's included, voids what is kept under
it, and uncommitted work keeps nothing from one run to the next.

| Saved | Where | What a new commit costs |
| --- | --- | --- |
| A bout's save and its tape | `Duel` (`requireRecordingIdentity`, `src/core/world/recording.ts`) | the save refuses to load |
| A body's recorded commands, a mind's replay log | `src/game/combatant.ts`, `src/minds/seat/replay.ts`, `research/bout-pool.mjs` | the recording refuses |
| An evaluation's played rows | `.tmp/evaluations/<id>/<commit>/` (`scripts/evaluate.mjs`) | every case plays again; with a build input uncommitted no row is kept or found |
| A research tool's cache rows | `research/skills/recovery/edge-profiles.mjs`, `research/skills/recovery/implementations/staged/rise-search.mjs`, `research/empty-hand-league.mjs` | every row plays again |

**Not kept at all.** A strike's research judge plays every held-out start by its candidate and
by the installed drive, each time it is asked
(`research/skills/strikes/straight-punch/punch-sparring.mjs --bar`). So each try of an idea
plays again what it is compared with, which the try did not change.

**Keyed by an exact digest.** A strike's profile is found by a digest of the body's whole spec but
its wounds and skills (`specDigest`), of the skill's config and the body's row of each record it
reads (`skillDigest`), and by the rate, the reaction time, the mind's rate and the command delay
(`measuredOn`, `src/skills/framework/profile.ts`). A technique's profile is found by its config
and the body's whole row of each record (`techniqueDigest`). So a retrained network, a tuned
setting or a number a character sets (Balance, haste, the physique's scales) loses the profile.

A profile not found is not read. The body's own mind prices its strike by a prior set by hand
(`measuredProfile`, `src/minds/option/strike.ts`), and a foe's mind models it as its own strikes
or by hand (`foeModel`, `src/minds/option/percepts.ts`). Sparring the Warrior's punch at a
Balance of 0.01 per cent, where the assist gives under 0.1 N, takes 3.6 times the life it takes
at 0 on the same 240 starts, and holds less than half the table's value
([the skills' notes](2026-11-14-many-skills.md#part-2-a-strike-apart-from-standing-and-footwork)).
The profile measured at 0 is a far better guess there than the prior.

## The design

**A saved result is found by the question it answers.**

| Saved | Found by |
| --- | --- |
| An evaluation's played row, a research tool's cache row | its evaluation or tool and its case: the subject, the bodies, the case's settings |
| A strike's or technique's profile | its skill and variation, and the body's model |
| A saved reading, a record, the stance's envelope | as now |
| A bout's save and its tape | its recipe |

Rows are kept whether or not the work is committed.

**Where it came from is kept on it and gates nothing**: the commit, whether build inputs differed
from it, and the date. A reader that shows a result shows its commit, as the table shows a
reading's.

**What is under work plays; everything else is found.**

- **The subject a run names fresh plays**: `npm run evaluate -- table ... --fresh` already plays
  one cell or row again on the code now, and a research tool's candidate is its subject.
- **Its counterparts are found**: an evaluation's `--previous` and `--against`, and the installed
  drive a research judge reads a candidate beside, from their saved rows. A comparison pairs them
  by case as now; a counterpart's rows carry their commit, which the report shows.
- **A variation of its own moves no other**
  ([the skills' notes](2026-11-14-many-skills.md#part-1-each-variation-its-own-implementation)),
  so another variation's saved rows are its rows on the code now. Where that is in doubt, the
  fingerprint shows which cases a change moved (`node scripts/fingerprint.mjs --compare <file>
  --variation <skill/variation>`).
- **A profile is measured again by its own tool, asked.** A change to a skill is read by playing
  that skill's cases fresh, which its brief names.

**A number a character sets is a condition of a trial.** A profile's trial records where it
began: the range, the closing and across velocities and the place in a window (`Start`,
`profile.ts`). A reading takes the nearest ten trials, and a start outside what was measured is
read at its nearest measured edge (`within`).

- **Balance, haste and the physique's scales, the striker's and the target's, are further
  coordinates of a start.**
- **Every trial begins at its bodies' defaults**, so a character at another Balance reads its
  profiles as measured at the default.
- **A sparring run that draws each trial's levels from a range measures them with the same
  trials**, where a decision needs it.

**A profile never measured is priced by its prior**, as now, and the mind's report says so.

**A save loads what fits.** A save restores the bodies and the minds' memory. Where a body's parts
or a mind's memory no longer have the shape saved, that part cannot load: the bodies refuse with
the part named, and a mind starts fresh. A tape played on other code plays what that code does,
and says the commit it was recorded on. No skill's try reads a save or a tape; every try reads
played rows.

**What it would bring.**

- A try of an idea plays its own variation and nothing else; uncommitted work keeps its rows.
- A commit, documents and code alike, plays nothing again.
- A character's Balance, haste or scale keeps its profiles, and its foe models it as measured.
- A retrained network or a tuned setting keeps its profile until it is measured again.
- A save and a recording load across commits.

## What it would cost what is saved

Nothing is played.

- **The profiles are found again in place**: each keeps its digests as where it came from, and
  each trial's start is given its bodies' defaults.
- **Played rows under each commit's folder become one set per evaluation**, the newest row for a
  case kept, each with its commit.
- **Saves and recordings made before it load where they fit.**

## Open

- **How far a level read at the nearest measured is true.** Against a Balance at which both minds
  lose their profiles, sparring the Warrior's punch at 5, 10 and 25 per cent landed 18, 25 and 29
  more of 240, and moved neither the table's value nor the life dealt detectably. Haste and the
  scales change the body more.
- **How much of the Warrior's fall from 0 to 0.01 is the minds' pricing.** With its profiles
  read it takes under a third of the life it takes where neither mind reads them. Read by the
  same starts with each profile read as at 0.
- **What a table that mixes rows of several commits says of a cell.** A cell's rows are each of
  the commit they were played on; a reading made from them names the oldest.

## To pick it up

- **The build's identity**: `scripts/build-identity.mjs`, `src/core/world/recording.ts`.
- **Played rows and saved readings**: `scripts/evaluate.mjs`, `src/evaluation/results.ts`,
  `scripts/table.mjs`, `src/evaluation/play.ts`; a research judge,
  `research/skills/strikes/straight-punch/punch-sparring.mjs`.
- **Profiles**: `src/skills/framework/profile.ts`, `src/minds/option/strike.ts`,
  `src/minds/option/percepts.ts`, `research/skills/strikes/strike-profiles.mjs`,
  `research/skills/recovery/edge-profiles.mjs`, `tests/skills/profiles.test.mjs`.
- **Saves and recordings**: `src/game/arena/duel.ts`, `src/game/combatant.ts`,
  `src/minds/seat/replay.ts`.

## Completion

What lands puts the rule into [the code recipe](../recipes/code.md) and the keys into
[the architecture](../architecture.md). These notes are deleted once it has landed or been
dropped.
