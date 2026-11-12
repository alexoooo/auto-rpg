# Stand-up drills: each way up on its own attempts

## Why

The owner, on the stand-up drill: "don't we want to be testing particular skills? For example, if
we have 2 ways up, one works and one doesn't, isn't it a bad thing that the successful one is
masking the failure of the bad one?" Then: keep the shoves ("don't we want our stand up skills to
be robust to different situations?"), handle a body next to an obstacle ("I often see stand up get
stuck when it's next to an object"), price a fall at a fixed cost, and close the gap between the
scenarios research plays and the drills hold.

What the table read before this plan:

- **One stand-up cell per body and loadout** (15): the stand-up target's falls
  (`rising-target`, [getting up](../reference/rising.md)), risen by the drills' mind, valued by the
  mean time to stand. Whichever way up was on offer ran and retried, so a way up that failed was
  masked by one that worked (the Rogue holding nothing looped staged-roll, staged-down, back down,
  for 30 s; front-sit-back, ranked after staged-down, was never tried).
- **No obstacle**: the obstacle levels (beside a column, against a wall, onto a bench, into a
  tomb; `GROUND_LEVELS`, `src/game/lab/ground-environment.ts`) were played only by the rising
  bed's `--obstacles` and the Lab.
- **No way up reads its surroundings**: no recovery skill or rise option reads the solids its body
  touches or senses; a way up begun beside an object meets it and stalls.

## The design

- **A cell per way up**, on each body and loadout it fits: the shoved falls kept, every direction
  and loadout, on open floor and on each obstacle level. The riser is the drills' mind with the
  tested way up first among its ways up (`withWaysUp`, `src/minds/option/rise.ts`): by rank, it runs
  whenever it is on offer, and no other way up runs in its place from a posture it starts from;
  the others, by rank, carry the body to its start postures. The cell reads the tested way up's
  own attempts (`RisingRow.attempts`): reached its destination or not, and its seconds, a failure
  at its cap. A fall that never reaches a posture it starts from is reported as not exercised, as
  a fall not made is now.
- **A way up that meets an object lets go.** As it runs, a way up that has met a solid and stopped
  making progress gives up, with the reason (`obstructed`); its Option notes a failed try and may
  begin it again, the staged roll over its other side. Where the way up is ranked first it is
  begun again before any other; a reposition is on offer only from a posture no way up begins
  from. It needs only what the body touches. Predicting a way up's room before
  it begins (where its body parts go, set against the solids it senses) is left for later, if
  reacting falls short. A cell counts its way up's attempts let go at an object apart from those that failed
  otherwise. Each choice below is the agent's, to be read again once the obstacle falls are
  played:
  - **Stuck** is 3 s with no stage new to the try and the body risen less than 5 per cent of its
    standing height, while it presses a fixed solid that bears none of it from below (`STUCK`).
  - **Another body pressed does not count**: a body moves, so pressing one is not being stuck.
  - **A try let go does not block the same way up** from the same place: with all four staged
    ways up fitting a body, no reposition is on offer, so a block would leave it lying.
  - **The attempt cap is 16 s** (`ATTEMPT_CAP`): an attempt that does not reach where it goes
    costs step up's whole attempt (`LIMIT`), however soon it ended.
