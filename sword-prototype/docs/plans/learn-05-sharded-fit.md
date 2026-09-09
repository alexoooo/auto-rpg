# Session 05 -- the fit sharded across worker threads

**Status (2026-09-09): planned. Needs 04.**

## Outcome

`ppoFit` in `../../scripts/train-ppo.mjs` computes each minibatch's gradient on K worker threads
over shared memory and takes one Adam step on the main thread, and the result is the single
thread's result to 1e-9. The fit was 86 s of a 109 s iteration; the owner's estimate is a 3-4x
iteration end to end for "a day of work", and the same fit serves the league unchanged.

## Frozen choices

- **Mathematically identical, and tested as such.** Data-parallel gradient accumulation: the
  minibatch is split K ways, each worker sums its slice's gradients, the main thread sums the K
  partials in a fixed order and applies the step. The sample order, the shuffle, the trust
  region, the clip fraction and the entropy read-out are computed exactly as today; the only
  thing that moves is which thread runs the inner loop. The test is equality on a real rollout,
  not a bandit that happens to converge.
- **The observation normalisation is frozen for the fit, as it is today.** `norm` is extended
  after the fit by `extendNormalisation` and never during it; the workers receive the frozen
  copy once per iteration. The owner named this as the place to be careful, and the test loads
  a rollout whose normalisation is not the identity.
- **Shared memory, no copies in the loop.** The rollout's `x`, `a`, `logp`, the standardised
  advantages and the returns go into `SharedArrayBuffer`-backed `Float64Array`s once per
  iteration; the weights, `valueWeights` and `logSigma` are copied into shared arrays once per
  minibatch step (three arrays, 87,308 + 4,673 + 9 numbers); each worker owns a private gradient
  triple in shared memory that the main thread reads after a barrier. `Atomics.wait` on the
  worker side, `Atomics.notify` from the main.
- **A persistent pool.** The fit workers live for the run, unlike `runJobs`'s per-call
  collectors, because a minibatch step is milliseconds and a thread start is not. The
  collectors are left exactly as they are.
- **K is a flag with a measured default.** `--shards 8` on a 32-thread host beside 22 collectors;
  the session measures 1, 2, 4, 8 and 12 and the default is the knee.

## Implement

1. scripts/fit-worker.mjs: on `parentPort` a `bind` message carrying the shared views and the
   layouts; then per `step` message `{at, end, epoch}` over the shared `order` array: for each
   index in its slice, `load`, `forward`, `surrogateGrad`, `backwardFrom` into its own
   `grad`, `sigmaGrad`, `valueGrad`, and the scalars `kl`, `clipped`, `entropy`, `valueLoss`
   into a shared `Float64Array(4)`; then `Atomics.store` its done flag and `notify`. The inner
   loop is the body of `ppoFit`'s minibatch loop moved verbatim, which is the point.
2. `FitPool` in `../../scripts/train-ppo.mjs`: `open({shards, layout, valueLayout})`,
   `bind(rollout, scaled, returns, norm)`, `step({at, end, epoch, order, weights, valueWeights,
   logSigma})` returning the summed `grad`, `sigmaGrad`, `valueGrad` and scalars with the sum
   taken in shard order 0..K-1, `close()`. `ppoFit` takes `{shards = 1, pool = null}`; at
   `shards > 1` the minibatch body becomes one `pool.step` and the rest of the function is
   unchanged, including the `stopped` path where the failing minibatch is not applied.
3. `../../scripts/train-ppo.mjs` and `../../scripts/league.mjs`: `--shards` flag; the pool is
   opened once and closed at exit; the iteration row gains `fitSeconds` and `shards`; the header
   records both. `../../scripts/sweep.mjs` passes `--shards` through and subtracts K from each
   arm's collector budget.
4. Tests in `../../tests/ppo.test.mjs`: `a_sharded_fit_matches_the_single_thread_fit_to_1e-9` --
   a 4,096-sample rollout built from a real checkpoint's recorded packs under `tournaments/`
   (or, when the file is absent, from the bandit at a non-identity normalisation), fitted at
   K = 1, 2 and 4 with the same seed, weights compared elementwise and the read-out compared
   exactly; the bandit test passes at K = 4; the trust-region stop fires on the same minibatch at
   K = 1 and K = 4 for a rollout whose second minibatch trips it.
5. Measure: fit time per iteration at K = 1, 2, 4, 8, 12 on ppo-run1's checkpoint and rollout
   size (about 57,000 samples), and the whole iteration at 22 collectors + 8 shards; into
   `../measurements.md`.

## Human gate

None. The mechanical bar: equality to 1e-9 as above, and fit time at K = 8 at most 0.35 of
K = 1 on the same rollout, and an end-to-end iteration of the shipped configuration at or under
50 s on the 32-thread host against the record's 109 s.

## Verification

```powershell
npm run check
node --test tests/ppo.test.mjs tests/league.test.mjs tests/sweep.test.mjs tests/docs.test.mjs
node scripts/train-ppo.mjs --iterations 2 --bouts 8 --workers 8 --shards 4 --evaluate 0 --seed 20260915
npm test
npm run build
git diff --check -- .
```

## What remains

The critic's forward pass for the advantage (`valuesOf`) and the GAE are still on the main
thread and are a few per cent of the fit. Raising `--bouts` an iteration is now cheaper than it
was and is Session 11's decision, taken on the curve.
