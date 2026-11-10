# Options trained body by body

## Why

Each skill on every body as good as it can be made quickly.

The work follows the rules of developing an Option in [`AGENTS.md`](../../AGENTS.md), and the
table judges each cell against its baseline. A control defect a cell exposes (the roadmap's open
walking, stopping and approach contracts among them) is fixed at its own layer before that cell's
training goes on.

Its scope: the toed Warrior, Rogue and Skeleton with every loadout (empty hands, the club, the
sword, the club and buckler, the sword and buckler); the walk, stand-up, the punch and the club,
sword and buckler on all three; the run and the stomp on the Warrior and the Rogue. Where each cell
starts: [the table](../reference/the-table.md). How well the quadrupeds move is
[the rat](2026-11-01-rat.md)'s.

## What is required

- **Every cell's value raised**: each skill on every body in every loadout, unassisted, its value
  ([AGENTS.md](../../AGENTS.md#developing-skills-and-options)) read against its baseline, one search
  or training run at a time, kept where it gains, its ceiling named where it stops by the plateau
  and stopping rules of [AGENTS.md](../../AGENTS.md#doing-the-work).
- **Reference marks**, read beside the values and deciding nothing: stand-up within the owner's
  10 s ([rising](../reference/rising.md#the-owners-target)); the run at the owner's 3 to 4 m/s
  forward, the Warrior's by [Warrior travel](2026-11-05-warrior-travel.md).
- **One body serves every skill on it**: a body change is read on all of them, each loss reported
  beside the gain.

## Steps

Each lands green on its own: `npm run check`, `npm test`, `npm run build` where browser code or
assets change, and a toolkit change's message names the fingerprint cases it moves. A defect found
on the way is fixed to its own layer's contract before the training goes on.

### 1. Stand-up

The Warrior first, in every loadout and on fresh falls; then the Rogue and the Skeleton. A recovery record may adjust its poses and timings by loadout. A body
gets its own technique where it reads better than the shared one. A ground technique
bears on the ends it needs from where the body is (`BodySpec.ends`,
`carryRoot`, `bearLimbs`, `src/control/bearing.ts`) and holds only the limbs it moves. Check:
the target on every body and loadout, and on fresh falls; rising in fights no worse; the owner
looks in the Lab's Stand-up mode.

### 2. The run

The Warrior follows [Warrior travel](2026-11-05-warrior-travel.md); its recovery remains serviceable while
travel is developed. The Rogue runs on toes in every loadout, then priced by its own profile, measured from its starts as every Option's is, so that Option Mind chooses it where it
pays. Where the toes or the body are the limit, the limit is read and the body's numbers are set
for the result, sourced as tuned for it.
Check: the Locomotion drill's run; stand-up read beside it; the owner watches the run in the Lab's
Locomotion courses and in the Arena.

### 3. The walk and the strikes on every body

Best effort, in order: the walk, the punch, the stomp (the Warrior and the Rogue), the club blow,
the sword's cut and thrust, the buckler's cover; each on the Warrior, then on the Rogue and the
Skeleton, seeded from the Warrior's where that starts higher, each body's own record searched or
trained on its own body, and its own variant where it reads better than the shared one. Check:
each cell's held-out reading at 120 and 480 Hz against its baseline; the claim its table
cell, checked by a fresh agent.

## Done when

- Every cell holds its best reading, its baseline and its ceiling named; [the table](../reference/the-table.md) is rewritten from the readings.