- **A fall at a fixed price**, 10 s (the owner's scale, `STAND_WITHIN`), set to be changed if it
  reads wrong. A trial ending down in a strike or move cell is charged it, the same on every body,
  not the stand-up cell's value: no cell moves for a skill it does not read.
- **Getting up whole is not a skill cell.** How a mind chains ways up after a real fall is a
  fight's question; the target's composite reading stays an evaluation (`rising-target`), read in
  research, not a cell.
- **Falls from bouts**: the riser's mind, the cell's way up first, fights a copy of itself on the
  bout world, the same body and loadout; the first side down is the fall read, from that step, its
  way up's own attempts read as the shoved falls' are. A bout nobody falls in within its wait is a
  fall not made, not exercised. Its twin draws the bouts' starts halfway between.
- **Research scores on the drill** ([research on drills](2026-11-12-research-on-drills.md)): the
  ways up are searched on the drill's twin, the target's `fresh` falls, the cells' falls held
  out. Held only outside the drills before, and added to them: the obstacle levels (rising bed,
  Lab) and falls from bouts (`core-rise.mjs`). A probe, scoring no way up: `core-rise.mjs --shoves
  128`. The ground profiles' falls (`edge-profiles.mjs`) are outside
  on purpose: they measure profiles, not skills.

## Landed

- **A cell per way up** (staged-roll, staged-down, sit-back, front-sit-back on each body and
  loadout): the way-up drill (`src/evaluation/way-up/`, [getting up](../reference/rising.md#the-way-up-drill)),
  the target's shoved falls risen by the drills' mind with the read way up first
  (`withWayUpFirst`), valued by its seconds an attempt, an attempt not reaching where it goes at
  16 s (`ATTEMPT_CAP`), a fall never reaching a posture it begins from not exercised. Its twin is
  the fresh falls. The composite `rising-target` stays an evaluation, read in research.
- **A fall at a fixed price**, 10 s (`FALL_PRICE`), in every strike and move cell.
- **Research on the twin**: the sit-back and roll searches (`skill-search.mjs`) and
  `rise-search.mjs` score on the twin of the way-up cells of the ways up their record drives
  (`research/skills/recovery/way-up-trials.mjs`), each staged way up of the drills' Mind on the
  candidate, at 120 Hz, and confirm on the cells' own falls at 120 and 480 Hz, the worse counting.
  The Rise drill's placed starts and `rise-search.mjs`'s calibrated profiles score no search now.
- **The obstacle levels in the drill**: the fall bed places a level's solids as the Lab's
  Stand-up mode does (the tomb's step back toward it before the shove, the target's shove), and
  the way-up drill and its twin add the target's falls beside the column, the wall, the tomb and
  the bench: 80 falls a cell.
- **React when stuck**: a way up's ground skill lets go a try stuck against an object, ended
  `obstructed` (`STUCK`: no new stage and the body no higher by 5 per cent of its standing height
  for 3 s, meanwhile a fixed solid touched that bears none of the body from below,
  `GroundReading.against`). The Option notes a failed try and may begin again; the staged roll
  then rolls over its other side. The way-up drill counts the obstructed attempts. The 3 s is set
  by hand from the stages' times, not measured.
- **Falls from bouts in the drill** (`bouts`, its twin `bouts-fresh`,
  `src/evaluation/way-up/bouts.ts`): the riser's mind against a copy of itself on the open stage,
  Balance 0, nothing ending the bout but its reader; 30 s for a side to fall (`BOUT_WAIT`), then
  the fall read as the fall bed reads one, the standing side ordered to stand. The bouts start 2,
  3 and 4 m apart, the right side 1 m either way across or on the line (`BOUT_PLACES`): 9 a
  cell; the twin halfway between, 4.

## Open

- **How often a bout falls**: one bout played (the Rogue, empty hands, 2.5 m, 0.5 m across, the
  twin's) had no fall in its 30 s; how many of a cell's bouts are falls is unread.
- **A record shared by two ways up**: the step-up record drives staged-roll and staged-down, the
  sit-back record sit-back and front-sit-back, so a search of one record scores on both cells'
  twins and a confirmation means over both.

## The price

- The 15 stand-up cells are replaced by the way-up cells; their saved readings stay in the files.
- Every strike and move cell's value changes with the fixed fall price, recomputed from its saved
  trials, none replayed. Every cell already reads "not read" until played on `option-drill`.
- The roadmap's stand-up goal on the Rogue and the Skeleton is read on the way-up cells.
- A way-up cell plays 80 falls and 9 bouts, its twin 80 falls and 4 bouts: a table play of the
  60 way-up cells is 4800 falls and 540 bouts, a bout up to 64 s (`BOUT_SECONDS`). No way-up cell
  has a saved reading to void.

## Readings

```powershell
npm run evaluate -- table --skill sit-back                  # a way up's cells as saved
npm run evaluate -- way-up option-drill/sit-back --shard 1/10 # a slice of its drill
npm run evaluate -- rising-target option-drill --shard 1/10 # a slice of the composite on the drills' mind
node research/skills/recovery/rising-bed.mjs --obstacles    # the obstacle levels, research only now
```
