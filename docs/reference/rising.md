# Getting up

The stand-up bar every riser is read on (`src/evaluation/rising.ts`, `src/evaluation/rising-target/`).

## The owner's target

```powershell
npm run evaluate -- rising-target [riser ...]
```

- **The falls**: every body (the Warrior, the Rogue and the Skeleton, `HUMANOID_MODELS`) in every
  rated loadout (empty hands, the club, the sword, the club and buckler, the sword and buckler;
  `REPRESENTATIVE`), each shoved sixteen ways 22.5 degrees apart: 240 falls (`risingJobs`), on the
  fall bed every mind is felled on (`buildFall`, `src/evaluation/fall.ts`); a shove the body holds
  is given again with doubled impulse the same way 1.5 s later, at most three (`SHOVED`,
  `src/game/lab/ground-mode.ts`). A fall not made is reported as not exercised and excluded from
  recovery statistics.
- **The conditions**: Node stand, core world, the game's engine (`DEFAULT_ENGINE`), 120 Hz, calm
  air, Balance 0 and Grit 0, a 30 s cap. A riser is a mind by its preset's or kind's name (`option-prior`, the table's; `option`, the game's), on its own
  character, refused on a body it cannot rise as holding the fall's loadout; or the game's Stand
  up (`game`, where none is named), `stand-up` with every technique, or a technique's name.
- **The fresh falls** (`--protocol fresh`): the same bodies and loadouts shoved 11.25 degrees past
  each direction (`FRESH_OFFSET`), read the same way. Nothing is tuned on them: they
  show whether a gain is fitted to the target's falls.
- **The timing**: from the riser's takeover (the body first down) to a stand verified by
  `STAND_CHECK` (`standCheck`), through landing, orientation and retries. A fall not stood counts
  at the cap.
- **The value**, on each body and loadout's sixteen falls: the mean time to stand over the falls
  made, a fall not stood at the cap (`timeToStand`), lower better; the table reads each body and
  loadout's (`stand-up`, [the table](the-table.md)), and prices every other cell's falls by it.
  The owner's 10 s a fall (`STAND_WITHIN`) is a scale reported beside it, deciding nothing.
  `risingReport` states whether the rows are the target's conditions: every fall once, Balance 0
  and Grit 0.
- **Against people**: young adults rising from the floor at a comfortable rate take 1.4 to 2.6 s
  by starting position, healthy older adults 2.4 to 5.5 s (Alexander et al. 1997), and young
  adults asked for speed stand from prone in about 2 s
  ([Resisting arrest](https://research.bond.edu.au/en/publications/resisting-arrest-analysis-of-different-prone-body-positions-on-ti/),
  Bond University); the target's clock also holds the landing before the rise and the steadying
  after it.

## One technique alone

```powershell
npm run evaluate -- rise [technique ...] --protocol <placed | moving | placed-bodies | moving-bodies>
```

The Rise drill (`src/evaluation/rise/`) plays one way up by itself, with no mind choosing and no
profile read: where a technique is developed. Its techniques are the route's four (`EDGES`).

- **`placed`**: the technique begun from each position it starts in, the body placed there at
  rest, six seeds.
- **`moving`**: the technique begun as the route hands the body over, after the techniques before
  it; the route's first after a shove from standing.
- **The bodies**: `placed` and `moving` play the Warrior with empty hands and with the club and
  buckler. `placed-bodies` and `moving-bodies` play every other body and rated loadout
  (`HUMANOID_MODELS`, `REPRESENTATIVE`), the trials otherwise the same. Its summary reads each
  body and loadout apart.
- **A technique's cases** are those on a body it fits (`Part.fits`), from a position that body has
  an installed start in (`assets/research/posture-holds.json`). The Skeleton has none on hands
  and knees, so its sit-back is read on `moving-bodies` alone.

A technique's settings are searched on the same cases, one body at a time: the sit-back's
(`sit-back`) and the roll's (`roll`):

```powershell
node research/skills/skill-search.mjs <sit-back | roll> <model> --out .tmp/skill-search/<model>.json --patience 30
node research/skills/skill-search.mjs <sit-back | roll> <model> --confirm .tmp/skill-search/<model>.json --write
```

- **What it moves** (`SEARCHES`): for the sit-back, the joint angles its three stages drive
  toward, never their times; for the roll, the joint angles its four poses drive toward and each
  pose's time. A candidate is played as the body's record without being installed
  (`TechniqueCase.configs`, `stepUpTuningWith`).
- **Where the roll's settings live**: in the body's step-up record (`roll`, and `roll <pose>`
  times), its poses the game's (`ROLL_POSES`, found on the Warrior) where the record has none.
  The Skeleton has poses of its own; the Warrior's and the Rogue's are the game's.
- **What it plays**: the techniques that read the settings (the sit-back: `front-sit-back` and
  `sit-back`; the roll: `staged-roll`) on the `placed` rung, the body holding each rated loadout:
  60 trials a candidate for the sit-back, 90 for the roll. Its first candidate is the record as
  it stands.
- **A trial's score** is what the technique costs in play, in seconds: its time where it was done
  (the body stood, or lies on its front after a roll), its longest run where it was not, a little
  less the higher the body got.
- **How long**: with `--patience` and no `--generations` it runs for as long as it keeps
  improving and ends on its plateau; `--resume` goes on from an out file.
- **`--confirm`** plays the record the body plays now and the search's best on seeds the drill
  does not play, on `placed` and `moving`, and keeps the best only where it scores better and
  stands no fewer; `--write` installs a kept best and leaves a kept record as it is. The body's profiles are then stale: rebuild them
  in the same change ([the skill recipe](../recipes/skill.md#traps)), for the game's Mind; the
  table reads none.
