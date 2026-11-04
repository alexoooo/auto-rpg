/**
 * The tree chooser's search (`TREE_CHOOSER`, `src/core/option/chooser.ts`): a payoff three Options
 * deep, past the valued chooser's two and its leaf, is found and worth its way there; and a
 * decision is the same from the same state and seed.
 */
import "./harness/preload-data.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { TREE_CHOOSER, VALUED_CHOOSER } from "../src/core/option/chooser.ts";
import { FEW_TERMS_PART } from "../src/core/option/objective.ts";
import { READY, blocked } from "../src/core/option/option.ts";
import { UNMOVED } from "../src/core/option/value.ts";
import { pressureAt } from "../src/core/option/percepts.ts";

const NOT = blocked("not from here");

/**
 * A stub Option named `name`: from posture `from` it runs `seconds` s, dealing `dealt`, and leaves
 * the body in posture `to` (where it was, without one); open where `open`, a rest where `rest`.
 */
function stub(name, { from, to, seconds = 1, dealt = 0, open = false, rest = false }) {
  const terms = (until) => ({ duration: open ? until ?? 0 : seconds, dealt, taken: 0, orders: 0,
    outcomes: to ? [{ leaves: { posture: to, velocity: { x: 0, z: 0 } }, chance: 1 }] : UNMOVED });
  return { name, state: {}, claims: [], ...(open ? { open: true } : {}), ...(rest ? { rest: true } : {}),
    entry: (now) => now.posture === from ? READY : NOT, status: () => "yields", begin() {}, end() {}, step() { throw new Error("not stepped"); },
    model: (at, ask) => at.posture === from ? terms(ask?.until) : null };
}

/**
 * Lying on a side, where flatten alone of the ways to stand is on offer: flatten to the back, roll
 * to hands and knees, rise to standing, then a blow that leaves the body where it is, run again;
 * bracing holds any lying posture, holding a standing one.
 */
const OPTIONS = ["side", "back", "fours"].map((from) => stub(`brace (${from})`, { from, open: true, rest: true })).concat([
  stub("flatten", { from: "side", to: "back", seconds: 1 }),
  stub("roll", { from: "back", to: "fours", seconds: 3 }),
  stub("rise", { from: "fours", to: "standing", seconds: 3 }),
  stub("strike", { from: "standing", seconds: 2, dealt: 0.05 }),
  stub("hold", { from: "standing", open: true, rest: true }),
]);

/** The body lying on its side with no foe in sight, at time `time`, s. */
const lying = (time) => ({
  time, posture: "side", down: true, range: 3, apart: 3, grace: 1, focus: null, where: { x: 0, z: 0, face: 0 }, velocity: { x: 0, z: 0 },
  lead: 0, lateness: 0, orders: null, sight: { report: { actions: [] } }, predictions: { danger: 0, pressure: { latency: 1, model: [], phase: 0 } },
  cues: { event: () => "", clear() {}, asked: () => [] },
});

const PARTS = { of: () => FEW_TERMS_PART };
const offered = (chooser) => Object.fromEntries(chooser.offers.map((offer) => [offer.name, offer.worth]));

test("a payoff three Options deep is worth its way there to the tree, and to the valued chooser nothing", () => {
  const valued = VALUED_CHOOSER.make({ kind: "valued", depth: 2 }, OPTIONS, 1, PARTS);
  const tree = TREE_CHOOSER.make({ kind: "tree", runs: 200 }, OPTIONS, 1, PARTS);
  valued.decide(lying(1)); tree.decide(lying(1));
  // The control: the valued chooser, two deep and its leaf, sees no blow from the side and braces.
  assert.deepEqual(offered(valued), { "brace (side)": 0, flatten: 0 });
  assert.equal(valued.running[0]?.name, "brace (side)");
  const worths = offered(tree);
  assert.ok(worths.flatten > 0, `flatten is worth the blows past it, ${worths.flatten}`);
  assert.equal(worths["brace (side)"], 0);
  assert.equal(tree.running[0]?.name, "flatten");
});

test("a tree decision is the same from the same state and seed, and its stream moves on with its state", () => {
  const decided = () => {
    const tree = TREE_CHOOSER.make({ kind: "tree", runs: 50 }, OPTIONS, 7, PARTS);
    tree.decide(lying(1));
    return { offers: tree.offers, state: JSON.stringify(tree.state.tree) };
  };
  const first = decided(), again = decided();
  assert.deepEqual(again.offers, first.offers);
  assert.equal(again.state, first.state);
  assert.notEqual(first.state, JSON.stringify({ word: 7 }), "the decision drew from its stream");
});

test("tree models share exact pressure queries only within their decision", () => {
  let reads = 0, rate = .25;
  const pressure = { model: [{ reach: () => 10, rate: () => { reads++; return rate; } }], phase: "clear", struck: null, latency: 1, peak: 1, priced: "measured" };
  const hold = stub("hold", { from: "side", open: true, rest: true }), model = hold.model;
  hold.model = (at, ask) => {
    const terms = model(at, ask);
    return { ...terms, taken: pressureAt(at.predictions.pressure, 1, [0, 0], terms.duration)
      + pressureAt(at.predictions.pressure, 1, [0, 0], .5) };
  };
  const tree = TREE_CHOOSER.make({ kind: "tree", runs: 5 }, [hold], 7, PARTS);
  const now = (time) => ({ ...lying(time), predictions: { danger: 0, pressure } });
  const first = now(1);
  tree.decide(first);
  assert.equal(reads, 1, "model, leaf and tree edge share one profile read");
  assert.deepEqual(offered(tree), { hold: -5.125 });
  assert.equal(first.predictions.pressure, pressure);
  assert.equal(pressure.rateAt, undefined, "the search never writes into the live prediction");
  rate = .5;
  tree.decide(now(2));
  assert.equal(reads, 2, "a new decision recomputes even when given the same pressure object");
  assert.deepEqual(offered(tree), { hold: -10.25 });
});
