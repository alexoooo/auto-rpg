# Getting up

Three readings of a body getting up. Each one's protocol is its module's header comment; this
page holds which reading answers which question, its command and its counts.

| Reading | Answers | Code |
| --- | --- | --- |
| [The way-up drill](#the-way-up-drill) | one way up's own attempts: the table's cells | `src/evaluation/way-up/` |
| [The owner's target](#the-owners-target) | a mind's whole rise after a fall: research, no cell | `src/evaluation/rising-target/` |
| [The Rise drill](#one-technique-alone) | one technique with no mind choosing: where a technique is developed | `src/evaluation/rise/` |

## The way-up drill

```powershell
npm run evaluate -- way-up [option-drill/<way up> ...] [--protocol fresh | bouts | bouts-fresh]
```

- **The falls**: the owner's target's sixteen shoves on the open floor and beside each obstacle
  (`GROUND_LEVELS`), 80 a body and loadout, and 9 falls from bouts of the riser against a copy of
  itself (`--protocol bouts`, `BOUT_PLACES`). The cell pools every counted fall.
- **The riser and the value** (`attemptsValue`, `ATTEMPT_CAP`) are [the table](the-table.md)'s:
  the drills' Mind with the way up read ranked first, seconds an attempt.
- **`fresh` and `bouts-fresh`** are the training twins
  ([the skill recipe](../recipes/skill.md#research-scores-on-its-drill)).
- **One record, two ways up**: the step-up record drives staged-roll and staged-down, the
  sit-back record sit-back and front-sit-back, so a search of one record reads the cells of both.

## The owner's target

```powershell
npm run evaluate -- rising-target [riser ...] [--protocol fresh]
```

- **The falls**: the Warrior, the Rogue and the Skeleton in each of the five rated loadouts, each
  shoved sixteen ways: 240, Steadiness 0 and Grit 0, a 30 s cap.
- **A riser** is a mind by its preset's or kind's name (`option-drill`, the table's; `option`,
  the game's), the game's Stand up (`game`, where none is named), `stand-up` with every
  technique, or a technique's name.
- **The value** (`timeToStand`): the mean time from the body first down to a verified stand
  (`STAND_CHECK`), a fall not stood at the cap; lower better. The owner's 10 s a fall
  (`STAND_WITHIN`) is reported beside it.
- **Against people**: young adults rising from the floor at a comfortable rate take 1.4 to 2.6 s
  by starting position, healthy older adults 2.4 to 5.5 s (Alexander et al. 1997), and young
  adults asked for speed stand from prone in about 2 s
  ([Resisting arrest](https://research.bond.edu.au/en/publications/resisting-arrest-analysis-of-different-prone-body-positions-on-ti/),
  Bond University); the target's clock also holds the landing before the rise and the regain
  after it.

## One technique alone

```powershell
npm run evaluate -- rise [technique ...] --protocol <placed | moving | placed-bodies | moving-bodies>
```

- **`placed`**: the technique begun from each position it starts in, the body at rest, six seeds.
  **`moving`**: begun as the route hands the body over, after the techniques before it.
- **The bodies**: `placed` and `moving` play the Warrior with empty hands and with the club and
  buckler; the `-bodies` protocols every other body and rated loadout.
- **The Skeleton has no installed start on hands and knees** (`assets/research/posture-holds.json`),
  so its sit-back is read on `moving-bodies` alone.

## Searching a way up's settings

```powershell
node research/skills/skill-search.mjs <sit-back | roll> <model> --out .tmp/skill-search/<model>.json --patience 30
node research/skills/skill-search.mjs <sit-back | roll> <model> --confirm .tmp/skill-search/<model>.json --write
```

- **What it moves** is `SEARCHES`: the sit-back's stage times, its postures authored; the roll's
  pose angles and each pose's time. The Skeleton has roll poses of its own; the Warrior's and the
  Rogue's are the game's (`ROLL_POSES`).
- **It plays the twins** of the cells the record drives, one body at a time, and ends as
  [the skill recipe's search](../recipes/skill.md#4-tune-its-timings-and-gains)
  does.
- **`--confirm`** plays the record as it stands and the search's best on the cells' own falls;
  `--write` installs a best that is kept. The body's profiles are then stale: rebuild them in the
  same change ([the skill recipe](../recipes/skill.md#5-install-and-confirm)).
- **A loadout's staged settings** (the step-up's stage times and poses, the climb) are searched
  the same way by `research/skills/recovery/implementations/staged/rise-search.mjs`.
