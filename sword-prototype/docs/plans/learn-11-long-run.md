# Session 11 -- the long run, at the throughput 04 and 05 bought

**Status (2026-09-11): landed. The bar was missed on both halves.** Four hundred iterations of
four hundred, from scratch, no restarts, 05:20 to 10:42 on one host. The bar asked for a paired
margin of d 0.2 over `golem-fencer` on random viable pairs at 600 bouts and seed 20260906 and got
**d -0.024**; it asked that the same mind lose nothing to `golem-driver` mirrored beyond one
standard error and got a loss of 4.7 of them. Nothing ships and `src/units.ts` still screens
`golem-fencer`. The answer to "does it just need more training" for this configuration is **no**:
over the last hundred iterations three of twenty-five per-iteration columns are past two sigma and
all three are the policy's own spread widening under a fixed entropy coefficient. The curve, the
pilot that chose the bout count and settled `holdMyReach`, the realised mirror share of 0.667 that
the bout count cost, and the deviations are in `../measurements.md`. The human gate below is open
and is the owner's to answer on the run's final snapshot through `golem-snapshot`.

## Outcome

One run of the configuration Sessions 06 to 10 chose, long enough that the question "does it
just need more training" -- the owner's own first read of the shipped mind, and the one the
record answered no to for the shipped league -- is answered on this configuration by a curve
with a slope and a t, rather than by a night that ended before its last iteration. The owner
asked for more and different training; this is the more, after the different.

## Frozen choices

- **One arm, every core.** The sweep runner is not used: this is the run the sweeps were for.
  Session 05's shards take the fit and the remaining threads collect; `--bouts` is raised to the
  number the curve of a short pilot says the fit can use, 64 to start, because the record's
  argument for more bouts -- better gradients, fit time growing linearly -- is now cheap on the
  fit side.
- **The curve is read as the record says to read one**: a per-iteration column over at least
  ten iterations, a slope with its t, and the expectation of two false trends in twenty-four
  columns. `rate-snapshots` every 8 iterations on both pools, 300 bouts a point, from the same
  seed throughout.
- **It ships only under Session 10's bar**, re-taken at the end at 600 bouts on random viable
  pairs against `golem-fencer`, whatever the curve did.
- **The run may die and resume**: every iteration checkpoints with its Adam state; the runner's
  restart path is used by hand if needed and each restart is a row in the log.

## Implement

1. A pilot of 20 iterations at `--bouts 32`, 64 and 128 with Session 05's shards, on the chosen
   configuration, to take the fit and collect seconds per iteration and the rating at 20 for
   each; the bouts that give the best rating per hour are the run's.
2. The run: `../../scripts/league.mjs` with the chosen flags, `--iterations 400`, `--shards 8`,
   `--workers 22`, `--evaluate 0`, seed 20260916, `--from` the Session 10 winner or the shipped
   main if there was none, into tournaments/league-long; `rate-snapshots` and `probe-snapshots`
   from a second process every 8 iterations as snapshots appear, on both pools, so the curve page
   reads it live. Session 02's page gains the live re-fetch here, a `setInterval` over its
   reader.
3. After: the rating curve on both pools with the slope over the last 100 iterations and its t;
   the decided fraction, stall and outside seconds over the run; the idle-probe curve by class;
   the two ratings at the end at 600 bouts; into `../measurements.md`. Ship or not, per the bar.
4. `../../src/golem/policy-weights.ts` regenerated only if the bar clears, with the run's
   provenance in its header as today.

## Human gate

The set's third eye gate: the owner watches a dozen random viable matchups of whatever this
session ships -- or of its final snapshot through `golem-snapshot` if nothing ships -- and says
whether the golems fight. Verdict into this file's status line, with the hedge if there is one.
The mechanical bar before that is Session 10's, re-taken.

## Verification

```powershell
npm run check
node --test tests/league.test.mjs tests/ppo.test.mjs tests/curve.test.mjs tests/docs.test.mjs
npm test
npm run build
git diff --check -- .
```

## What remains

A second long run from a different seed, to say how much of the curve is the seed, is the
control this session does not run; its cost is one more night and the close-out says whether
the curve's t made it necessary.
