# Four minds, and how to watch them

`tournaments/` is gitignored, so until this directory existed no mind this project has fitted could
be pulled onto another machine. These four can. Each file is a league pool member -- the weights,
the critic, the spread and the observation statistics the run accumulated -- plus two fields the
weights themselves cannot carry: `tactics`, the executor row the mind was **measured** under, and
`note`, prose for whoever opens the file.

## Why `tactics` is in the file

A table of weights does not say whether the strokes it starts survive the ask that started them.
`latchAbort` ships `false`; every league from experiment AM onward trained and rated with
`latchAbort=true`. Un-latched, the abort gate is re-read on each of the six or seven asks a stroke
spans, so most strokes are abandoned -- which is the defect that cost experiments S, U, X and Z
their ratings. Watching one of these files under the shipped row would show a mind that flinches
out of nearly every swing, and would look like training that did nothing.

So the file names its executor and `src/golem/snapshot.ts` reads it. **Check the boot note or the
command readout: it should say `{"latchAbort":true}` and not `shipped executor`.** A snapshot
written before this field existed still loads, under the shipped row, and still says so.

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

The full record for all of this is `docs/measurements.md`, experiments AM, AN and AO.
