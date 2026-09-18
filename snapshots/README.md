# Six minds, and how to watch them

`tournaments/` is gitignored, so until this directory existed no mind this project has fitted could
be pulled onto another machine. These five can. Four are league pool members -- the weights, the
critic, the spread and the observation statistics the run accumulated -- plus two fields the weights
themselves cannot carry: `tactics`, the executor row the mind was **measured** under, and `note`,
prose for whoever opens the file. The fifth was never trained by a league at all; see below.

## Why `tactics` is in the file

A table of weights does not say whether the strokes it starts survive the ask that started them.
`latchAbort` shipped `false` until 2026-09-17 and ships `true` now, which is what every league from
experiment AM onward trained and rated under; un-latched, the abort gate is re-read on each of the
six or seven asks a stroke spans, so most strokes are abandoned -- the defect that cost experiments
S, U, X and Z their ratings.

**The "flinches out of nearly every swing" this file used to warn about is real and is a property
of the drawn read, not of the shipped row.** CP measured both on the same weights: drawn, an
un-latched mind completes **0.108** of the strokes it starts, which is a flinch out of nine swings
in ten; greedy it completes **0.594** un-latched against 0.566 latched, so the row is worth nothing
either way. Every rating in this record is greedy. So a file watched at the default is not flinching
and never was -- watch it at `snapshotDraw=1` and it is.

So the file names its executor and `src/golem/snapshot.ts` reads it. **Check the boot note or the
command readout: it should say `{"latchAbort":true}` and not `shipped executor`.** Since the
shipped row is now `true` those two agree for these four files, which is a reason to keep reading
the note rather than to stop: the field exists so a snapshot measured under *any* row says which,
and a file that names one the table does not have is still refused by name. A snapshot written
before the field existed still loads, under the shipped row, and still says so.

## Watching one

```
npm install
npm run dev
```

Then either open the page on port 5180 with a query of snapshot=ao-ramp11.json -- the dev server
lends a read-only window onto this directory, see `vite.config.ts` -- or open the setup screen and
drop the `.json` file on "Watch a snapshot". A further snapshotDraw=1 watches the drawn policy
rather than the greedy one; every rating in the record is greedy, and the two are different
fighters.

The opponent the record is stated against is `golem-fencer`, which is the screen's default.

## The four

| file | what it is | paired bar vs `golem-fencer` |
| --- | --- | ---: |
| `an-ramp2.json` | a typical mind of the twenty-four, seed 20260918 | +0.011 |
| `ao-ramp11.json` | the best of the twenty-four, seed 20260927 | +0.098 |
| `ao-flat11.json` | the same seed's control, no idle stage | -0.012 |
| `idle-far11.json` | stage one alone: 120 iterations against `--opponent idle` | not rated there |

Read the table honestly. The bar is a mean paired difference over 400 held-out bouts, and the
between-seed spread of six-seed batches of one manifest is about 0.03 -- so `ao-ramp11` is a mind
selected as the best on the very pool it is read on, and +0.098 is an upper bound rather than an
estimate. `an-ramp2` is the one to watch first, because it is not selected.

`idle-far11.json` is the mind that plainly learned something: over its arm the idle kill rate went
from 25 % to 67 % at t 6.30. Watch it against `golem-idle`, which is the task it was paid for.
Against `golem-fencer` it has never been asked to do anything.

## The sixth, and the only one here that beats every hand-coded mind

| file | vs `golem-idle` | vs `golem-brawler` | vs `golem-driver` | vs `golem-fencer` |
| --- | ---: | ---: | ---: | ---: |
| `ct-calib1.json` | 1.0000 | **1.0000** | **0.7969** | **0.8438** |
| `golem-driver`, for scale | 1.0000 | 0.3672 | 0.4805 *(mirror)* | 0.4531 |

`ct-calib1.json` is `cr-dagger1.json` with **twenty-one numbers** changed: a gain and an offset on
each of the nine command axes, and an offset on each of the three gates, folded into the output
layer. Nothing else about the network moved. The twenty-one were found by a (1+16) evolution
strategy against `golem-fencer` over twelve generations at 24 fresh seeds a candidate -- roughly
5,400 bouts, which is about what one useful policy-gradient iteration would have cost in this cell.

**Watch it for the distance, because that is what it changed.** Read back into command space the
calibration holds the point out to the axis stop (`reach` 0.700 to 1.000), leans in (`lean` 0.159 to
0.757), circles (`strafe` 0.162 to 0.560), closes less than half as far (`advance` 0.246 to 0.110)
and cuts lower. It throws **19 strokes a bout against the driver's 36** and completes every one of
them, where the driver completes fewer than half, and it wins three seconds sooner taking less
damage. It is the mind that stopped flailing forward.

**Two things it is not.** It is not a fencer-specialist, though it was searched against one: it
takes 128 of 128 from `golem-brawler`, which it has never met. And it is **not** a fighter at the
bottom rung -- against `golem-idle` it throws **no strokes at all** and wins only because the
overtime drain finishes a body that never touched it either. Its commit gate tops out at -0.93
against a motionless opponent and the calibration adds +0.71; it is short by a quarter of a logit.
CS3 in `docs/measurements.md` measures that, and it is a property of the features rather than of
this mind.

Its `score` and `baselines` are empty for the same reason `cr-dagger1.json`'s are, below.

## The fifth, which is not one of the four

| file | what it is | wins vs `golem-fencer`, cap 150 |
| --- | --- | ---: |
| `cr-dagger1.json` | `golem-driver`, copied -- no reward, no rollout | **43 of 128** |

`cr-dagger1.json` is not a league mind and nothing about the four above applies to it. It is a
supervised fit: 512 bouts of `golem-driver`'s own asks, 326,868 pairs of (71 pilot columns, 12
command fields), two rounds with the second collected from the states the first round's clone
actually reached. Experiment CR in `docs/measurements.md` is the whole story.

**Its `score`, `opponent`, `baselines` and reward rows are deliberately empty.** A clone is never
rolled out and never meets a reward, so there is no held-out points-a-bout for it to carry; the
fields exist only because every reader of a policy table expects them, and they were overwritten so
that the template's 0.546 could not be quoted as this mind's rating. The number above is from
`scripts/clone-duel.mjs`, paired seed by seed against the mind it was copied from.

**It is not the best mind here, and an earlier version of this file implied it was.** Over the same
128 seeds at a cap that clears the overtime ramp, `golem-driver` wins 58 and the shipped
`golem-policy` wins 72. The clone's 43 is below both. The claim that it beat the shipped mind came
from a duel capped at 60 s, where the policy's 77 undecided fights were scored as draws rather than
run to a finish; see the cap defect in `docs/measurements.md`.

Watch it the same way, and compare it to `golem-driver` rather than to the four: the thing to look
for is that it commits to the strokes it starts. It completes **all** of them, against the driver's
half, which is the one behaviour of the expert it did not copy.

The full record for the four is `docs/measurements.md`, experiments AM, AN and AO; for
`cr-dagger1.json` it is CR.
