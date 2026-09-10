# Session 04 -- several experiments at once: the sweep runner

**Status (2026-09-09): landed. The mechanical bar is half met. The three arms' logs are
identical through their first iteration once `seconds` -- a wall clock, and the only field of
the row that cannot be a function of the seed -- is dropped; literal byte-identity was never
available. The throughput half misses: three arms at ten workers did 2.15 times the iterations
an hour that one 30-worker run of the same configuration did, against a bar of 2.4, because
tripling an arm's workers makes it only 1.285 times faster and two thirds of a league iteration
is a single thread. Reported rather than re-drawn; see docs/measurements.md.**

## Outcome

One script that takes a manifest of arms, runs them all at once with a shared seed and a shared
starting checkpoint, divides the host's workers between them, restarts an arm that dies from its
last checkpoint, and when they finish rates every arm on one pool and prints the paired table
with d. Every learning session in this set is a manifest for it. The owner called this the
"highest-value option", because the open questions -- entropy against drifting sigma, rate,
reward-table weights -- are sweep questions and each run needs about one core for 80 % of its
time.

## Frozen choices

- **Processes, not threads.** Each arm is a child `node scripts/train-ppo.mjs` or
  `node scripts/league.mjs` with its own worker pool, exactly as the record's four-at-once sweep
  and three-at-once league were run by hand. The runner adds nothing to the trainers except the
  flags they lack; a manifest is a list of command lines with the shared parts factored out.
- **The worker budget is arithmetic and printed.** `floor((availableParallelism - 2) / arms)`
  collectors an arm, and the fit thread beside each; at four arms on the 32-thread host that is
  seven, which is the number the record measured 155 s an iteration at.
- **No rating during the run.** `--evaluate 0` while the arms are going, because a rating steals
  the cores the collection is paying for and a rating taken mid-run on a busy host is a rating
  on a different clock. Snapshots are rated afterwards, all on one pool and one seed, with
  `../../scripts/rate-snapshots.mjs`.
- **A resumed arm is the same run.** The trainers persist their Adam moments from this session
  on, so an arm restarted from its checkpoint continues the same optimiser rather than starting
  a warm one; the restart is logged as a row, not hidden.
- **The league takes a reward table.** `../../scripts/league.mjs` has no reward flags today, so a
  reward arm could only be a `train-ppo` arm; this session gives the league the same flags so
  Session 06's arms run in the league that shipped the current mind.

## Implement

1. scripts/sweep.mjs: `readManifest(json)` -- `{name, seed, from, pool: {random, terminals},
   script: "train-ppo" | "league", common: [flags], arms: [{name, flags}]}`; `workerBudget(arms,
   available)`; `spawnArm(arm, {workers, dir})` launching the child with `--seed`, `--from` or
   `--resume`, `--workers`, `--evaluate 0`, `--log tournaments/sweeps/<name>/<arm>.jsonl` (or
   `--dir` for a league), stdout tailed to one status line an arm; `superviseArms` which on a
   non-zero exit re-launches with `--resume` from the arm's last checkpoint, up to three times,
   appending a `restart` row to the arm's log; `rateArms` which runs `rate-snapshots` over every
   arm's snapshots on the manifest's pool and seed and prints the paired table -- bar margin
   against `uniform` and `golem-driver` with sem and d, per arm, per snapshot -- and writes it as
   rating.jsonl beside the manifest. The manifest is copied to
   tournaments/sweeps/<name>/manifest.json with the resolved budget and start time, which is
   what Session 02's `readSweep` reads.
2. Flags the trainers lack. `../../scripts/train-ppo.mjs`: `--from <checkpoint>` to start a
   fresh log from another run's weights (today only `--resume` exists, which continues the log);
   `--label` echoed into the header row. `../../scripts/league.mjs`: `--win --clinch --idle --tick`
   and every row Session 06 adds, echoed into the header and the shipped module's provenance;
   `--evaluate 0` honoured for the exploiters' probe too.
3. Adam persistence. The checkpoint gains `adam: {actor, spread, critic}` as flat arrays with
   their step counts; `--resume` and `--from` restore them when present and warn when absent;
   `../../scripts/league.mjs` does the same for the main and each exploiter in league.json.
   The shipped module does not carry them.
4. Tests in tests/sweep.test.mjs: the budget at 32 threads for 1, 3, 4 and 8 arms; a manifest
   round-trips; a manifest whose arms name different pools is refused, because their ratings
   would not compare; a manifest naming a script the runner does not know is refused by name; the
   restart path on a fake child that exits 1 once. In `../../tests/ppo.test.mjs`: a fit resumed
   with its Adam state equals the uninterrupted fit to 1e-9 over two iterations of the bandit;
   a fit resumed without it does not, which is the reason the state is persisted.
5. Run: three arms of the shipped league configuration at 10 workers each for one hour, same
   seed, to take the bar below; the manifest is committed under docs as the worked example.

## Human gate

None. The mechanical bar: three arms at ten workers apiece complete at least 2.4 times the
iterations an hour that one 30-worker run of the same configuration does, measured over the
same hour on an otherwise idle host; and the three logs are byte-identical to each other through
their first iteration, because they share a seed and a start.

## Verification

```powershell
npm run check
node --test tests/sweep.test.mjs tests/ppo.test.mjs tests/league.test.mjs tests/docs.test.mjs
node scripts/sweep.mjs --manifest docs/sweeps/example.json --iterations 1 --bouts 8 --workers 6
npm test
npm run build
git diff --check -- .
```

## What remains

A runner that spans two hosts is not this session. The fit thread of each arm is still one
thread; Session 05 is where the arms get faster rather than more numerous, and the two multiply.
