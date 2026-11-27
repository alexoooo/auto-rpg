/**
 * **The fitted value's fit** (`FittedValue`, `src/minds/option/predictions/value/fitted-value.ts`),
 * shared by the tools that fit it (`research/minds/fitted-value.mjs`, `research/minds/measure.mjs`):
 * for each of `HORIZONS` s, boosted regression trees for the life a body dealt and the life it took
 * over that many seconds after a state, read as the fitted leaf reads one (`featuresOf`).
 */
import { binned, binsOf, boost } from "./boosted-trees.mjs";

/** The seconds after a state what followed is read over. */
export const HORIZONS = Object.freeze([3, 8, 20]);
/** The trees: as many, as deep, at least so many states a leaf, so shrunk, each on a share of the states and of the features. */
const TREES = Object.freeze({ rounds: 300, rate: .03, depth: 4, minLeaf: 400, lambda: 50, subsample: .5, colsample: .7 });

/** What `side` dealt and took over `h` s from `t` (to the bout's `end`), by its lives at each change (`lives`: [clock, left's, right's]). */
export function followed(lives, end, side, t, h) {
  const at = (when) => { let lo = 0, hi = lives.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (lives[m][0] <= when + 1e-9) lo = m; else hi = m - 1; } return lives[lo]; };
  const [, l0, r0] = at(t), [, l1, r1] = at(Math.min(t + h, end));
  const [own, foe] = side === "left" ? [l0 - l1, r0 - r1] : [r0 - r1, l0 - l1];
  return { dealt: foe, taken: own };
}

/**
 * **Fit each horizon** to `states`, each `{ x, held, weight, after }`: its features (`featuresOf`),
 * whether it is held out of the fit, how much it counts (1 for a row of the newest play), and what
 * followed it over each horizon (`followed`). Says each horizon's held-out R² through `say`, and
 * that of 2 dealt less taken read from the two beside trees fitted to it alone (not kept): what
 * fitting them apart loses. Gives the models as the asset keeps them, and the counts.
 */
export function fitValue(states, featureCount, say = console.log) {
  const F = featureCount, n = states.length, X = new Float64Array(n * F), weight = Float64Array.from(states, (s) => s.weight);
  states.forEach((s, i) => X.set(s.x, i * F));
  const train = [], test = [];
  states.forEach((s, i) => (s.held ? test : train).push(i));
  if (train.length === 0 || test.length === 0) throw new Error(`a fit needs states both fitted and held out: ${train.length} and ${test.length}`);
  const edges = binsOf(X, n, F), B = binned(X, n, F, edges), models = [];
  const trees = (y) => {
    let sum = 0, mass = 0; for (const i of train) { sum += weight[i] * y[i]; mass += weight[i]; }
    const base = sum / mass, gradients = (pred, g, h) => { for (const i of train) { g[i] = weight[i] * (pred[i] - y[i]); h[i] = weight[i]; } };
    const model = boost(B, F, edges, n, train, gradients, { ...TREES, base });
    return { base, trees: model.trees, pred: model.pred };
  };
  for (const [k, h] of HORIZONS.entries()) {
    const dealtY = Float64Array.from(states, (s) => s.after[k].dealt), takenY = Float64Array.from(states, (s) => s.after[k].taken), dealt = trees(dealtY), taken = trees(takenY);
    const tradedY = Float64Array.from(dealtY, (d, i) => 2 * d - takenY[i]), traded = Float64Array.from(dealt.pred, (d, i) => 2 * d - taken.pred[i]), alone = trees(tradedY);
    say(`over ${h} s, R² held out (fitted): dealt ${r2(test, dealt.pred, dealtY).toFixed(3)} (${r2(train, dealt.pred, dealtY).toFixed(3)}), taken ${r2(test, taken.pred, takenY).toFixed(3)} (${r2(train, taken.pred, takenY).toFixed(3)}); 2 dealt less taken from the two ${r2(test, traded, tradedY).toFixed(3)}, fitted alone ${r2(test, alone.pred, tradedY).toFixed(3)}`);
    models.push({ dealt: { base: dealt.base, trees: dealt.trees }, taken: { base: taken.base, trees: taken.trees } });
  }
  return { models, fitted: train.length, held: test.length };
}

/**
 * **What a fitted value already made reads of `states` held out** (`models`, as an asset keeps
 * them; `at(trees, x)` reads one, `treesAt`): each horizon's R² for dealt, taken and 2 dealt less
 * taken, said through `say` as `fitValue` says its own, so the two are read on the same states.
 */
export function readValue(models, states, at, say = console.log) {
  const test = states.flatMap((s, i) => s.held ? [i] : []);
  for (const [k, h] of HORIZONS.entries()) {
    const dealtY = states.map((s) => s.after[k].dealt), takenY = states.map((s) => s.after[k].taken), dealt = states.map((s) => s.held ? at(models[k].dealt, s.x) : 0), taken = states.map((s) => s.held ? at(models[k].taken, s.x) : 0);
    const tradedY = dealtY.map((d, i) => 2 * d - takenY[i]), traded = dealt.map((d, i) => 2 * d - taken[i]);
    say(`over ${h} s, R² held out: dealt ${r2(test, dealt, dealtY).toFixed(3)}, taken ${r2(test, taken, takenY).toFixed(3)}; 2 dealt less taken ${r2(test, traded, tradedY).toFixed(3)}`);
  }
}

/** The mean of `y` over the states `idx`. */
function mean(idx, y) { return idx.reduce((s, i) => s + y[i], 0) / idx.length; }
/** The share of `y`'s spread over the states `idx` that `pred` reads. */
function r2(idx, pred, y) { const m = mean(idx, y); let se = 0, st = 0; for (const i of idx) { se += (pred[i] - y[i]) ** 2; st += (y[i] - m) ** 2; } return 1 - se / st; }
