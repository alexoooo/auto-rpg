# Profiles and saves found by the question they answer

Notes on how the game finds a strike's profile, a bout's save and a recording. Each is found by
the question it answers, as a played row is
([played rows kept and found](2026-11-14-saved-results.md)). No try of a skill waits on them:
every try reads played rows. They describe a design under consideration; nothing in it is built.

## Goal

- **A profile is found by its skill, its variation and the body's model**, a strike's also by
  the model of the body it strikes, and a number a character sets is a condition of its trials.
- **A save and a recording load across commits**, each part of them that fits.
- **A result says where it came from**, so a reader can judge it.

## Where it stands

Some results are found by the question they answer and reused across every change: a saved
reading (its subject and protocol, the newest read, `resultOf`, `src/evaluation/results.ts`), a
skill's record and its network (the body's model, `recordFault`,
`src/skills/framework/records.ts`), and the stance's envelope and calibration (the body's model,
`assets/skills/locomotion/stance/`). That is the form this design gives a profile, a save and a
recording.

**Keyed by the build.** The build's identity is the commit checked out, and a mark made anew by
each run where a build input is uncommitted (`currentBuildIdentity`,
`scripts/build-identity.mjs`).

| Saved | Where | What a new commit costs |
| --- | --- | --- |
| A bout's save and its tape | `Duel` (`requireRecordingIdentity`, `src/core/world/recording.ts`) | the save refuses to load |
| A body's recorded commands, a mind's replay log | `src/game/combatant.ts`, `src/minds/seat/replay.ts`, `research/bout-pool.mjs` | the recording refuses |

**Keyed by an exact digest.** A strike's profile is found by a digest of the body's whole spec but
its wounds and skills (`specDigest`), of the skill's config and the body's row of each record it
reads (`skillDigest`), and by the rate, the reaction time, the mind's rate and the command delay
(`measuredOn`, `src/skills/framework/profile.ts`). A strike has a profile for each body it was
sparred against, and is read by the one against the body it strikes: the one whose target has
that body's spec digest, else one against another of its model, else the first, read scaled
(`profileAgainst`). A technique's profile is found by its config and the body's whole row of each
record (`techniqueDigest`). So a retrained network, a tuned setting or a number a character sets
(Balance, haste, the physique's scales) loses the profile; such a number set on the struck body
leaves the strike read by its profile against that body's model, as scaled.

A profile not found is not read. The body's own mind prices its strike by a prior set by hand
(`profilesFor`, `src/skills/framework/profile.ts`), and a foe's mind models it as its own strikes
or by hand (`foeModel`, `src/minds/option/percepts.ts`). Sparring the Warrior's punch at a
Balance of 0.01 per cent, where the assist gives under 0.1 N, takes 3.6 times the life it takes
at 0 on the same 240 starts, and holds less than half the table's value
([the skills' notes](2026-11-14-many-skills.md#part-2-a-strike-made-by-search-apart-from-the-legs)).
The profile measured at 0 is a far better guess there than the prior.

## The design

| Saved | Found by |
| --- | --- |
| A technique's profile | its skill and variation, and the body's model |
| A strike's profile | its skill and variation, the body's model and the model of the body it strikes |
| A saved reading, a record, the stance's envelope | as now |
| A bout's save and its tape | its recipe |

**Where it came from is kept on it and gates nothing**: the commit, whether build inputs differed
from it, and the date. A reader that shows a result shows its commit, as the table shows a
reading's.

**A profile is measured again by its own tool, asked.** A retrained network or a tuned setting
keeps its profile until then.

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
and says the commit it was recorded on.

**What it would bring.**

- A character's Balance, haste or scale keeps its profiles, and its foe models it as measured.
- A retrained network or a tuned setting keeps its profile until it is measured again.
- A save and a recording load across commits.

## What it would cost what is saved

Nothing is played.

- **The profiles are found again in place**: each keeps its digests as where it came from, and
  each trial's start is given its bodies' defaults.
- **Saves and recordings made before it load where they fit.**

## Open

- **How far a level read at the nearest measured is true.** Against a Balance at which both minds
  lose their profiles, sparring the Warrior's punch at 5, 10 and 25 per cent landed 18, 25 and 29
  more of 240, and moved neither the table's value nor the life dealt detectably. Haste and the
  scales change the body more.
- **How much of the Warrior's fall from 0 to 0.01 is the minds' pricing.** With its profiles
  read it takes under a third of the life it takes where neither mind reads them. Read by the
  same starts with each profile read as at 0.

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
