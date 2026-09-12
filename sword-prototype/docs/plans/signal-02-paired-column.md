# Session 02 -- the ruler the criterion named

**Status (2026-09-11): landed.** All nine steps implemented. The mechanical bar was measured and
*missed* -- 1.433x against the 1.5x it asked for and the 2.2x it predicted -- and the column was
kept rather than reverted because it did tighten, which is this plan's own revert condition. The
result, the wall clock and the mirror finding are in `../measurements.md`.

## Outcome

`golem-fencer` becomes a paired, bout-by-bout column on every rating path in the tree, which it
has never been. Five refusals and two defaults land beside it, each one of which would have caught
a confound this record actually carries. **No bouts are bought beyond one re-rating of a checkpoint
already on disk.**

The learn set's second frozen choice was that the criterion is Cohen's d on the paired bar margin
against a designed mind. `ratePolicy` in `../../scripts/train-ppo.mjs` pairs against `uniform` and
`golem-driver` and nothing else; `ratePaired` in `../../scripts/sweep.mjs` pairs against the
*control arm*, which is a different quantity again. So the criterion the set declared was never
measurable for the mind it was declared against, and its bars were read off `barD` -- an arm's own
margin averaged over 52 heterogeneous builds, whose per-bout standard deviation is 0.605 of a bar
on a pool where the body is worth 2.98x the mind. This session is that gap closed.

## Frozen choices

- **A bar is stated on a paired column or it is not stated.** `barD` keeps being printed and keeps
  its label, because an arm's own margin is a real quantity and the close-out tables are built on
  it. What changes is that no bar in this set or after it quotes it. That ruling goes into
  `../design.md` in this session, in one paragraph, with the 0.605 beside it.
- **Pairing is not expected to rescue anything, and the session says so first.** The rate files
  under league-long already carry a paired `golem-driver` column for all 29 rating points of the
  400-iteration run, and re-read on it the slope is +0.0105 per 100 iterations at t 1.12 on random
  pairs and t -1.65 over the second half. That table is the session's *first* entry, before any
  code moves, because "the learn set's conclusion was an artifact of an unpaired ruler" is the
  obvious objection to everything the record now says and it is answerable for free.
- **The contender shape is the one the file already uses.** `contenders.driver` is
  `{ policy: "golem-driver" }` and `golem-driver` is also in `PPO_LEAGUE`, so a designed contender
  already meets itself in the schedule and the record was built that way. `fencer` is added in the
  same shape rather than in a better one. **The session checks what `columnsOf` does when both
  sides of a row carry the same policy name** and records the answer rather than assuming it,
  because that is the one place the existing shape could make a column mean something other than
  it looks like.
- **No rounding, no scheduling and no seed moves.** `boutSplit` keeps its whole-cycle arithmetic;
  a refusal is added beside it instead. Rating stays on 20260906.
- **Every default that moves, moves to a value the record already measured.** The one default in
  this session is `scripts/league.mjs`'s `--entropy`, and it moves to what the three 300-iteration
  leagues actually ran at.

## Implement

1. `../../scripts/train-ppo.mjs` -> `ratePolicy`: `contenders` gains `fencer: { policy:
   "golem-fencer" }` beside `driver`. `differences.fencer` then falls out of the bout-by-bout loop
   already in the function, with `bar`, `barSem` and `d` computed on the same builds and the same
   seeds. Cost is one more contender's schedule, so a rating is four contenders where it was
   three: **+33 % bouts**, and `--eval-bouts` is not changed to compensate.
2. `../../scripts/rate-snapshots.mjs` -> `rateSnapshots` and `../../scripts/sweep.mjs` ->
   `rateArms`: carry the `fencer` block into the curve row beside `uniform` and `driver`, so every
   curve drawn from here is readable on the criterion. `../../src/curve/runs.ts` reads whatever
   keys the row carries, so the page needs no change; `../../tests/curve.test.mjs` gains a fixture
   row with the new key to prove it.
