# Getting up

How a body getting up is read: each way up on its own attempts (the way-up drill, the table's
cells), a mind's whole rise (the owner's target, read in research) and a technique alone (the Rise
drill) (`src/evaluation/rising.ts`, `src/evaluation/way-up/`, `src/evaluation/rising-target/`).

## The way-up drill

```powershell
npm run evaluate -- way-up [option-drill/<way up> ...] [--protocol fresh]
```

- **The falls**: the owner's target's (below), every body in every rated loadout shoved sixteen
  ways on the open floor, on the fall bed (`buildFall`), each a case of every way up that fits the
  body holding its loadout.
- **The riser**: the drills' Option Mind (`option-drill`) with the way up read ranked first among
  its ways up (`wayUpMind`, `withWayUpFirst`): by rank it runs wherever it is on offer, and no other
  way up runs in its place from a posture it begins from; the others, by rank, carry the body to
  where it begins. A way up that fails is not masked by one that works.
- **What a fall reads**: the read way up's own attempts (`wayUpAttempts`), each ended where it goes
  (`done`) or not. A fall that never reaches a posture the way up begins from is not exercised, and
  one not made is not counted, as on the target.
- **The value**, on each body and loadout's falls (`attemptsValue`): each fall's mean seconds an
  attempt, one that did not reach where it goes at 16 s (`ATTEMPT_CAP`, the staged route's whole
  attempt), the mean over the falls exercised; lower better. The table's cell of a way up reads it
  ([the table](the-table.md)). Its outcome: reached (every attempt), failed, not exercised, or no
  takeover.
- **The fresh falls** (`--protocol fresh`): the same shoved 11.25 degrees past each direction
  (`FRESH_OFFSET`), the drill's training twin. Research scores on them and holds the cells' own
  falls out ([the skill recipe](../recipes/skill.md#an-options-code)).
- **One record, two ways up**: the step-up record drives staged-roll and staged-down, the sit-back
  record sit-back and front-sit-back, so a search of one record reads the cells of both.

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
  air, Balance 0 and Grit 0, a 30 s cap. A riser is a mind by its preset's or kind's name (`option-drill`, the table's; `option`, the game's), on its own
  character, refused on a body it cannot rise as holding the fall's loadout; or the game's Stand
  up (`game`, where none is named), `stand-up` with every technique, or a technique's name, each
  on the drills' mind (`option-drill`).
- **The fresh falls** (`--protocol fresh`): the same bodies and loadouts shoved 11.25 degrees past
  each direction (`FRESH_OFFSET`), read the same way.
- **The timing**: from the riser's takeover (the body first down) to a stand verified by
  `STAND_CHECK` (`standCheck`), through landing, orientation and retries. A fall not stood counts
  at the cap.
- **The value**, on each body and loadout's sixteen falls: the mean time to stand over the falls
  made, a fall not stood at the cap (`timeToStand`), lower better. How a mind chains its ways up
  after a real fall is a fight's question: no table cell reads the target, and research reads it
  beside the way-up drill. The owner's 10 s a fall (`STAND_WITHIN`) is reported beside it, and is
  the fixed price of a fall in every cell but a way up's.
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

## Searching a way up's settings

A staged record's settings are searched on the cells of the ways up it drives
([the way-up drill](#the-way-up-drill)), one body at a time: the sit-back record's (`sit-back`,
driving `sit-back` and `front-sit-back`) and the step-up record's roll (`roll`, driving
`staged-roll` and `staged-down`):

```powershell
node research/skills/skill-search.mjs <sit-back | roll> <model> --out .tmp/skill-search/<model>.json --patience 30
node research/skills/skill-search.mjs <sit-back | roll> <model> --confirm .tmp/skill-search/<model>.json --write
```

- **What it moves** (`SEARCHES`): for the sit-back, the joint angles its three stages drive
  toward, never their times; for the roll, the joint angles its four poses drive toward and each
  pose's time. Each angle's search range is intersected with the body's joint ranges on both sides
  and rounded inward to the candidate's precision (`searchOn`). A candidate is played as the
  body's record without being installed: every staged way up of the drills' Mind takes the
  candidate's whole tuning (`stagedValue`, `research/skills/recovery/way-up-trials.mjs`).
- **Where the roll's settings live**: in the body's step-up record (`roll`, and `roll <pose>`
  times), its poses the game's (`ROLL_POSES`, found on the Warrior) where the record has none.
  The Skeleton has poses of its own; the Warrior's and the Rogue's are the game's.
- **What it plays**: the twin of each of those cells on the body, every loadout it has one on or
  `--loadout`'s (the way-up drill's fresh falls), at 120 Hz. Its first candidate is the record as
  it stands.
- **A trial's score** is its cell's value negated: the way up's seconds an attempt, an attempt
  not reaching where it goes counted at `ATTEMPT_CAP`; a fall the way up is not tried on scores
  nothing.
- **How long**: with `--patience` and no `--generations` it runs for as long as it keeps
  improving and ends on its plateau; `--resume` goes on from an out file.
- **`--confirm`** plays the record the body plays now and the search's best on each cell's own
  falls at 120 and 480 Hz, the worse counting, and keeps the best only where it scores better
  there with no more falls an attempt did not reach, as every skill's search keeps one; `--write`
  installs a kept best and leaves a kept record as it is. The body's profiles are then stale:
  rebuild them in the same change ([the skill recipe](../recipes/skill.md#traps)), for the game's
  Mind; the table reads none.
- **A loadout's staged settings** (the step-up's stage times and poses, the climb) are searched
  the same way by `research/skills/recovery/implementations/staged/rise-search.mjs`, on the twin
  of the body's four staged way-up cells holding that loadout; `--confirm <out>` plays its best
  and the body's records on the cells' own falls at 120 and 480 Hz (`confirmRow`,
  `research/drill-trials.mjs`).
