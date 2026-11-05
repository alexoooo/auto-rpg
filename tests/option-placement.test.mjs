import test from "node:test";
import assert from "node:assert/strict";
import { placed, placing } from "../src/core/option/option.ts";

const MEMORY = Symbol("fixture memory");

function situation() {
  const reads = [];
  const report = { actions: [{ id: 7 }], ledger: [{ sequence: 2 }], heading: .5 };
  const pressure = { latency: 2, model: [{ reach: () => 5 }], phase: "clear" };
  const at = Object.assign(Object.create({
    get reaction() { reads.push("reaction"); return this[MEMORY].reaction; },
    perceive() { return this[MEMORY].part; },
  }), {
    [MEMORY]: { reaction: .15, part: { value: 8 } }, time: 3,
    where: { x: 0, z: 0, face: 0 }, focus: { centre: { x: 4, z: 3 } },
    apart: 5, range: 4.5, around: 0, posture: "standing", down: false,
    velocity: { x: 1, z: 0 }, stride: "walk", grace: 1,
    incoming: { segment: "head" }, ground: { position: "standing" },
    sight: { report, view: { value: 9 }, get envelope() { reads.push("envelope"); return this.view; } },
    predictions: { danger: .3, pressure, get turns() { reads.push("turns"); return this.pressure.latency; } },
  });
  return { at, reads };
}

const observe = (at) => ({
  time: at.time, where: at.where, apart: at.apart, range: at.range, around: at.around,
  posture: at.posture, down: at.down, velocity: at.velocity, stride: at.stride, grace: at.grace,
  incoming: at.incoming, ground: at.ground, danger: at.predictions.danger,
  actions: at.sight.report.actions, ledger: at.sight.report.ledger, heading: at.sight.report.heading,
  envelope: at.sight.envelope, turns: at.predictions.turns, reaction: at.reaction, part: at.perceive(),
});

test("search placements preserve overrides, inherited getters and the live situation", () => {
  const { at, reads } = situation(), place = placing();
  const leaves = { where: { x: 4, z: 0, face: 1 }, around: .25, posture: "back", velocity: { x: 0, z: 0 }, grace: .4 };
  const first = place(at, leaves, 2), sibling = place(at, { around: -.5 }, .25);
  assert.deepEqual(reads, [], "construction leaves unrelated readings lazy");
  assert.deepEqual(observe(first), {
    time: 3, where: leaves.where, apart: 3, range: 2.5, around: .25,
    posture: "back", down: true, velocity: leaves.velocity, stride: "stand", grace: .4,
    incoming: null, ground: null, danger: 0, actions: [], ledger: [{ sequence: 2 }], heading: .5,
    envelope: { value: 9 }, turns: 2, reaction: .15, part: { value: 8 },
  });
  assert.deepEqual(reads, ["envelope", "turns", "reaction"]);
  assert.deepEqual(observe(sibling), {
    time: 3, where: at.where, apart: 5, range: 4.5, around: -.5,
    posture: "standing", down: false, velocity: at.velocity, stride: "walk", grace: 1.25,
    incoming: null, ground: null, danger: 0, actions: [], ledger: [{ sequence: 2 }], heading: .5,
    envelope: { value: 9 }, turns: 2, reaction: .15, part: { value: 8 },
  });
  assert.deepEqual({ actions: at.sight.report.actions, danger: at.predictions.danger, ground: at.ground, incoming: at.incoming }, {
    actions: [{ id: 7 }], danger: .3, ground: { position: "standing" }, incoming: { segment: "head" },
  });
});

test("descendants keep their own grace and posture and the same read-only overlays", () => {
  const { at } = situation(), place = placing();
  const first = place(at, { around: .5 }, .25), sibling = place(at, { posture: "back" }, .5);
  const child = place(first, { posture: "fours" }, .5);
  assert.equal(first.sight, sibling.sight);
  assert.equal(first.predictions, sibling.predictions);
  assert.equal(child.sight, first.sight);
  assert.equal(child.predictions, first.predictions);
  assert.deepEqual([first.grace, sibling.grace, child.grace, first.posture, sibling.posture, child.posture],
    [1.25, 1.5, 1.75, "standing", "back", "fours"]);
  assert.deepEqual(observe(child), observe(placed(placed(at, { around: .5 }, .25), { posture: "fours" }, .5)));
  assert.equal(Object.isFrozen(child.sight.report.actions), true);
});

