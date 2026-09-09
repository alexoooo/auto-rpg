# Session 09 -- network and algorithm variants

**Status (2026-09-09): planned. Needs 04, 07.**

## Outcome

Four variants of the mind itself, each behind a version and a flag so the shipped table still
loads, each run as an arm against the unchanged mind at a fixed sample budget: history in the
observation, discrete bins on the two axes that decide range, a state-dependent spread with
entropy under control rather than under a constant push, and a critic that sees both sides.
The owner asked for a different network or algorithm; this is the menu, and the bar picks.

## Frozen choices

- **One change an arm.** A variant that bundles two ideas cannot be credited to either. The
  arms below are single changes on the shipped configuration, with Session 07's surface
  candidates as further single arms if the owner picked any.
- **Versioned, refused by name, old tables loadable.** `PILOT_FEATURES_VERSION` 2 for the
  observation arm, `POLICY_VERSION` 3 for the head arms, and `checkPolicyWeights` learns to read
  both; the shipped module is not regenerated until one wins under Session 10's bar.
- **Every new distribution ships with a gradient check.** The record's PPO tests check the
  surrogate against central differences; a categorical head, a Beta head and a state-dependent
  sigma each get the same test before an arm is run, because a wrong gradient that still climbs
  is the failure that costs a night.
- **PPO stays.** The reason the style set gave holds -- the worker pool is a synchronous
  vectorised environment -- and Session 05 made its fit fast. SAC remains the recorded
  alternative if sample cost is still the constraint after Session 11.
- **Entropy by target, not by bonus.** The record measured the bonus's gradient on `logSigma` as
  exactly one an axis whatever the state, and the drift's sign flips between 0.003 and 0.0003.
  The control arm replaces the bonus with a target entropy per axis and a temperature adjusted
  toward it, which is the SAC device on a PPO objective; annealing is the cheaper arm beside it.

## Implement

1. Observation, in `../../src/golem/pilot.ts`: `PILOT_FEATURES_VERSION` 2 adds a trace of the
   last four readings of gap, radial speed and their tip speed as three exponentially weighted
   columns each with a fixed decay, 71 -> 80 columns; behind `--features 2`; `pilotFeatures`
   takes the previous reading's trace; the normalisation width follows.
2. Head, in `../../src/golem/policy.ts`: `--head mixed` makes `standOff` and `advance`
   categorical over nine bins spanning their ranges while the other seven axes stay Gaussian;
   `--head beta` puts a Beta on the [0, 1] axes (`targetHeight`, `swing`, `bite`) with the
   two-parameter softplus head; `--sigma state` makes `logSigma` nine more outputs of the network
   with the same floor and roof. `sampleAction`, `actionLogProb`, `actionEntropy`,
   `logProbGrad` and `entropyGrad` gain a case each; `commandFromAction` maps a bin to its
   centre. `POLICY_VERSION` 3 carries `head` and `sigma` in the table.
3. Entropy, in `../../scripts/train-ppo.mjs`: `--entropy-anneal 0.003:0,0.0003:20` using Session
   08's parser; `--entropy-target -1.0` per axis with `--entropy-rate` adjusting a temperature
   by the sign of the gap each fit, the bonus replaced by temperature times entropy; both
   printed in the header, the temperature in the iteration row.
4. Critic, in `../../scripts/train-ppo.mjs` and the worker: `--critic central` gives the value
   head both sides' pilot features (142 columns, the opponent's pack is on the same row);
   training only, the actor unchanged, so nothing ships differently.
5. Tests in `../../tests/ppo.test.mjs`: gradient against central differences for each new
   distribution and for the state-dependent sigma; the bandit recovers its optimum under each
   head; a version-3 table round-trips through the module renderer and the version-2 shipped
   table still loads; the trace columns are what a hand-stepped reading predicts. In
   `../../tests/pilot.test.mjs` (or where `pilotFeatures` is tested): the count and the version.
6. The manifest, docs/sweeps/learn-09-variants.json: two nights of four arms, seed 20260915,
   from scratch, viable pool, Session 06's table if one won, 60 iterations: night one -- a:
   control, b: `--features 2`, c: `--head mixed`, d: `--sigma state`; night two -- a: control,
   e: `--entropy-target`, f: `--entropy-anneal`, g: `--critic central`, plus any Session 07
   candidate the owner picked as h on a third night.

## Human gate

None. The mechanical bar is Session 06's: an arm beats the control by d 0.2 on the paired bar
margin against `golem-driver` on random viable pairs at 60 iterations, and does not lose to it
mirrored by more than one standard error. An arm that wins the mirror and loses the random pool
is the record's specialist again.

## Verification

```powershell
npm run check
node --test tests/ppo.test.mjs tests/pilot.test.mjs tests/docs.test.mjs
node scripts/train-ppo.mjs --iterations 1 --bouts 8 --workers 8 --head mixed --sigma state --evaluate 0 --seed 20260915
node scripts/train-ppo.mjs --iterations 1 --bouts 8 --workers 8 --features 2 --entropy-target -1 --evaluate 0 --seed 20260915
npm test
npm run build
git diff --check -- .
```

## What remains

A recurrent head is the arm not run: the trace columns are the cheap version of the same idea,
and a GRU in the flat-weight MLP is a session on its own. Combining two winning arms is Session
10's configuration, run there as one arm against each of its parts.
