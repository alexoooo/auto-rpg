# Stand-up drills: each way up on its own attempts

## Why

The owner, on the stand-up drill: "don't we want to be testing particular skills? For example, if
we have 2 ways up, one works and one doesn't, isn't it a bad thing that the successful one is
masking the failure of the bad one?" Then: keep the shoves ("don't we want our stand up skills to
be robust to different situations?"), handle a body next to an obstacle ("I often see stand up get
stuck when it's next to an object"), price a fall at a fixed cost, and close the gap between the
scenarios research plays and the drills hold.

What the table reads now (`src/evaluation/table/cells.ts`, `STAND_UP`):

- **One stand-up cell per body and loadout** (15): the stand-up target's falls
  (`rising-target`, [getting up](../reference/rising.md)), each body shoved sixteen ways, risen by
  the drills' mind (`option-drill`, its options run by rank since `37f9be19`). Its value is the
  mean time to stand. Whichever way up is on offer runs and retries, so a way up that fails is
  masked by one that works: on the tree it was not chosen again; by rank it is retried, and the
  cell is slow without saying which way up failed (the Rogue holding nothing loops staged-roll,
  staged-down, back down, for 30 s; front-sit-back, ranked after staged-down, is never tried).
- **No obstacle.** The target's falls are on open floor and refuse obstacle rows
  (`src/evaluation/rising.ts`, `risingReport`). The obstacle levels (beside a column, against a
  wall, onto a bench, into a tomb; `GROUND_LEVELS`, `src/game/lab/ground-environment.ts`) are
  played only by the rising bed's `--obstacles` and the Lab.
- **No way up reads its surroundings.** No recovery skill or rise option reads the solids its body
  senses (only navigation does, `src/skills/locomotion/navigation/`); `clearance`
  (`src/control/ground.ts`) is the body's gap above the ground. A way up begun beside an object
  meets it and stalls.
- **A fall's price is the stand-up cell's value.** Every strike and move cell charges a trial that
  ends down its body and loadout's current time to stand (`scripts/table.mjs`, `rises`; since
  `3844aacc`), so a change to a way up moves every strike and move cell of that body, which did
  not change. How often a skill falls is already a figure beside it ("fell, share of trials").

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
- **Drills hold every situation the skill is tried in.** A search or training scores on drill
  trials; a scenario played only in research is a gap. Held only outside the drills now, for
  stand-up: the obstacle levels (rising bed, Lab), `core-rise.mjs --shoves 128`, `rise-search.mjs
  --offsets`. The ground profiles' falls (`edge-profiles.mjs`) are outside on purpose: they
  measure profiles, not skills. Every other skill's research goes past its drill too
  ([the drill gaps](../analysis/2026-11-12-drill-gaps.md)).

## Open

- **What "stopped making progress" reads**: a way up's stage not advancing for some time while a
  segment touches a solid that is not the ground; the time and the progress measure are read
  from the obstacle falls.
- **How each skill's gap closes** ([the drill gaps](../analysis/2026-11-12-drill-gaps.md)).

## The price

- The 15 stand-up cells are replaced by the way-up cells; their saved readings stay in the files.
- Every strike and move cell's value changes with the fixed fall price, recomputed from its saved
  trials, none replayed. Every cell already reads "not read" until played on `option-drill`.
- The roadmap's stand-up goal on the Rogue and the Skeleton is read on the way-up cells.

## Readings

```powershell
npm run evaluate -- table --skill stand-up                  # the stand-up cells as saved
npm run evaluate -- rising-target option-drill --shard 1/10 # a slice of the composite on the drills' mind
node research/skills/recovery/rising-bed.mjs --obstacles    # the obstacle levels, research only now
```
