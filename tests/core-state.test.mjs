/**
 * State as data (`src/core/state.ts`): a state saves and loads whole and in place, keeps what was
 * shared, never writes into a constant, and refuses by its path whatever is not state.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { deepFreeze, loadState, saveState } from "../src/core/state.ts";
import { headlessScene } from "./harness/scene.mjs";

/** A state with one of every kind a state may hold. */
const everyKind = () => ({
  count: 3, ratio: -0.25, name: "swing", on: true, none: null, missing: undefined,
  nested: { deep: { deeper: 7 }, list: [1, 2, 3] },
  feet: [{ side: "left", at: new Vector3(1, 2, 3) }, { side: "right", at: new Vector3(4, 5, 6) }],
  samples: new Float64Array([0.1, 0.2, 0.3]), bytes: new Uint8Array([1, 2, 3, 4]),
  byName: new Map([["a", { n: 1 }], ["b", { n: 2 }]]), byNumber: new Map([[1, "one"]]),
  touching: new Set(["a|b", "c|d"]),
  at: new Vector3(0.5, -1, 2), turn: new Quaternion(0.1, 0.2, 0.3, 0.9),
});

/** Every object under `root`, by its path. */
function objectsOf(root) {
  const out = new Map();
  const walk = (value, path) => {
    if (value === null || typeof value !== "object" || out.has(path)) return;
    out.set(path, value);
    if (value instanceof Vector3 || value instanceof Quaternion || ArrayBuffer.isView(value) || value instanceof Set) return;
    if (value instanceof Map) { for (const [key, item] of value) walk(item, `${path}.get(${key})`); return; }
    for (const [key, item] of Object.entries(value)) walk(item, `${path}.${key}`);
  };
  walk(root, "state");
  return out;
}

/** Every field of `state` changed, the objects left where they are. */
function scramble(state) {
  state.count = 99; state.ratio = 1; state.name = "other"; state.on = false; state.none = 5; state.missing = 1;
  state.nested.deep.deeper = -1; state.nested.list.push(4); state.nested.extra = "added";
  state.feet[0].side = "x"; state.feet[0].at.set(9, 9, 9); state.feet[1].at.set(8, 8, 8); state.feet.push({ side: "third", at: new Vector3() });
  state.samples.fill(7); state.bytes.fill(0);
  state.byName.get("a").n = 50; state.byName.delete("b"); state.byName.set("c", { n: 3 }); state.byNumber.set(2, "two");
  state.touching.clear(); state.touching.add("e|f");
  state.at.set(0, 0, 0); state.turn.set(0, 0, 0, 1);
}

test("a_state_saves_and_loads_whole", () => {
  const state = everyKind(), original = everyKind(), saved = saveState(state), before = objectsOf(state);
  // A save shares nothing with what it was saved from.
  for (const [path, object] of objectsOf(saved)) for (const live of before.values()) assert.notEqual(object, live, path);
  scramble(state);
  assert.notDeepEqual(state, original);
  loadState(state, saved);
  assert.deepEqual(state, original);
  // In place: every object that was there is the object that was there, the vector and the typed
  // array among them. The one map entry that was deleted is a new object.
  const after = objectsOf(state);
  assert.deepEqual([...after.keys()], [...before.keys()]);
  for (const [path, object] of before) {
    if (path === "state.byName.get(b)") assert.notEqual(after.get(path), object, path);
    else assert.equal(after.get(path), object, path);
  }
  assert.ok(before.get("state.at") instanceof Vector3 && before.get("state.samples") instanceof Float64Array && before.size === 18, `${[...before.keys()]}`);
  // A load leaves the save as it was: it loads again after the state has moved on.
  scramble(state);
  loadState(state, saved);
  assert.deepEqual(state, original);
  // A typed array of another length or kind is replaced, not filled short.
  state.samples = new Float64Array(5);
  state.bytes = new Float64Array(4);
  loadState(state, saved);
  assert.deepEqual(state, original);
});

test("sharing_is_kept_and_made_and_unmade", () => {
  // Shared at the save, parted since: one object after the load.
  const x = { v: new Vector3(1, 2, 3), n: 1 };
  const shared = { a: x, b: x, list: [x] };
  const saved = saveState(shared);
  shared.b = { v: new Vector3(7, 7, 7), n: 2 };
  shared.list = [shared.b];
  loadState(shared, saved);
  assert.equal(shared.a, shared.b);
  assert.equal(shared.list[0], shared.a);
  assert.equal(shared.a, x, "and it is the object that was there");
  assert.deepEqual(shared.a, { v: new Vector3(1, 2, 3), n: 1 });

  // Apart at the save, joined since: two objects after, each with its own values.
  const apart = { a: { n: 1, at: new Vector3(1, 0, 0) }, b: { n: 2, at: new Vector3(0, 1, 0) } };
  const two = saveState(apart);
  apart.b = apart.a;
  loadState(apart, two);
  assert.notEqual(apart.a, apart.b);
  assert.notEqual(apart.a.at, apart.b.at);
  assert.deepEqual(apart, { a: { n: 1, at: new Vector3(1, 0, 0) }, b: { n: 2, at: new Vector3(0, 1, 0) } });

  // A slot null at the save and an object now loads null; an object at the save and null now loads
  // a new object, a vector as a vector and a turn as a turn.
  const slots = { was: null, vector: new Vector3(3, 4, 0), turn: new Quaternion(0, 0, 0, 1), record: { n: 1 }, samples: new Float64Array([1, 2]) };
  const kept = saveState(slots);
  slots.was = { n: 1 };
  slots.vector = null; slots.turn = null; slots.record = null; slots.samples = null;
  loadState(slots, kept);
  assert.equal(slots.was, null);
  assert.ok(slots.vector instanceof Vector3 && slots.vector.length() === 5);
  assert.ok(slots.turn instanceof Quaternion && slots.turn.w === 1);
  assert.deepEqual(slots.record, { n: 1 });
  assert.deepEqual(slots.samples, new Float64Array([1, 2]));
  // A slot of another kind is replaced, not filled: a record where an array was, an array where a vector was.
  const kinds = { a: [1, 2], b: new Vector3(1, 1, 1) };
  const asSaved = saveState(kinds), list = kinds.a;
  kinds.a = { n: 1 }; kinds.b = [3];
  loadState(kinds, asSaved);
  assert.deepEqual(kinds, { a: [1, 2], b: new Vector3(1, 1, 1) });
  assert.notEqual(kinds.a, list);
});

