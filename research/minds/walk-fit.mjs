/**
 * **The walk times' fit** (`WalkTimes`, `src/minds/option/predictions/walk-times.ts`), for the
 * measuring command (`measure.mjs`): of a record's rows, each walk to a strike's window a side took
 * with both bodies standing, read from its roots (`walksOf`), and for each gait boosted regression
 * trees for the seconds from each of its states to its arrival and the speed along its way it
 * arrived at (`fitWalks`), as a walk's model asks them (`walkFeatures`).
 *
 * A walk is the roots of one side, one after another, whose Option taken (`ran`) is a walk to the
 * same strike's window, by any gait; a root that takes nothing new goes on with it. It arrived
 * where the next Option taken is that window's strike, of the same limb; else it was cut, and is
 * not read. Each of its roots that takes a walk again with both standing, where the search weighed
 * the walk taken and kept where it leaves the body (`LINE`'s `x`, `z`; a row played before they
 * were kept has none), is a state of the gait taken there: the way from where the body stands to
 * that spot, the body's and the focus's velocities (`reading`), and the seconds to the arriving
 * root and the body's speed along the state's way there.
 */
import { binned, binsOf, boost } from "./boosted-trees.mjs";

/** The trees: as many, as deep, at least so many states a leaf, so shrunk, each on a share of the states. */
const TREES = Object.freeze({ rounds: 200, rate: .05, depth: 4, minLeaf: 40, lambda: 10, subsample: .7, colsample: 1 });

/** A walk Option's name read: its gait (its label, in lower case) and the strike whose window it goes to; null for another Option. */
const walkOf = (name) => { const m = /^(.*?) to (.*?)'s window/.exec(name ?? ""); return m ? { gait: m[1], strike: m[2] } : null; };

/**
 * **The walks' states of a record's `row`**, each `{ gait, x, seconds, speed }` (`WALK_FEATURES`'
 * `x`), by `features(where, velocity, foe, spot)` (`walkFeatures`).
 */
export function walksOf(row, features) {
  const states = [];
  for (const side of ["left", "right"]) {
    let walk = null;
    const close = (end, arrived) => {
      if (arrived) for (const s of walk.states) {
        const [vx, vz] = end.reading.velocity;
        states.push({ gait: s.gait, x: s.x, seconds: end.t - s.t, speed: Math.max(0, vx * s.ux + vz * s.uz) });
      }
      walk = null;
    };
    for (const root of row.roots) {
      if (root.side !== side) continue;
      const name = root.ran ? row.options[root.ran[0]] : walk?.name, going = walkOf(name);
      if (walk && going?.strike !== walk.strike) close(root, !going && !!name && name.startsWith(walk.strike));
      if (!going || !root.ran) continue;
      walk ??= { strike: going.strike, name, states: [] };
      const reading = root.reading, line = root.lines.find((l) => l[0] === root.ran[0] && l[1] === root.ran[1]);
      if (reading.posture !== "standing" || reading.foePosture !== "standing" || !line || line[10] == null) continue;
      const [x, z] = reading.at, [vx, vz] = reading.velocity, [fx, fz] = reading.foeVelocity;
      const read = features({ x, z }, { x: vx, z: vz }, { x: fx, z: fz }, { x: line[10], z: line[11] });
      walk.states.push({ t: root.t, gait: going.gait, ...read });
    }
  }
  return states;
}

/**
 * **Fit each gait** to `states`, each `{ gait, x, seconds, speed, held, weight }`: says each
 * gait's held-out errors through `say`, seconds and speed, beside the mean's; gives the gaits'
 * models as the asset keeps them, each with the span of each feature its states fitted cover
 * (`over`), and the counts.
 */
export function fitWalks(states, featureCount, say = console.log) {
  const gaits = {}, F = featureCount;
  let fitted = 0, held = 0;
  for (const gait of [...new Set(states.map((s) => s.gait))].sort()) {
    const of = states.filter((s) => s.gait === gait), n = of.length, X = new Float64Array(n * F), weight = Float64Array.from(of, (s) => s.weight);
    of.forEach((s, i) => X.set(s.x, i * F));
    const train = [], test = [];
    of.forEach((s, i) => (s.held ? test : train).push(i));
    if (train.length < 2 * TREES.minLeaf || test.length === 0) { say(`${gait}: ${train.length} states fitted and ${test.length} held out, too few: not fitted`); continue; }
    const edges = binsOf(X, n, F), B = binned(X, n, F, edges);
    const trees = (y) => {
      let sum = 0, mass = 0; for (const i of train) { sum += weight[i] * y[i]; mass += weight[i]; }
      const base = sum / mass, model = boost(B, F, edges, n, train, (pred, g, h) => { for (const i of train) { g[i] = weight[i] * (pred[i] - y[i]); h[i] = weight[i]; } }, { ...TREES, base });
      return { base, trees: model.trees, pred: model.pred };
    };
    const secondsY = Float64Array.from(of, (s) => s.seconds), speedY = Float64Array.from(of, (s) => s.speed), seconds = trees(secondsY), speed = trees(speedY);
    say(`${gait}: ${train.length} states fitted, ${test.length} held out; held out, seconds ${errors(test, seconds.pred, secondsY)} (the mean's ${errors(test, test.map(() => seconds.base), secondsY, true)}), speed ${errors(test, speed.pred, speedY)}, m/s`);
    const over = Array.from({ length: F }, (_, f) => train.reduce(([lo, hi], i) => [Math.min(lo, X[i * F + f]), Math.max(hi, X[i * F + f])], [Infinity, -Infinity]));
    gaits[gait] = { over, seconds: { base: seconds.base, trees: seconds.trees }, speed: { base: speed.base, trees: speed.trees } };
    fitted += train.length; held += test.length;
  }
  return { gaits, fitted, held };
}

/**
 * **What walk times already made read of `states` held out** (`gaits`, as an asset keeps them;
 * `at(trees, x)` reads one, `treesAt`): each gait's errors, said through `say` as `fitWalks` says its own.
 */
export function readWalks(gaits, states, at, say = console.log) {
  for (const gait of [...new Set(states.map((s) => s.gait))].sort()) {
    const of = states.filter((s) => s.gait === gait && s.held), model = gaits[gait];
    if (!model) { say(`${gait}: not in the asset in place`); continue; }
    if (!of.length) { say(`${gait}: none held out`); continue; }
    const idx = of.map((_, i) => i);
    say(`${gait}: ${of.length} held out; seconds ${errors(idx, of.map((s) => at(model.seconds, s.x)), of.map((s) => s.seconds))}, speed ${errors(idx, of.map((s) => at(model.speed, s.x)), of.map((s) => s.speed))}, m/s`);
  }
}

/** The mean and the median of `pred`'s distance from `y` over the states `idx`, as words; `aligned` where `pred` is by place in `idx`. */
function errors(idx, pred, y, aligned = false) {
  const e = idx.map((i, k) => Math.abs((aligned ? pred[k] : pred[i]) - y[i])).sort((a, b) => a - b);
  return `mean ${(e.reduce((s, x) => s + x, 0) / e.length).toFixed(3)}, median ${e[e.length >> 1].toFixed(3)}`;
}
