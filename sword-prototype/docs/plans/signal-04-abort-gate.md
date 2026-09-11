# Session 04 -- a stroke that survives six coin flips

**Status (2026-09-11): planned. Needs 02 and 03.**

## Outcome

The abort gate stops being a fresh Bernoulli draw on every ask of a stroke, behind a flag, and the
shipped weights are rated with it on and off -- **without a single training iteration**. Then the
set closes with the one table it exists to produce: for each of the four findings, what it cost to
establish, what it moved, and what the next experiment would cost.

## The arithmetic, stated before the data

In `plan()` in `../../src/golem/tactics-v4.ts`, under the comment *"the gates, read every step from
the command in force"*, the test is `striking && command.abort >= 0.5` against the **held** command.
The comment's reasoning is right for `commit` -- a standing order to strike means "as soon as the
arm is free", which is v3's `wait` written as a number -- and it is exactly backwards for `abort`.

The command refreshes at each ask, and `askHz` is 12. A stroke runs `arc.chamberSeconds` and then
until `elapsed >= max(T.commitSeconds, arc.strokeSeconds + T.followSeconds)`. With
`chamberSeconds` 0.22 to 0.40 across the blended shapes, `commitSeconds` 0.22, `strokeSeconds` 0.12
to 0.22 and `followSeconds` 0.07, a stroke is **0.44 to 0.69 s, five to eight asks**. The gate is
drawn afresh on each of them, so a stroke survives with probability `(1 - p)^k`:

| policy | p per ask | k | predicted survival | measured |
| --- | ---: | ---: | ---: | ---: |
| `uniform` | 0.5 | 7 | 0.8 % | **0.8 %** aborted 99.2 % |
| the 400-iteration fit | 0.30 | 6 | 12 % | **12 %** aborted 88 % |

Two numbers the record published as facts about the *policy* are predictions of one line of the
*executor*. To finish nine strokes in ten the policy needs an abort logit near **-4**, and
`entropyGrad` in `../../src/golem/policy.ts` adds `-logit * p * (1-p)` per gate per sample with a
fixed coefficient: **the entropy bonus pulls every gate logit toward a coin flip**, by exactly the
mechanism that pushes `logSigma` up. The shipped table's gate logits at the mean observation are
commit +0.062, abort -0.191, parry +0.066 -- all three inside 0.2 of the knife edge after 93
iterations.

And the read differs between the two things that matter. **Training draws the gate; every rating in
this record reads it greedily.** At the greedy read the shipped abort logit is negative, so it never
aborts and completes every stroke; at the drawn read it aborts on 45 % of asks and survives about
3 % of its strokes. The policy the optimiser improved and the policy the bar measured are not the
same policy, and Session 07 of the learn set already wrote the rule that follows from it: *any
measurement downstream of a finished stroke is a measurement of the abort gate.*

## Frozen choices

- **`latchAbort` ships off.** This session measures it. Nothing in this set fits a policy, so
  nothing in this set has earned a default, and a surface row adopted on a rating of weights fitted
  under the other surface would be exactly the guess the reward rows were kept at zero to avoid.
- **The row is a `GOLEM_TACTICS_V4` entry reached per contender through `--tactics`**, which is
  Session 07's `holdMetres` pattern unchanged. `COMMAND_AXES` does not move, `POLICY_VERSION` does
  not move, and the shipped table still loads byte for byte.
- **Both reads are measured, and reported side by side.** A bar on one read alone would repeat the
  mistake this session is about. The greedy read is what every number in the record was taken on;
  the drawn read is what the fit optimised.
- **The completion figure is a property, not a result.** It either holds or the row does not do
  what its name says, and it is checked in a test rather than inferred from a rating.
- **The arithmetic above is pinned in a test, not narrated.** A claim that predicts two published
  numbers to the digit should fail loudly if the stroke's duration or the ask rate ever moves.

## Implement

1. `../../src/golem/tactics-v4.ts`: `latchAbort: false` on `DRIVEN`, documented beside
   `abortCooldown` with the survival arithmetic and with the reason the held-command rule is right
   for `commit` and wrong for `abort`. A `latchedAbort` boolean set beside `arcSwing` in the
   `goTo("chamber")` branch and cleared in `goTo("free")`; when the row is up the abort gate is
   read on the ask that starts the stroke and not re-read, so the test becomes
   `striking && (T.latchAbort ? latchedAbort : command.abort >= 0.5)`.
2. `../../tests/tactics-v4.test.mjs`, three tests:
   - with the row up, a command holding `abort` at 1 from the ask *after* a stroke starts does not
     abort it; with the row down, the same command does.
   - with the row up and `abort` at 1 on the ask that *starts* the stroke, the stroke is refused,
     so the row latches rather than disables.
   - the arithmetic: the measured stroke duration at each blended shape, divided by the ask period
     at `askHz`, gives the exponent `k`, and `k` is asserted to be in five to eight. That is the
     claim the two published abort rates are predictions of, and it should break if the timings
     move.
