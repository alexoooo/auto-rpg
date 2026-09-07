# Session 10 -- `golem-learner`: fitted Q-iteration on the decision log

**Status (2026-09-06): planned. Needs 08.**

## Outcome

A Q-network over the style features, trained off-policy on the decision log by fitted Q-iteration,
improved in rounds of collect, fit and deploy, and confirmed against the best style, the fencer and
the champion on a held-out seed on both pools. The one learned mind of this set with a ceiling
above the hand-coded ones, if the signal is what the record says it is.

## Frozen choices

- **The network is the neural layout read as Q-values.** Inputs the style feature count, two
  hidden layers of 64, outputs the fifteen options; the policy is the greedy open option
  through `pickOpen` from `../../src/golem/neural-net.ts`. Not a policy network with a policy
  gradient: the matchup set's neural entry already says a second optimiser over the same
  per-bout signal changes nothing.
- **The reward is dealt minus taken in bar units per decision**, plus a terminal `winBonus` on
  the bout's result, a row defaulting to 0 with a sweep at 0.25. The discount is by duration,
  2^(−seconds / `halfLife`) with `halfLife` 8 s and sweeps at 4 and 16, because a strike
  decision is six hold decisions long.
- **The target** is the reward plus the discounted maximum over the open options of the previous
  iteration's Q at the next decision, zero after the last. **The loss** is the squared error on
  the taken option only, Adam at 1e-3, batch 128, three epochs an iteration, thirty iterations
  a fit, warm-started from the previous fit.
- **The behaviour policies are everything in the corpus.** Fitted Q-iteration is off-policy, so
  the styles at explore 0.3 and the learner at 0.1, over random pairs and in mirrored self-play
  with the learner on both sides, are all data; the replay is the union of rounds, capped at the
  newest 600,000 decisions.
- **The artifact** is src/golem/learner-weights.ts, carrying version, feature version, layout,
  seed, date, rounds, iterations, decisions, bouts, `halfLife`, `winBonus`, explore, the
  confirmation score and its baselines, and the weights; refused by version, feature version,
  layout and length exactly as `checkNeuralWeights` in `../../src/golem/neural.ts` refuses.
- **The mind**, in src/golem/learner.ts, is features, forward pass, greedy over open, with an
  epsilon drawn from its own stream only when explore is above zero; registered as the others,
  and the worker learns a `{q, explore}` contender.

## Implement

1. `../../src/golem/neural-net.ts`: a backward pass from an output delta (the existing one minus
   the softmax, which then calls it) and a Q backward that sets the taken option's delta.
2. The learner module, the artifact's shape and refusal, the registration, the contender kind.
3. A new script scripts/train-learner.mjs: Bellman targets (pure), the fit (pure, the layout a
   parameter so a test can use a tiny one), a round (collect with the current greedy at epsilon
   against the league over random pairs plus mirrored self-play, then refit on the union), the
   confirmation on the held-out seed through `evaluate`, and the module renderer. Logs per
   iteration the Bellman residual on the training set and a held-out tenth, the mean root Q,
   and the number of corpus decisions whose greedy answer moved since the previous iteration.
4. Tests in a new file tests/learner.test.mjs: fitted Q-iteration recovers the optimum of a
   six-state semi-Markov chain with durations of 1 or 2 s, a mask closing one option in two
   states, and rewards built so the myopic policy is wrong, against exact value iteration
   (greedy equals the optimum in every state, Q within 0.05); the Q backward against central
   differences with zero gradient off the taken row; the targets on three hand-built
   transitions; the refusals; one real round on two workers with 3 s bouts on two builds, then
   the module text, its refusal check, the mind loading and the picker offering it.
5. The session's budget, at most four hours of wall: Session 08's corpus (about 340,000
   decisions) fitted in about 25 minutes; three rounds of 2,048 random-pair bouts and 512
   self-play bouts each, about eight minutes of harness and thirty of fitting a round; the
   confirmation, four contenders on two pools at 1,536 bouts, about 37 minutes.
6. The entry: the residual curve, the decisions-moved column, the confirmation with the
   structural columns. `../design.md` gains the learner. README.

## Human gate

Learner at or above the best style plus 0.03 over random pairs (two σ at 1,536 bouts) with the
columns in band; shipped with the number either way. And the owner watches it on three random
matchups: does it behave differently from the styles it learned from, and better. Verdict into
this file's status line.

## Verification

```powershell
npm run check
node --test tests/learner.test.mjs tests/neural.test.mjs
npm run tournament -- --bouts 64 --policies golem-learner,golem-form
npm test
npm run build
git diff --check -- .
```

## What remains

The residual risk is bias rather than noise: extrapolation to states the corpus never visited.
The explore rounds exist to close it, and the decisions-moved column says whether the iteration
converged. Session 11 spends the overnight on more rounds.