test("separate sights, predictions and searches retain their own readings", () => {
  const { at } = situation(), place = placing(), first = place(at, {}, .5);
  const other = { ...at, sight: { ...at.sight, report: { actions: [{ id: 10 }], heading: 1 } },
    predictions: { danger: .7, pressure: { ...at.predictions.pressure, latency: 3 }, turns: 4 } };
  const next = place(other, {}, .5);
  assert.notEqual(next.sight, first.sight); assert.notEqual(next.predictions, first.predictions);
  assert.deepEqual({ heading: next.sight.report.heading, actions: next.sight.report.actions, danger: next.predictions.danger, turns: next.predictions.turns },
    { heading: 1, actions: [], danger: 0, turns: 4 });
  const mixed = place(Object.assign(Object.create(at), { predictions: other.predictions }), {}, .5);
  assert.equal(mixed.sight, first.sight); assert.equal(mixed.predictions, next.predictions);
  const separate = placing()(at, {}, .5);
  assert.notEqual(separate.sight, first.sight); assert.notEqual(separate.predictions, first.predictions);
  assert.deepEqual(observe(separate), observe(first));
  const alone = Object.assign(Object.create(at), { focus: null, grace: undefined, reached: { grace: () => Infinity }, predictions: { ...at.predictions, pressure: { latency: Infinity, model: [] } } });
  assert.deepEqual(observe(place(alone, { where: { x: -1, z: 2, face: 0 }, velocity: { x: 2, z: 1 } }, 1)),
    observe(placed(alone, { where: { x: -1, z: 2, face: 0 }, velocity: { x: 2, z: 1 } }, 1)));
});

test("search placements keep each situation's own properties and values", () => {
  const { at } = situation(), place = placing();
  const leaves = { where: { x: 4, z: 0, face: 1 }, around: .25, posture: "back", velocity: { x: 0, z: 0 }, grace: .4 };
  const first = place(at, leaves, 2), before = observe(first);
  const alone = Object.assign(Object.create(at), { focus: null });
  const cases = [
    { at, leaves: {}, own: ["ground", "incoming", "sight", "predictions", "grace"] },
    { at: alone, leaves: { where: { x: 1, z: 2, face: 0 } }, own: ["ground", "incoming", "sight", "predictions", "where", "grace"] },
    { at, leaves: { around: -.5, posture: "standing", velocity: { x: 2, z: 1 } }, own: ["ground", "incoming", "sight", "predictions", "around", "posture", "down", "velocity", "grace"] },
    { at, leaves, own: ["ground", "incoming", "sight", "predictions", "where", "apart", "range", "around", "posture", "down", "velocity", "stride", "grace"] },
  ];
  for (const recipe of [...cases, ...cases.toReversed()]) {
    const there = place(recipe.at, recipe.leaves, .5);
    assert.equal(Object.getPrototypeOf(there), recipe.at);
    assert.deepEqual(Reflect.ownKeys(there), recipe.own);
    assert.deepEqual(Object.keys(there), []);
    for (const key of recipe.own) assert.deepEqual(Object.getOwnPropertyDescriptor(there, key), {
      value: there[key], writable: false, enumerable: false, configurable: false,
    });
    assert.deepEqual(observe(there), observe(placed(recipe.at, recipe.leaves, .5)));
    assert.deepEqual(observe(first), before, "later placements leave existing situations intact");
  }
});

test("a getter can make a nested placement without replacing outer descriptor values", () => {
  const { at } = situation(), place = placing();
  let nested;
  const parent = Object.create(at, { range: { get() {
    nested = place(at, { where: { x: -2, z: -1, face: -1 }, around: -.5, posture: "fours", velocity: { x: 0, z: 0 }, grace: .75 }, .5);
    return at.range;
  } } });
  const leaves = { where: { x: 4, z: 0, face: 1 }, around: .25, posture: "back", velocity: { x: 2, z: 1 }, grace: .4 };
  const outer = place(parent, leaves, 2);
  assert.ok(nested, "the range getter made another placement during construction");
  assert.deepEqual({ where: outer.where, apart: outer.apart, range: outer.range, around: outer.around, posture: outer.posture,
    velocity: outer.velocity, stride: outer.stride, grace: outer.grace }, {
    where: leaves.where, apart: 3, range: 2.5, around: .25, posture: "back", velocity: leaves.velocity, stride: "walk", grace: .4,
  });
  assert.deepEqual({ where: nested.where, posture: nested.posture, stride: nested.stride, grace: nested.grace }, {
    where: { x: -2, z: -1, face: -1 }, posture: "fours", stride: "stand", grace: .75,
  });
  assert.deepEqual(observe(place(at, {}, .5)), observe(placed(at, {}, .5)));
});
