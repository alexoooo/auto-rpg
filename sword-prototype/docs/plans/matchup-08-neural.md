# Session 08 -- a neural contender, `golem-neural`

**Status (2026-09-05): planned. Needs 07.**

## Outcome

A small network that picks among the same tactical options the fencer executes, trained by
self-play against the league, competing in the same tournaments, and reported against the
champion whichever way it goes.

## Frozen choices

- **The action space is the tactical options, never raw hand commands.** At about 8 Hz the
  network chooses hold, close, withdraw, circle, strike now, wait for their recover, feint or ram,
  plus a target; the executor runs the exchange. Each decision carries its own duration, never
  defaulted, so the training treats it as the semi-Markov process it is.
- **Features are a versioned, pure function of the view and the executor's state**: gap, gap
  rate, the reach pair, the weapon-kind pair, both sides' vitality and per-part health, their tip
  speed and estimated phase, own phase and timer, `pairedHands`, natural-attack readiness.
  Tested for completeness against `tests/fixtures/view.mjs`.
- **A dependency-free multilayer perceptron**, two hidden layers of 64, softmax head, around ten
  thousand weights, deterministic.
- **Evolution strategies first, policy gradient as the fallback.** The tuner from Session 07
  already evaluates a parameter vector on the harness, so the first training is the same machinery
  over the weights. If it stalls below the champion after a budgeted run, a hand-written
  policy-gradient trainer over the same network is the second attempt, and both outcomes are
  recorded.
- **The weights are a checked-in artifact** with version, feature version, seed and date,
  refused on mismatch.

## Implement

1. The feature module and its completeness test; the network and its determinism test.
2. The training script over the tournament harness; the weights module; the `golem-neural`
   registration.
3. A test that one seeded generation on two workers writes a new weights table and the policy
   runs a real headless bout.
4. The training run and its honest table in `docs/measurements.md`.

## Human gate

The owner watches the neural contender against the champion on random matchups. Verdict into this
file's status line, beside whether it rated higher.

## Verification

```powershell
npm run check
node --test tests/golem-mind.test.mjs
npm run tournament -- --bouts 64 --policies golem-champion,golem-neural
npm test
npm run build
git diff --check -- .
```
