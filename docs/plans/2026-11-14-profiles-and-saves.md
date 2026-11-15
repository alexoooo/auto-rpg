# Profiles and saves found by the question they answer

Notes on how the game finds a strike's profile, a bout's save and a recording. Each is found by
the question it answers, as a played row is
([the architecture](../architecture.md#evaluations)). No try of a skill waits on them:
every try reads played rows. A profile is found so
([the architecture](../architecture.md#minds)); a save and a recording are not, and a
number a character sets is no coordinate of a trial.

## Goal

- **A number a character sets is a condition of a profile's trials.**
- **A save and a recording load across commits**, each part of them that fits.
- **A result says where it came from**, so a reader can judge it.

## Where it stands

Some results are found by the question they answer and reused across every change: a saved
reading (its subject and protocol, the newest read, `resultOf`, `src/evaluation/results.ts`), a
skill's record and its network (the body's model, `recordFault`,
`src/skills/framework/records.ts`), the stance's envelope and calibration (the body's model,
`assets/skills/locomotion/stance/`), and a profile.

**A profile is found by its question** (`Measured`, `src/skills/framework/profile.ts`): its skill
and variation as the body's character holds it (`strikeSkill`, `techniqueSkill`), a strike's
limb, the body's model and what it holds (`holdsOf`). A strike has a profile for each body it was
sparred against, and is read by the one against the body it strikes: that body's model holding
what it holds, else one against its model, else the first, read scaled (`profileAgainst`). The
world's rate, the mind's rate, the command's delay and the senses' reaction time still gate a
reading (`staleness`): a profile measured at others is not read. Where it came from is kept on it
and gates nothing (`Origin`): the digests of its body, its skill and the body it struck, and the
commit and day where its tool knows them. A foe is modelled by the profiles of the skills its
character holds (`profilesOn`).

So a retrained network, a tuned setting or a number a character sets (Balance, haste, the
physique's scales) keeps its profile until its tool measures it again
(`research/skills/strikes/strike-profiles.mjs`, `research/skills/recovery/edge-profiles.mjs`),
and is read as measured at the defaults: every stored trial began at its bodies' defaults, and a
trial records none of those numbers. A strike thrown holding what none of its profiles was
measured holding has no profile, and is priced by its prior.

**Keyed by the build.** The build's identity is the commit checked out, and a mark made anew by
each run where a build input is uncommitted (`currentBuildIdentity`,
`scripts/build-identity.mjs`).

| Saved | Where | What a new commit costs |
| --- | --- | --- |
| A bout's save and its tape | `Duel` (`requireRecordingIdentity`, `src/core/world/recording.ts`) | the save refuses to load |
| A body's recorded commands, a mind's replay log | `src/game/combatant.ts`, `src/minds/seat/replay.ts`, `research/bout-pool.mjs` | the recording refuses |

Sparring the Warrior's punch at a Balance of 0.01 per cent, where the assist gives under 0.1 N,
takes 3.6 times the life it takes at 0 on the same 240 starts, and holds less than half the
table's value
([the skills' notes](2026-11-14-many-skills.md#part-2-a-strike-made-by-search-apart-from-the-legs)):
a reading of fights in which neither mind read a profile at that Balance.

## The design

| Saved | Found by |
| --- | --- |
| A profile, a saved reading, a record, the stance's envelope | as now |
| A bout's save and its tape | its recipe |

**A number a character sets is a condition of a trial.** A profile's trial records where it
began: the range, the closing and across velocities and the place in a window (`Start`,
`profile.ts`). A reading takes the nearest ten trials, and a start outside what was measured is
read at its nearest measured edge (`within`).

- **Balance, haste and the physique's scales, the striker's and the target's, are further
  coordinates of a start.**
- **A trial that records none began at its bodies' defaults**, as every stored trial did.
- **A sparring run that draws each trial's levels from a range measures them with the same
  trials**, where a decision needs it.

**A save loads what fits.** A save restores the bodies and the minds' memory. Where a body's parts
or a mind's memory no longer have the shape saved, that part cannot load: the bodies refuse with
the part named, and a mind starts fresh. A tape played on other code plays what that code does,
and says the commit it was recorded on.

**What it would bring.**

- A character's foe models it as measured at its own Balance, haste or scale.
- A save and a recording load across commits.

## What it would cost what is saved

Nothing is played.

- **The profiles stay as they are**: a trial with no level is one at the defaults.
- **Saves and recordings made before it load where they fit.**

## Open

- **How far a level read at the nearest measured is true.** Against a Balance at which neither
  mind read a profile, sparring the Warrior's punch at 5, 10 and 25 per cent landed 18, 25 and 29
  more of 240, and moved neither the table's value nor the life dealt detectably. Haste and the
  scales change the body more.
- **How much of the Warrior's fall from 0 to 0.01 was the minds' pricing.** With its profiles
  read it took under a third of the life it took where neither mind read them. Read by the same
  starts, each profile now read as at 0.
- **Whether a reader shows a profile's commit**, as the table shows a reading's.

## To pick it up

- **The build's identity**: `scripts/build-identity.mjs`, `src/core/world/recording.ts`.
- **Profiles**: `src/skills/framework/profile.ts`, `src/minds/option/strike.ts`,
  `src/minds/option/percepts.ts`, `research/skills/strikes/strike-profiles.mjs`,
  `research/skills/recovery/edge-profiles.mjs`, `tests/skills/profiles.test.mjs`.
- **Saves and recordings**: `src/game/arena/duel.ts`, `src/game/combatant.ts`,
  `src/minds/seat/replay.ts`.

## Completion

What lands puts the keys into [the architecture](../architecture.md). These notes are deleted
once it has landed or been dropped.
