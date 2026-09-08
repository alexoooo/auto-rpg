# Session 13 -- the dense reward, and PPO in self-play over the continuous surface

**Status (2026-09-08): landed; the mechanical bar is not cleared and the curve rises.**
`../../src/golem/reward.ts` pays `dealt - taken` at every ask -- Session 08's decision reward
differenced finer, telescoping to the bar margin to 1e-9 on a real run -- plus `win` 0.5 at the
last window and two small charges on clinch and idle travel poured out of the tournament's own
accumulators. `../../src/golem/policy.ts` is a 71 -> 256 -> 256 -> 12 head over Session 12's
command vector, nine Gaussian means clipped rather than squashed and three Bernoulli gates, with
one `logSigma` an axis; `../../scripts/train-ppo.mjs` fits it by PPO in mirrored self-play with
the hand-coded league held out. Sixty iterations, 1,920 bouts, 3,348,480 asks, 109 minutes.
**The bar is missed: d +0.216 against the d 0.235 the plan asked for**, measured on 1,030 bouts a
contender where the standard error on d is 0.044, so it falls 0.4 standard errors short with its
interval containing the target. **The curve rises**: rated at the same thousand bouts, the
untrained head is worth +0.0030 +- 0.0209 over the uniform command -- nothing -- so the whole
**+0.0841 +- 0.0324, 5.1 standard errors**, between the two ends was put there by the fit, and a
weighted least squares over all thirteen rating points agrees at +1.29e-3 +- 2.53e-4 an iteration,
t 5.10. The same policy ends **level with `golem-driver`** -- -0.0145 +- 0.0206 of bar, d -0.043,
against -0.0987 +- 0.0213 and d -0.283 at iteration zero. Two findings rewrote the
trainer around them: the self-play return is **zero by construction** (both sides of a mirrored
bout have exactly negated margins, so the mean return is not a progress curve and the periodic
rating is), and Adam's step is +-`rate` a weight whatever the gradient, so **the rate and the batch
are one knob** -- at 3e-4 with a 512-sample minibatch the trust region stopped every fit after its
first minibatch, spending 512 of the 57,000 samples a rollout had just collected. What the fitted
mind does is not what a designer would have shaped for: it throws the fewest strokes, gets the
least speed into them and deals the least damage of the three, and it loses least, draws most,
stays inside the inner radius 28.7 % of the time and ends a win with **half its bar left**, 0.512
against 0.362 and 0.367. The two penalty terms are the two columns it is *worst* on, which is a
reward table audited rather than assumed. The named next lever is the spread: entropy rises 8.50
to 9.32 and sigma 0.497 to 0.556 over the run, because at `--entropy 0.003` the bonus's gradient
on `logSigma` is comparable to a standardised advantage's. See the Session 13 entry of
`../measurements.md` and the section in `../design.md`.

## Outcome

A policy fitted by proximal policy optimisation in self-play, emitting Session 12's command
vector, trained against a reward that pays every step rather than every bout. The first mind in
either plan set that is fitted to *win* rather than to imitate a winner, on a signal dense enough
that a gradient exists.

## Frozen choices

- **The reward is dense and its terms are the columns the set already instruments** (the owner's
  ask, 2026-09-07). Per step: `dealt - taken` in bar units, which is exactly Session 08's
  telescoping decision reward differenced finer. Terminal: a win bonus. Penalties, small, on the
  pathologies Session 00 built columns for and Session 08's league then measured: `clinchSeconds`
  and `idleTravelMetres`. Every coefficient is a row in a table with the run that chose it beside
  it, and the table ships with the artifact, because a policy fitted under other coefficients is
  a different policy and a reader has no other way to tell.
- **PPO and not SAC**, for one reason that is about this harness and not about the algorithms:
  the 32-worker tournament pool is already a synchronous vectorised environment and PPO is the
  on-policy method that maps onto it without a replay server. SAC is recorded here as the
  alternative not taken, and the reason it would be taken instead -- if sample cost, not wall
  clock, turns out to be the binding constraint.
- **The network is wider than the ones that failed.** Two hidden layers of 256, tanh, a
  Gaussian head with a state-independent log-sigma for the nine continuous channels and three
  independent Bernoulli heads for the gates; a separate value head of the same width. The
  learner's 2x64 over fifteen names is the shape that could not move, and the owner's instruction
  is to go wider.
- **Self-play from the start**, mirrored bodies, both sides the current policy, which is what
  makes the opponent improve with the agent. The hand-coded league is held out entirely and is
  the evaluation, never the training partner: a policy trained against the fencer learns the
  fencer.
- **Normalisation is part of the artifact.** Running mean and variance over the observation,
  frozen into the shipped table, because a policy that reads unnormalised features on one host
  and normalised ones on another is not deterministic and this repository's contract says it is.
- **Advantage by GAE**, lambda 0.95, gamma set from a half-life in *seconds* rather than steps,
  as the learner's discount is, because the ask cadence is not the physics step and a discount
  per ask is a discount that changes meaning when the cadence does.

## Implement

1. src/golem/policy.ts: `POLICY_VERSION`, `PolicyWeights` with the reward table, the
   normalisation and the layout, `checkPolicyWeights` with the same four refusals
   `checkLearnerWeights` in `../../src/golem/learner.ts` makes; `golemPolicy(seed, table, ...)`.
2. src/golem/reward.ts: the per-step reward, its table, and a test that the undiscounted sum of
   `dealt - taken` over a bout equals the bar margin to 1e-9, which is the property Session 08
   established for the coarser signal and this session must not lose.
3. scripts/train-ppo.mjs: rollout collection across the worker pool, GAE, the clipped surrogate,
   entropy bonus, value loss, minibatch epochs, checkpointing every iteration under
   `tournaments/`, and an evaluation against the held-out league every N iterations.
4. Tests in tests/ppo.test.mjs: the surrogate's gradient against central differences; GAE on
   three hand-built transitions; a policy round-trips through the module renderer and the picker;
   PPO recovers the optimum of a two-dimensional continuous bandit with a known solution, which
   is the continuous analogue of the six-state chain `tests/learner.test.mjs` uses.
5. A short run to prove the loop closes -- an hour, not a night -- with the curve in the entry.

## Human gate

None yet. The mechanical bar: the policy beats the uniform-command baseline by more than the
widest gap between two hand-coded minds is worth at the settings Session 11 landed -- d 0.235 on
the paired bar margin, `golem-brawler` against `golem-duelist` -- and its reward curve rises. A
policy that does not clear that is reported with its curve and the session says so.

## Verification

```powershell
npm run check
node --test tests/ppo.test.mjs tests/reward.test.mjs
npm test
npm run build
git diff --check -- .
```

## What remains

The long run and the league are Session 14. Whether the four hand-coded styles are re-based onto
the continuous surface is decided in the close-out; the default is that they are not, and stay
the named baseline they are now.
