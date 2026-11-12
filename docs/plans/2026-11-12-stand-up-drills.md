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
  making progress gives up, with the reason, and rank falls through to the next way up, then a
  reposition (a roll away). It needs only what the body touches. Predicting a way up's room before
  it begins (where its body parts go, set against the solids it senses) is left for later, if
  reacting falls short. A cell counts its way up's attempts let go at an object apart from those that failed
  otherwise.
- **A fall at a fixed price**, 10 s (the owner's scale, `STAND_WITHIN`), set to be changed if it
  reads wrong. A trial ending down in a strike or move cell is charged it, the same on every body,
  not the stand-up cell's value: no cell moves for a skill it does not read.
- **Getting up whole is not a skill cell.** How a mind chains ways up after a real fall is a
  fight's question; the target's composite reading stays an evaluation (`rising-target`), read in
  research, not a cell.
- **Research scores on the drill** ([research on drills](2026-11-12-research-on-drills.md)): the
  ways up are searched on the drill's twin, the target's `fresh` falls, the cells' falls held
  out. Held only outside the drills now, and added to them: the obstacle levels (rising bed, Lab)
  and falls from bouts (`core-rise.mjs`). Probes, scoring no way up: `core-rise.mjs --shoves
  128`, `rise-search.mjs --offsets`. The ground profiles' falls (`edge-profiles.mjs`) are outside
  on purpose: they measure profiles, not skills.

## Landed

- **A cell per way up** (staged-roll, staged-down, sit-back, front-sit-back on each body and
  loadout): the way-up drill (`src/evaluation/way-up/`, [getting up](../reference/rising.md#the-way-up-drill)),
  the target's shoved falls risen by the drills' mind with the read way up first
  (`withWayUpFirst`), valued by its seconds an attempt, an attempt not reaching where it goes at
  16 s (`ATTEMPT_CAP`), a fall never reaching a posture it begins from not exercised. Its twin is
  the fresh falls. The composite `rising-target` stays an evaluation, read in research.
- **A fall at a fixed price**, 10 s (`FALL_PRICE`), in every strike and move cell.

## Open

- **Research on the twin**: `rise-search.mjs` and the sit-back and roll searches still score on
  their own scenarios.
- **The obstacle levels and falls from bouts** in the drill.
- **What "stopped making progress" reads**: a way up's stage not advancing for some time while a
  segment touches a solid that is not the ground; the time is not tuned without playing.
- **A record shared by two ways up**: the step-up record drives staged-roll and staged-down, the
  sit-back record sit-back and front-sit-back, so a search of one record reads two cells.

## The price

- The 15 stand-up cells are replaced by the way-up cells; their saved readings stay in the files.
- Every strike and move cell's value changes with the fixed fall price, recomputed from its saved
  trials, none replayed. Every cell already reads "not read" until played on `option-drill`.
- The roadmap's stand-up goal on the Rogue and the Skeleton is read on the way-up cells.

## Readings

```powershell
npm run evaluate -- table --skill sit-back                  # a way up's cells as saved
npm run evaluate -- way-up option-drill/sit-back --shard 1/10 # a slice of its drill
npm run evaluate -- rising-target option-drill --shard 1/10 # a slice of the composite on the drills' mind
node research/skills/recovery/rising-bed.mjs --obstacles    # the obstacle levels, research only now
```