test("a_load_never_writes_into_a_constant", () => {
  const table = deepFreeze({ guard: { angles: [0.1, 0.2], at: { x: 1 } }, strike: { angles: [0.9, 0.8], at: { x: 2 } } });
  assert.ok(Object.isFrozen(table.guard) && Object.isFrozen(table.guard.angles) && Object.isFrozen(table.strike.at), "frozen deep");
  assert.throws(() => { "use strict"; table.guard.angles[0] = 5; }, TypeError);
  // The slot held the strike at the save and points at the guard now: the load puts a copy of the
  // strike in the slot and leaves the guard as it was.
  const state = { pose: table.strike };
  const saved = saveState(state);
  state.pose = table.guard;
  loadState(state, saved);
  assert.deepEqual(state.pose, { angles: [0.9, 0.8], at: { x: 2 } });
  assert.notEqual(state.pose, table.guard);
  assert.deepEqual(table.guard, { angles: [0.1, 0.2], at: { x: 1 } });
  // The control: the same with the table not frozen writes the strike over the guard.
  const loose = { guard: { angles: [0.1, 0.2], at: { x: 1 } }, strike: { angles: [0.9, 0.8], at: { x: 2 } } };
  const other = { pose: loose.strike };
  const taken = saveState(other);
  other.pose = loose.guard;
  loadState(other, taken);
  assert.deepEqual(loose.guard, { angles: [0.9, 0.8], at: { x: 2 } }, "which is why a table a state points at is frozen");
  // A frozen root has nowhere to load into.
  assert.throws(() => loadState(Object.freeze({ n: 1 }), saveState({ n: 2 })), /a state of its own kind/);
});

test("what_is_not_state_is_refused_by_name", () => {
  const stage = headlessScene();
  try {
    const good = () => ({ motor: { hands: [{ time: 0 }, { time: 1 }] }, senses: { frames: new Map([["left", []]]) } });
    assert.doesNotThrow(() => saveState(good()));
    const withFunction = good(); withFunction.motor.hands[1].chain = () => 0;
    assert.throws(() => saveState(withFunction), /state\.motor\.hands\[1\]\.chain is a function/);
    const withGetter = good(); Object.defineProperty(withGetter.motor.hands[0], "heading", { get: () => 1, enumerable: true });
    assert.throws(() => saveState(withGetter), /state\.motor\.hands\[0\]\.heading is computed/);
    const withNode = good(); withNode.senses.frames.get("left").push({ node: new TransformNode("held", stage.scene) });
    assert.throws(() => saveState(withNode), /state\.senses\.frames\.get\(left\)\[0\]\.node is a TransformNode/);
    const byObject = good(); byObject.senses.owners = new Map([[{ body: 1 }, 2]]);
    assert.throws(() => saveState(byObject), /state\.senses\.owners is keyed by an object/);
    const ofObjects = good(); ofObjects.senses.seen = new Set([{ body: 1 }]);
    assert.throws(() => saveState(ofObjects), /state\.senses\.seen holds an object/);
    const withSymbol = good(); withSymbol.motor.mark = Symbol("mark");
    assert.throws(() => saveState(withSymbol), /state\.motor\.mark is a symbol/);
  } finally { stage.dispose(); }
});

test("a_saved_state_crosses_a_thread", () => {
  const state = everyKind(), original = everyKind(), before = objectsOf(state);
  // What a thread boundary does to a message: a structured clone, which keeps maps, sets, typed
  // arrays and sharing, and would strip a vector of its class.
  const crossed = structuredClone(saveState(state));
  scramble(state);
  loadState(state, crossed);
  assert.deepEqual(state, original);
  assert.ok(state.at instanceof Vector3 && state.turn instanceof Quaternion && state.feet[1].at instanceof Vector3);
  assert.equal(state.at, before.get("state.at"));
  // Sharing crosses too.
  const x = { n: 1 }, shared = { a: x, b: x };
  const sent = structuredClone(saveState(shared));
  shared.b = { n: 2 };
  loadState(shared, sent);
  assert.equal(shared.a, shared.b);
});
