# Options trained body by body

## Why

Each skill as good as it can be made quickly, with two hard requirements: every character stands
up reliably in under 10 s, and the Warrior and the Rogue run reliably.

It follows [Option Mind general](2026-11-03-option-mind-general.md), which fixes the known bugs,
makes every act an Option, tells bodies apart in data, puts the rules of developing an Option in
[`AGENTS.md`](../../AGENTS.md) and makes the table judge each cell against its baseline. The work
here follows those rules.

Its scope: the toed Warrior, Rogue and Skeleton with every loadout (empty hands, the club, the
sword, the club and buckler, the sword and buckler); the walk, stand-up, the punch and the club,
sword and buckler on all three; the run and the stomp on the Warrior and the Rogue. Where each cell
starts: [the table](../reference/the-table.md). How well the quadrupeds move is
[the rat](2026-11-01-rat.md)'s.

## What is required

- **Stand-up, hard**: the owner's target ([rising](../reference/rising.md#the-owners-target)) on
  every body in every loadout, unassisted, held again on fresh falls.
- **The run, hard**, on the Warrior and the Rogue in every loadout, calm air and the lab's gusts,
  seeds 1 to 4, none fallen: 3 m/s forward held 10 s, a turn at 1 rad/s at 2 m/s, a stop from
  3 m/s within 1.5 s; read as the slowest second of the hold at 3 m/s, of the turn at 1.8 m/s with
  the way travelled at most 0.35 rad behind the way asked, and a stop asked at 2.7 m/s or more and
  under 0.15 m/s within 1.5 s. 3 m/s is a floor (the owner's decision); faster is better.
- **Every other cell, best effort**: read against its baseline, one search or training run under an
  hour, kept where it gains, its ceiling named where it stops.
- **Guards**: no push of work ends with stand-up or the run set back, and no Option makes its body
  fall; one leg serves stand-up and the run, so every leg change is read on that body's stand-up
  and gait.

## Steps

Each lands green on its own: `npm run check`, `npm test`, `npm run build` where browser code or
assets change, and a toolkit change's message names the fingerprint cases it moves. A defect found
on the way is fixed to its own layer's contract before the training goes on.

### 1. Stand-up

The Warrior first, reliably within 10 s on the target in every loadout and on fresh falls; then
the Rogue and the Skeleton. A recovery record may adjust its poses and timings by loadout. A body
gets its own technique where the shared one's ceiling on it is read short. A ground technique
bears on the ends it needs from where the body is (`BodySpec.ends`,
`carryRoot`, `bearLimbs`, `src/core/control/bearing.ts`) and holds only the limbs it moves. Check:
the target on every body and loadout, and on fresh falls; rising in fights no worse; the owner
looks in the Lab's Stand-up mode.

### 2. The run

On toes on the Warrior and the Rogue to the requirement in every loadout, then priced by its own
profile, measured from its starts as every Option's is, so that Option Mind chooses it where it
pays. Where the toes or the body are the limit, the limit is read and the body's numbers are set
for the result, sourced as tuned for it.
Check: the Locomotion drill's run; the stand-up target held; the owner watches the run in the Lab's
Locomotion courses and in the Arena.

### 3. The walk and the strikes on every body

Best effort, in order: the walk, the punch, the stomp (the Warrior and the Rogue), the club blow,
the sword's cut and thrust, the buckler's cover; each on the Warrior, then on the Rogue and the
Skeleton, seeded from the Warrior's where that starts higher, each body's own record searched or
trained on its own body, and its own variant where the shared one's ceiling is read short. Check:
each cell's held-out reading at 120 and 480 Hz against its baseline and its drill link; its reel
watched, the failures first; the owner accepts each rung.

## Done when

- Stand-up meets the owner's target on every body and loadout, and the run its requirement on the
  Warrior and the Rogue in every loadout.
- Every other cell holds its best reading, its baseline and its ceiling named, and the owner has
  accepted its rung; [the table](../reference/the-table.md) is rewritten from the readings.