3. `../../scripts/idle-probe.mjs` -> `formatIdleProbe`: `theirBar` on the **mirrored** table as
   well as the random one. It is the largest-t column in either probe -- mirrored mace rose 0.740
   to 0.933 at t +9.09 over the 400-iteration run -- and the record's mirrored table omits it
   entirely, which is how a rising dummy-health curve stayed unread for a whole set.
4. Re-read the 29 probe points of league-long on the new column and put the mirrored `theirBar`
   table into `../measurements.md` beside the random one already there. No bouts: the files are on
   disk.

## Human gate

The owner is asked one thing, in the closing table below: **which of the two priced experiments,
if either, the next phase runs.** The measurements in this session answer to a mechanical bar.

**The bar, stated before the data, and it needs no training.** The shipped weights are rated with
`latchAbort` on against off, as two arms in one `ratePaired` call, 600 bouts, seed 20260906, random
viable pairs and mirrored, against `golem-driver` and `golem-fencer` on Session 02's column, at
**both reads**.

- **The property:** at the drawn read, completion of strokes started rises from the measured 0.12
  to **at least 0.80**, off the tournament row's `strokes` and `aborts`. If it does not, the row
  does not do what it says and nothing else in this session is readable.
- **The reading, and it is deliberately not a ship bar:** the paired difference against
  `golem-fencer` on random viable pairs, both reads, with the mirrored difference beside it. This
  is the size of the effect a fit *would be optimising into* if the row were on. It is not a
  training result, no default follows from it, and the session says so where it reports it.
- **The gap that is the session's other finding:** drawn-read margin minus greedy-read margin, on
  the shipped surface, on the same bouts. If it is material, then every bar in this record has been
  stated on a policy the fit never optimised, and the next set's first frozen choice writes itself.

## The closing table -- what this set is for

One table into `../measurements.md`, and it is the deliverable. For each of the four findings: what
it cost to establish, what it moved, and what the next experiment would cost. Two experiments are
named there and **deliberately not run by this set**, each about one evening:

- **`--opponent idle`, from scratch, 60 iterations, the maul and mace viable pool, with
  `../../scripts/idle-probe.mjs` every five iterations.** Can this optimiser learn the easiest task
  in the game -- a target that never moves, never blocks and never steps away? `idle` is already a
  legal `--opponent` and Session 08 of the learn set used it as a curriculum stage, so this costs
  no code. **Nobody has ever run it and asked whether the kill rate goes up**, and over Session
  11's 400 iterations the same number went the other way: the dummy's remaining health rose 0.613
  to 0.791 at t +7.67 on the maul class while maul damage peaked at 37.6 at iteration 24 and fell
  to 9.3 at t -9.35. A pipeline that cannot learn this does not have a reward problem.
- **A gradient-signal probe**: split one epoch's shuffled order into two disjoint halves, sum each
  half's shard partials through the `FitPool` that already returns them, and report the cosine
  between the two with the entropy term off. Run at 32, 64, 128 and 256 bouts an iteration for 30
  iterations. It would say, for the first time in this record, whether the optimiser is handed a
  signal at all -- and if the cosine is a few hundredths at 32 bouts and scales with the bout
  count, then the learn set was run at between a tenth and a fortieth of the sample budget this
  task needs, and that is a publishable negative that ends the argument rather than another night
  of arms.

Neither is planned here. The table is what the owner decides against.

## Verification

```powershell
npm run check
node --test tests/tactics-v4.test.mjs tests/golem-mind.test.mjs tests/tournament.test.mjs tests/docs.test.mjs
node scripts/tournament.mjs --policies golem-policy,golem-fencer --bouts 24 --seed 20260906 --pairs all --override latchAbort=true
node scripts/idle-probe.mjs --bouts 2 --seed 20260906
npm test
npm run build
git diff --check -- .
```

## What remains

Everything this set found and did not act on, named so the next set does not rediscover it: the
control inversion on `standOff` (the policy must emit `wanted / theirReach` to act on
`gapBeyondStrike`, and `holdMyReach` has three disagreeing readings because it was never a bar);
the frozen normalisation, which by iteration 400 had accumulated 10 million asks and moves 0.25 %
an iteration while the behaviour it describes drifted hard; the `closing`, `stall`, `outside` and
`swing` reward rows, still at zero, and `stall` and `outside` in particular now that the record has
the bout-seconds to price them from; and the dead bottom third of `standOff` and `advance`'s
saturation through `closeGain`, both measured and both third-order against a gate that finishes one
stroke in eight.

This set is deleted in the commit that lands this session, and `../deleted-paths.md` is regenerated
in a second commit, which is the house rule: the docs gate is legitimately red in between.
