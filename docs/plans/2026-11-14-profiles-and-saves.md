# A character's numbers in a profile's trials

Notes on how a strike's profile reads a number a character sets. A profile is found by the
question it answers, as a played row is
([the architecture](../architecture.md#minds)), and a bout's save loads on whatever build
made it ([the architecture](../architecture.md#bouts-tapes-and-replay)). A body's Balance and
haste are coordinates of a trial's start; the physique's scales are not, and no stored trial
began at a level other than its model's own. No try of a skill waits on it: every try reads
played rows.

## Goal

- **A number a character sets is a condition of a profile's trials.**

## Where it stands

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

So a retrained network or a tuned setting keeps its profile until its tool measures it again
(`research/skills/strikes/strike-profiles.mjs`, `research/skills/recovery/edge-profiles.mjs`).
A strike thrown holding what none of its profiles was measured holding has no profile, and is
priced by its prior.

**A body's Balance and haste are coordinates of a start** (`Start.levels`, `LEVELS`,
`profile.ts`). A trial records each body's, the striker's and the target's, where its character
set it apart from its model's own (`startLevels`, which the strikes' tool writes from each row's
bodies as its bout built them); a trial that records none began at its models' own. A reading
takes its bodies' levels from their specs and reads each within the span its trials began at, as
it reads a velocity, so a level no trial began at is read at the nearest one did. Every stored
trial began at its models' own, so every reading is as it was: a profile whose trials record no
level is compared by none, and the fingerprint moves no pose.

**The physique's scales are no coordinate.** A body's spec says its Balance and its haste
(`AttributeSpec`) and not the size, weight, strength and speed its character scaled it by, so a
reading has nothing to take them from.

Sparring the Warrior's punch at a Balance of 0.01 per cent, where the assist gives under 0.1 N,
takes 3.6 times the life it takes at 0 on the same 240 starts, and holds less than half the
table's value
([the skills' notes](2026-11-14-many-skills.md#part-2-a-strike-made-by-search-apart-from-the-legs)):
a reading of fights in which neither mind read a profile at that Balance.

## The design

**A number a character sets is a condition of a trial.** A profile's trial records where it
began: the range, the closing and across velocities and the place in a window (`Start`,
`profile.ts`). A reading takes the nearest ten trials, and a start outside what was measured is
read at its nearest measured edge (`within`).

- **Balance, haste and the physique's scales, the striker's and the target's, are further
  coordinates of a start.** Balance and haste are; the scales wait on a spec that says them.
- **A trial that records none began at its bodies' defaults**, as every stored trial did.
- **A sparring run that draws each trial's levels from a range measures them with the same
  trials**, where a decision needs it. Rows played at several levels already make one profile;
  no rung draws a level.

**What it would bring.** A character's foe models it as measured at its own Balance, haste or
scale.

## What it would cost what is saved

Nothing is played. The profiles stay as they are: a trial with no level is one at the defaults.

## Open

- **How wide a level's span is.** Trials are taken as alike over 2 per cent of Balance and 10 of
  haste (`LEVELS`), set by no reading: no profile holds trials begun at two levels.
- **Where a spec says its physique**, so that the scales are read as Balance and haste are. A
  field for it on the spec enters the spec's digest (`specDigest`); what else compares or digests
  a spec, and would move with it, is unread.
- **Whether a ground edge's trial records its levels.** The strikes' tool does; the edges' tool
  plays its falls at a Balance its jobs name.
- **How far a level read at the nearest measured is true.** Against a Balance at which neither
  mind read a profile, sparring the Warrior's punch at 5, 10 and 25 per cent landed 18, 25 and 29
  more of 240, and moved neither the table's value nor the life dealt detectably. Haste and the
  scales change the body more.
- **How much of the Warrior's fall from 0 to 0.01 was the minds' pricing.** With its profiles
  read it took under a third of the life it took where neither mind read them. Read by the same
  starts, each profile now read as at 0.
- **Whether a reader shows a profile's commit**, as the table shows a reading's.

## To pick it up

`src/skills/framework/profile.ts`, `src/minds/option/strike.ts`, `src/minds/option/percepts.ts`,
`research/skills/strikes/strike-profiles.mjs`, `research/skills/recovery/edge-profiles.mjs`,
`tests/skills/profiles.test.mjs`.

## Completion

What lands puts a start's coordinates into [the architecture](../architecture.md). These notes
are deleted once it has landed or been dropped.
