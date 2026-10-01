/**
 * A sweep of the core's functions of a real number (`src/core/math/real.ts`) and its digest: the
 * arguments are drawn with integer arithmetic and IEEE's own operations and nothing else, so they
 * are the same in every JavaScript engine, and so is the digest if the functions are.
 * `tests/core-math.test.mjs` holds the digests to their record, and
 * `research/real-against-engine.mjs` prints them in whatever engine runs it.
 */
import { acos, asin, atan2, cbrt, cos, cosh, exp, hypot, norm, sin, sinh, tan } from "../../src/core/math/real.ts";

const view = new DataView(new ArrayBuffer(8));

/** A seeded sequence of 32-bit words. */
function wordsFrom(seed) {
  let state = seed >>> 0;
  return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
}

/** The ways an argument is drawn from a sequence of words. */
function draws(seed) {
  const word = wordsFrom(seed), unit = () => word() / 4294967296;
  return {
    /** Evenly over -`reach` to `reach`. */
    within: (reach) => () => (unit() * 2 - 1) * reach,
    /** Any sign, any fraction, and an exponent evenly from two to the `least` to two to the `most`. */
    scaled: (least, most) => () => {
      const high = word(), exponent = 1023 + least + (word() % (most - least + 1));
      view.setUint32(0, ((high & 0x800fffff) | (exponent << 20)) >>> 0);
      view.setUint32(4, word());
      return view.getFloat64(0);
    },
    /** Any double at all: every exponent, the subnormals, the infinities and the unknowns. */
    any: () => {
      view.setUint32(0, word());
      view.setUint32(4, word());
      return view.getFloat64(0);
    },
  };
}

/** A running digest of doubles, by their bits; every unknown counts as one. */
function digester() {
  let a = 0x811c9dc5, b = 0x01000193;
  return {
    take(x) {
      view.setFloat64(0, x === x ? x : NaN);
      const high = x === x ? view.getUint32(0) : 0x7ff80000, low = x === x ? view.getUint32(4) : 0;
      a = Math.imul(a ^ high, 16777619); a = Math.imul(a ^ low, 16777619);
      b = Math.imul(b ^ low, 2246822519) + high | 0; b = Math.imul(b ^ (b >>> 15), 3266489917);
    },
    read: () => (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0"),
  };
}

/** How many arguments each way of drawing gives each function, and the seed they are drawn from. */
export const SWEEP_EACH = 20000;
const SWEEP_SEED = 20011;

/**
 * What the sweep calls, by name: the function, how many numbers it takes, and how each is drawn.
 * The ranges are where each function changes its method, and the whole line beside them.
 */
export function sweepPlan(d) {
  const angles = [d.within(Math.PI), d.within(1000), d.within(2e6), d.scaled(-60, 60), d.any];
  const ratios = [d.within(1), d.within(0.5), d.scaled(-60, -1), d.any];
  const growth = [d.within(1), d.within(40), d.within(750), d.scaled(-60, 9), d.any];
  const lengths = [d.within(1), d.within(100), d.scaled(-600, 600), d.any];
  return [
    { name: "sin", call: sin, takes: 1, drawn: angles },
    { name: "cos", call: cos, takes: 1, drawn: angles },
    { name: "tan", call: tan, takes: 1, drawn: angles },
    { name: "asin", call: asin, takes: 1, drawn: ratios },
    { name: "acos", call: acos, takes: 1, drawn: ratios },
    { name: "atan2", call: atan2, takes: 2, drawn: [d.within(1), d.within(10), d.scaled(-60, 60), d.scaled(-600, 600), d.any] },
    { name: "exp", call: exp, takes: 1, drawn: growth },
    { name: "sinh", call: sinh, takes: 1, drawn: growth },
    { name: "cosh", call: cosh, takes: 1, drawn: growth },
    { name: "cbrt", call: cbrt, takes: 1, drawn: lengths },
    { name: "hypot of 2", call: hypot, takes: 2, drawn: lengths },
    { name: "hypot of 3", call: hypot, takes: 3, drawn: lengths },
    { name: "norm of 6", call: (...parts) => norm(parts), takes: 6, drawn: lengths },
  ];
}

/**
 * Every row of the plan run over its arguments: `visit(name, args, value)` for each call, and the
 * digest of each function's values, by name. `plan` is the plan to run, `sweepPlan` unless a
 * control swaps a function in it.
 */
export function sweep(visit = () => {}, each = SWEEP_EACH, plan = sweepPlan) {
  const digests = {};
  for (const { name, call, takes, drawn } of plan(draws(SWEEP_SEED))) {
    const digest = digester(), args = new Array(takes);
    for (const draw of drawn) {
      for (let i = 0; i < each; i++) {
        for (let k = 0; k < takes; k++) args[k] = draw();
        const value = call(...args);
        digest.take(value);
        visit(name, args, value);
      }
    }
    digests[name] = digest.read();
  }
  return digests;
}