3. `../../scripts/sweep.mjs` -> `ratePaired`: a `--designed golem-driver,golem-fencer` flag adds
   the designed minds as contenders **excluded from the control check and from the arm loop**, so
   each arm's row gains `vsDriver` and `vsFencer` -- the paired difference `bar[arm][i] -
   bar[designed][i]` over the same bouts. The opponent-order guard already in the function covers
   the new columns unchanged, because every contender's schedule is drawn from the same seed.
4. `../../scripts/sweep.mjs` -> `ratePaired` **refuses a single-arm call by name**, and
   `formatPairedRow` prints `(control; no paired column)` rather than `vs control +0.0000 d 0.000`.
   Session 11 of the learn set called it with one arm, which disables the paired column by
   construction, and nothing in the row it printed said so. That confound becomes unrepeatable.
5. `../../scripts/train-ppo.mjs` -> `ppoFit`'s signature: `rate = 1e-4, batch = 4096, epochs = 4,
   targetKl = 0.03`. Today's `3e-4 / 512 / 3 / 0.02` is precisely the row the rate-and-batch
   calibration measured as stopping the fit **after its first minibatch every time** -- 512
   samples of the 57,000 the harness had just spent twenty seconds and thirty workers collecting
   -- at an explained variance of -0.790. Both production CLIs pass all four explicitly, so
   nothing in production moves; what moves is what a direct caller gets. The bandits in
   `../../tests/ppo.test.mjs` override every knob by hand, so the suite cannot catch a regression
   here today; the session asserts the four literally, with the calibration's date beside them.
6. `../../scripts/league.mjs`: `--entropy` defaults **0.003 -> 0.0003**. The three 300-iteration
   leagues in the record all ran at 0.0003, Session 11's 400-iteration run took the file's default
   of 0.003, and the record had already measured 0.003 as +0.00143 an iteration on the spread
   (t +33.3) against 0.0003's -0.00144 (t -22.4). The headline run of the last set is confounded
   on a value the record already knew, and the entry did not flag it.
7. `../../scripts/league.mjs` gains `--features`, `--head`, `--sigma`, `--critic`,
   `--value-hidden`, `--entropy-target`, `--entropy-rate` and `--opponent`, parsed exactly as
   `../../scripts/train-ppo.mjs` parses them so one sweep manifest reads across both, threaded
   into the `knobs` object the file already builds and into the layout and head spec it hands the
   main and the snapshots. Without these a league is always version-1 columns, a Gaussian head,
   constant sigma and a self critic, and **nothing Session 09 of the learn set found behind a flag
   can ever reach a league run**.
8. Three refusals, each naming the run it would have saved:
   - `--entropy-target` outside `[sigmaFloor + C, sigmaRoof + C]` where
     `C = 0.5 * (Math.log(2 * Math.PI) + 1)`, about 1.41894, because a Gaussian axis's entropy is
     `logSigma + C`. Session 09 passed -1.0 against a floor of -1.581; the controller saturated
     downward on iteration 1 and never turned round, and it was still the best arm on the pool
     that mattered. The message prints the band.
   - `parseTactics` naming both `holdMetres` and `holdMyReach`. The documented tie in
     `../../src/golem/tactics-v4.ts` stays -- the *executor* must resolve a table that carries
     both -- but a *harness* that named both is always a mistake and nothing refused it.
   - A league whose **realised** mirror share differs from the asked-for one by more than 0.05,
     naming the bout count that would meet it. Session 11 asked for 0.5 and trained at 0.667
     because 32 bouts against a six-opponent cycle round that way.
9. Tests. `../../tests/sweep.test.mjs`: two contenders' columns built so the unpaired spread is
   large and the paired spread is small, asserting `deltaSem < barSem` -- the property, not a
   number -- and the single-arm refusal. `../../tests/league.test.mjs`: for each new flag, the
   header carries what it was given, **and a league given none of them is bit-identical to
   today's**. `../../tests/ppo.test.mjs`: the four defaults, and the three refusals by message.

## Human gate

None. The mechanical bar, stated before the data: re-take the learn set's final table from
league-long/league.json at 600 bouts, seed 20260906, random viable pairs and mirrored, against
`golem-driver` and `golem-fencer`, on the new column. **The paired interval against `golem-fencer`
is at least 1.5x tighter than the unpaired `barSem` of the very same bouts.** The arithmetic
already on disk predicts about 2.2x -- `sem` 0.0259 on 300 paired bouts against 0.0568 unpaired on
600. If it does not tighten on the same bouts, the pairing bought nothing, and the session says so
and reverts rather than keeping a column that costs 33 % more bouts for nothing.

## Verification

```powershell
npm run check
node --test tests/ppo.test.mjs tests/sweep.test.mjs tests/league.test.mjs tests/curve.test.mjs tests/docs.test.mjs
node scripts/league.mjs --iterations 1 --bouts 8 --workers 8 --shards 2 --evaluate 0 --dir tournaments/signal-02-smoke
node scripts/rate-snapshots.mjs --dir tournaments/league-long --bouts 24 --seed 20260906
npm test
npm run build
git diff --check -- .
```

## What remains

`rateArms` still rates each arm in its own call, so two arms' rows are never differenced against
each other; `ratePaired` is the path that does that and it is the one the bars use. Nothing here
changes what a training run optimises -- it changes what a rating can say about one, which is the
precondition for every session after it.
