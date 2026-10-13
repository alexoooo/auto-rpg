import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { effectorFeedback } from "../src/core/control/effector-feedback.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { saveState, loadState } from "../src/core/state.ts";
import { coreStand } from "./harness/core-stand.mjs";
import { lone } from "./fixtures/lone.mjs";

const point = sourced([0, 0, 0], "m", "de-leva-1996", "the contact fixture's physical endpoint");
function endpoint(held = null) {
  const spec = lone("endpoint", "hand", 1, { held, stiffness: null });
  return { ...spec, segments: spec.segments.map(segment => ({ ...segment, points: { touch: point } })) };
}
const points = { hand: { point: "touch" } };
const external = (target, impulse, key) => ({ target, impulse, point: [1, 2, 3], normal: [0, 1, 0], ...(key ? { key } : {}) });

test("external episodes survive unloaded intervals and a restored body state, and only separation permits another onset", async () => {
  const stand = await coreStand(endpoint(), { gravity: false, ground: false });
  const target = { kind: "body", body: "foe", segment: "forearm", guard: true };
  let contacts = [external(target, 0)];
  const sampler = effectorFeedback(stand.built, ["hand"], undefined, () => contacts, points);
  const sample = step => { sampler.read(step); return structuredClone(sampler.state.hand.pairs); };
  try {
    const first = sample(1), key = first[0].key;
    const pair = (impulse, loaded, onset) => ({ key, target, point: [1, 2, 3], normal: [0, 1, 0], impulse, loaded, onset });
    assert.deepEqual(first, [pair(0, false, false)]);
    contacts = [external(target, 2), external(target, 3)];
    assert.deepEqual(sample(2), [pair(5, true, true)], "two manifolds have one first load");
    assert.deepEqual(sample(2), [pair(5, true, true)], "a completed interval is sampled only once");
    const saved = saveState(sampler.state);
    contacts = [external(target, 0)];
    assert.deepEqual(sample(3), [pair(0, false, false)]);
    contacts = [external(target, 4)];
    assert.deepEqual(sample(4), [pair(4, true, false)]);
    contacts = [];
    assert.deepEqual(sample(5), []);
    contacts = [external(target, 4)];
    assert.deepEqual(sample(6), [pair(4, true, true)]);
    loadState(sampler.state, saved);
    assert.deepEqual(sample(3), [pair(4, true, false)], "restoration preserves the loaded episode");
    assert.equal(sampler.state.hand.completedStep, 3);
  } finally { stand.dispose(); }
});

test("fixed surfaces have distinct detached identities even when they are unloaded", async () => {
  const stand = await coreStand(endpoint(), { gravity: false, ground: false });
  const contacts = [external({ kind: "world", id: "floor" }, 0), external({ kind: "world" }, 2, "wall")];
  const sampler = effectorFeedback(stand.built, ["hand"], undefined, () => contacts, points);
  try {
    sampler.read(1);
    const pairs = sampler.state.hand.pairs;
    assert.equal(pairs.length, 2);
    assert.notEqual(pairs[0].key, pairs[1].key);
    assert.deepEqual(pairs.map(({ target, loaded, onset }) => ({ target, loaded, onset })), [
      { target: { kind: "world", id: "floor" }, loaded: false, onset: false },
      { target: { kind: "world" }, loaded: true, onset: true },
    ]);
    contacts.push(external({ kind: "world" }, 1));
    assert.throws(() => sampler.read(2), /stable key/);
  } finally { stand.dispose(); }
});

test("a real held item's contact belongs to its hand and an unlabelled dynamic body keeps a detached identity", async () => {
  const stand = await coreStand(endpoint(.3), { gravity: false, ground: false });
  const target = buildBody(lone("target", "trunk", 1, { stiffness: null }), stand.world, { position: [.39, 0, 0] });
  const other = target.segments.get("trunk").body;
  other.setFixed(true);
  const labelled = effectorFeedback(stand.built, ["hand"], body => body === other
    ? { kind: "body", body: "foe", segment: "trunk", guard: false } : null, undefined, points);
  const unlabelled = effectorFeedback(stand.built, ["hand"], undefined, undefined, points);
  try {
    stand.step(); labelled.read(stand.world.steps);
    assert.equal(labelled.state.hand.pairs.length, 1, "an initially unloaded physical touch is present");
    assert.equal(labelled.state.hand.pairs[0].loaded, false);
    assert.equal(labelled.state.hand.pairs[0].onset, false);
    stand.built.segments.get("hand").body.applyImpulse(new Vector3(1, 0, 0), new Vector3(.3, 0, 0));
    stand.step(); labelled.read(stand.world.steps); unlabelled.read(stand.world.steps);
    const contacts = stand.world.physics.contactsOf(stand.built.segments.get("hand").body);
    assert.ok(contacts.some(contact => contact.pairs.some(pair => pair.mine === 1)), `the held shape meets the target: ${JSON.stringify(contacts.map(contact => ({ impulse: contact.impulse, pairs: contact.pairs })))}`);
    assert.ok(contacts.every(contact => contact.pairs.every(pair => pair.mine !== 0)), "the bare hand is clear");
    assert.equal(labelled.state.hand.pairs.length, 1);
    assert.deepEqual(labelled.state.hand.pairs[0].target, { kind: "body", body: "foe", segment: "trunk", guard: false });
    assert.equal(labelled.state.hand.pairs[0].onset, true);
    assert.deepEqual(unlabelled.state.hand.pairs[0].target, { kind: "object", id: `physics-body:${other.id}` });
  } finally { target.dispose(); stand.dispose(); }
});

test("the real floor's stable fixed identity is sampled before after-step callbacks", async () => {
  const stand = await coreStand(endpoint(), { position: [0, .05, 0] });
  const sampler = effectorFeedback(stand.built, ["hand"], undefined, undefined, points);
  const seen = [];
  stand.world.afterStep(() => seen.push(...sampler.state.hand.pairs.map(pair => structuredClone(pair))));
  stand.world.afterPhysics(() => sampler.read(stand.world.steps));
  try {
    stand.step(10);
    assert.ok(seen.some(pair => pair.onset));
    assert.ok(seen.every(pair => pair.target.kind === "world" && pair.target.id === `fixed:${stand.floor.id}`));
    assert.equal(new Set(seen.map(pair => pair.key)).size, 1);
    assert.equal(seen.filter(pair => pair.onset).length, 1);
  } finally { stand.dispose(); }
});
