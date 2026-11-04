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
  is given again the same way 1.5 s later, at most three (`SHOVED`, `src/lab/ground-mode.ts`). A
  fall not made is no stand-up.
- **The conditions**: Node stand, core world, Rapier, 120 Hz, calm air, Balance 0 and Grit 0, a
  30 s cap. A riser is a mind by its preset's or kind's name (`option`, the table's), on its own
  character, refused on a body it cannot rise as holding the fall's loadout; or the game's Stand
  up (`game`, where none is named), `stand-up` with every technique, or a technique's name.
- **The fresh falls** (`--protocol fresh`): the same bodies and loadouts shoved 11.25 degrees past
  each direction (`FRESH_OFFSET`), read against the same gates. Nothing is tuned on them: they
  show whether a gain is fitted to the target's falls.
- **The timing**: from the riser's takeover (the body first down) to a stand verified by
  `STAND_CHECK` (`standCheck`), through landing, orientation and retries. A fall not stood counts
  at the cap.
- **The bar**, on each body and loadout's sixteen falls (`targetGates`): every direction present
  once; at least 15 within `STAND_WITHIN`, 10 s; every cardinal direction within 10 s; a
  failure-inclusive median of at most 10 s. A riser meets the target where every body and loadout
  meets its bar, on Balance 0 and Grit 0 (`risingReport`'s gates); the table reads each body and
  loadout's alone (`stand-up`, [the table](the-table.md)).
- **Against people**: young adults rising from the floor at a comfortable rate take 1.4 to 2.6 s
  by starting position, healthy older adults 2.4 to 5.5 s (Alexander et al. 1997), and young
  adults asked for speed stand from prone in about 2 s
  ([Resisting arrest](https://research.bond.edu.au/en/publications/resisting-arrest-analysis-of-different-prone-body-positions-on-ti/),
  Bond University); the target's clock also holds the landing before the rise and the steadying
  after it.
