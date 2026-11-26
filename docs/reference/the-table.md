# The table

Every skill of the drills' Option Mind (`option-drill`: hand-set priors, its options in their
order, no profile, no tree search) on every body and loadout that has it, each cell valued in the
game's own terms. The cells and their readings are `src/evaluation/table/cells.ts`, their judging
`src/evaluation/table/judge.ts`; each symbol's comment says what it computes.

| Skill | Value | Better |
| --- | --- | --- |
| staged-roll, staged-down, sit-back, front-sit-back | a way up's seconds an attempt on the falls that reach a posture it begins from, an attempt not reaching where it goes at 16 s (`attemptsValue`, [the way-up drill](rising.md#the-way-up-drill)) | lower |
| walk, run | seconds lost against the orders (`orderTime`), a trial ended down charged the rest of a fall's price (`ordersValue`) | lower |
| punch, stomp, kick, bonk, thrust, bite | life taken from the target less life lost, a second of the action's cycle from its start to the limb back at guard (its strike point back where it was against the segment the limb is carried from), a fall adding a fall's price; 0 for a blow not begun where it was asked (`strikeTrade`, `strikeOffered`) | higher |
| buckler-cover | life lost to the opponent's blows over the trial, those while down among them (`coverValue`) | lower |

- **A cell reads its skill on its own merit**, in a drill built for it, never in a fight, and no
  profile decides anything in it: a change to a skill is read without rebuilding its profiles
  ([the skill recipe](../recipes/skill.md#research-scores-on-its-drill)).
- **A way up has a cell of its own**, its Mind ranking it first among its ways up, so a way up
  that fails is not masked by one that works. How a mind chains its ways up after a fall is read
  on the owner's target in research ([getting up](rising.md)), never in a cell.
- **A fall's price** is the owner's 10 s (`FALL_PRICE`), the same on every body and loadout, so no
  cell moves for a way up it does not read.
- **What does not count** is reported beside the value: a fall not made or not exercised, a blow
  whose fixture did not reach its case, a cover never attacked. A reading counts only over its
  whole protocol, every case present and none faulted.
- **Seconds lost against the orders**: short of the pace asked (faster gains nothing); with no
  pace, short of 4 m/s (`UNPACED`, a person's run), so faster gains; under a stop, every second
  not standing still. A body down makes no progress.
- **The figures beside** a value decide nothing: a strike's hit against the person's (`BAR`), a
  way up's attempts reached, the share of blows the buckler met first.

## Baseline and twin

- **A cell is compared with its baseline**, its first reading when its work begins, trial by trial
  on the conditions both counted (`compareValues`): better or worse where the 95 % paired
  bootstrap interval of the mean difference leaves zero on that side, else within noise.
- **Every protocol a cell reads names its training twin** (`Cases.twin`,
  `src/evaluation/twin.ts`), as many situations as the cell's at none of its, which research
  scores on ([the skill recipe](../recipes/skill.md#research-scores-on-its-drill)). The table itself reads
  120 Hz only.
- **A reading stands as it was read**, shown with its commit and date, until its cell is asked
  for again: a change to the code asks for no replay. The fingerprint names the readings a change
  moves, a trial of each (`node scripts/fingerprint.mjs`, its `table` cases), to play again with
  `--fresh`.

## Commands

```powershell
npm run evaluate -- table                                # the grid from saved results; plays nothing
npm run evaluate -- table --body <b> --skill <s> --loadout <l>   # those cells' readings, outcomes and Ratings links after the grid
npm run evaluate -- table --skill <s> --by <field>       # outcomes at each value of a condition's field (mark, hand, gap, across, start)
npm run evaluate -- table --play --workers 22            # play each reading with no whole result, and keep it
npm run evaluate -- table --skill <s> --fresh            # play those cells again on the code now, compared with the reading replaced
npm run evaluate -- table --baseline                     # name each whole reading its cell's baseline where the cell has none; never overwritten
```

- The flags are `scripts/table.mjs`'s, in its header.
- `--play` and `--fresh` play one reading at a time, each to evaluate's budget (10 minutes), keep
  every trial played, and name a reading that failed at the end. Repeat the pass until none
  plays. A reading that is not whole cannot become a baseline.
- A Ratings link follows the built game served on a port of its own (`npm run build`, then
  `npm run preview -- --port <port> --strictPort`).
