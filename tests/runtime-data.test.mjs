import assert from "node:assert/strict";
import test from "node:test";
import { deepFreeze, loadState, saveState } from "../src/core/world/state.ts";
import { Vector3 } from "../src/core/math/vector.ts";
import { encodeExact, decodeExact } from "../src/app/apart/codec.ts";
import { openWorld } from "../src/app/browser/worker/client.ts";
import { readView } from "../src/core/bodies/build/read-view.ts";
import { rulebook } from "../src/combat/rulebook.ts";
import { sourced } from "../src/core/bodies/spec/quantity.ts";
import { Worker } from "node:worker_threads";
import { replyBox } from "../src/app/apart/box.ts";
import { waitPast } from "../src/app/apart/wire.ts";
import { browserMindWorkers } from "../src/app/browser/worker/minds.ts";

test("browser mind pools wait for every worker to initialize before the world can block", async () => {
  const original = globalThis.Worker, workers = [];
  class WorkerStub {
    listeners = new Map();
    sent = [];
    stopped = 0;
    constructor() { workers.push(this); }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    removeEventListener(type, listener) { if (this.listeners.get(type) === listener) this.listeners.delete(type); }
    postMessage(message) { this.sent.push(message); }
    terminate() { this.stopped++; }
    emit(type, event) { this.listeners.get(type)?.(event); }
  }
  globalThis.Worker = WorkerStub;
  try {
    let ready = false;
    const opening = Promise.resolve(browserMindWorkers(2)).then(pool => { ready = true; return pool; });
    await Promise.resolve();
    assert.equal(ready, false, "world construction must yield while its nested workers start");
    workers[0].emit("message", { data: { kind: "ready" } });
    await Promise.resolve();
    assert.equal(ready, false, "the pool needs both workers");
    workers[1].emit("message", { data: { kind: "ready" } });
    const pool = await opening;
    assert.equal(ready, true);
    pool.dispose();
    assert.deepEqual(workers.map(worker => ({ start: worker.sent[0].kind, stopped: worker.stopped, listeners: worker.listeners.size })),
      [{ start: "start", stopped: 1, listeners: 0 }, { start: "start", stopped: 1, listeners: 0 }]);

    const failed = browserMindWorkers(2);
    workers[2].emit("error", { message: "mind module failed" });
    await assert.rejects(failed, /mind module failed/);
    assert.deepEqual(workers.slice(2).map(worker => worker.stopped), [1, 1]);
  } finally { globalThis.Worker = original; }
});

test("saved user discriminators and prototype keys retain whole records and sharing", () => {
  const item = JSON.parse('{"~":"vector","at":[1,2,3],"label":"keep","__proto__":{"keep":true}}');
  item.self = item;
  const live = { item, alias: item, vector: new Vector3(1, 2, 3) };
  const saved = structuredClone(saveState(live));
  const fork = { item: {}, alias: {}, vector: new Vector3() };
  loadState(fork, saved);
  assert.deepEqual(fork.item, item);
  assert.equal(fork.item, fork.alias);
  assert.equal(fork.item.self, fork.item);
  assert.deepEqual(fork.vector, live.vector);
});

test("constants refuse containers whose mutation Object.freeze cannot prevent", () => {
  for (const value of [new Map([["a", { count: 1 }]]), new Set(["a"])]) {
    assert.throws(() => deepFreeze({ value }), /mutable containers/);
  }
});

test("saving sparse arrays preserves absent indices and clears stale live elements", () => {
  const source = { values: [1, , 3] }, target = { values: [0, 2, 0, 4] };
  loadState(target, structuredClone(saveState(source)));
  assert.deepEqual(target, source);
  assert.equal(Object.hasOwn(target.values, 1), false);
});

test("worker text preserves user tags and own prototype keys alongside exact numbers", () => {
  const value = JSON.parse('{"__proto__":{"keep":true},"tags":[{"$n":"NaN"},{"$u":1},{"$f":{"offset":0,"length":2}},{"$o":[]}]}');
  value.numbers = [NaN, Infinity, -Infinity, -0, undefined];
  value.sparse = [1, , undefined, , 3];
  value.tags.push({ $a: { length: 0, entries: [] } });
  const text = encodeExact(value, () => { throw new Error("this record contains no shared numbers"); });
  assert.deepEqual(decodeExact(text, () => { throw new Error("a user tag is not shared numbers"); }), value);
});

test("waiting for worker completion drains a full reply ring", async () => {
  const box = replyBox(256), control = new Int32Array(new SharedArrayBuffer(4)), replies = [];
  const worker = new Worker(`const {workerData} = require('node:worker_threads');
    import(workerData.module).then(({replyBox}) => {
      const box = replyBox(workerData.box);
      box.put('a'.repeat(200)); box.put('b'.repeat(200));
      Atomics.store(workerData.control, 0, 2); Atomics.notify(workerData.control, 0);
    });`, { eval: true, workerData: { module: new URL("../src/app/apart/box.ts", import.meta.url).href, box: box.buffer, control } });
  try {
    const drain = () => { for (let text = box.take(); text !== null; text = box.take()) replies.push(text); };
    waitPast(control, 0, 1, { spin: 0, timeout: 2000, drain });
    drain();
    assert.deepEqual(replies, ["a".repeat(200), "b".repeat(200)]);
  } finally { await worker.terminate(); }
});

test("rulebook construction snapshots nested caller policy", () => {
  const life = { vital: sourced(2, "1", "owner-life", "fixture"), trunk: sourced(1, "1", "owner-life", "fixture"), limb: sourced(.5, "1", "owner-life", "fixture") };
  const rules = rulebook("arena", { life });
  life.trunk = { ...life.trunk, value: 7 };
  assert.equal(rules.life.trunk.value, 1);
  assert.ok(Object.isFrozen(rules.life));
  assert.ok(Object.isFrozen(rules.life.trunk));
});

test("read contacts preserve cached engine identities across repeated unfiltered reads", () => {
  const body = { id: 1, pose: { name: "fixture", position: new Vector3(), rotation: {} } };
  const contact = { other: body, impulse: 1, point: [0, 0, 0], normal: [0, 1, 0], pairs: [] };
  const built = {
    segments: new Map([["fixture", { body, pose: body.pose, spec: { name: "fixture" }, rigid: {}, rest: {}, frame: {} }]]),
    joints: new Map(), spec: {}, configurations: { model: {}, state: {} },
    physics: { contactsOf: () => [contact], contactManifoldsOf: () => [], gravity: [0, -9.8, 0] },
  };
  const view = readView(built), own = view.segments.get("fixture").body;
  assert.equal(view.physics.contactsOf(own)[0].other, own);
  assert.equal(view.physics.contactsOf(own)[0].other, own);
  assert.equal(contact.other, body);
});

test("a released joint gives its detached component an independent floating contact mass", async () => {
  const { coreStand } = await import("./harness/core-stand.mjs");
  const { modelSpec } = await import("../src/core/bodies/models.ts");
  const { contactMass } = await import("../src/core/bodies/build/contact-mass.ts");
  const stand = await coreStand(modelSpec("workshop-fighter"), { ground: false });
  try {
    const { built } = stand, segment = built.segments.get("hand.right");
    const mass = contactMass(built), point = [segment.pose.position.x, segment.pose.position.y, segment.pose.position.z];
    mass.update();
    const joined = mass.mobility(segment, point);
    const wrist = [...built.joints.values()].find((joint) => joint.child === segment);
    wrist.joint.release();
    assert.equal(wrist.attached(), false, "the physical joint must reach the severed case");
    mass.update();
    const isolated = contactMass({ ...built, segments: new Map([[segment.spec.name, segment]]), joints: new Map() });
    isolated.update();
    assert.deepEqual(mass.mobility(segment, point), isolated.mobility(segment, point));
    assert.notDeepEqual(joined, isolated.mobility(segment, point));
  } finally { stand.dispose(); }
});

test("a failed stage build releases the minds it creates before awaiting the engine", async () => {
  const { teamStage } = await import("../src/app/worker/stage.ts");
  const { CONTEXT } = await import("../src/app/node/context.ts");
  const side = { model: "workshop-fighter", count: 1, loadout: { left: "empty", right: "empty" } };
  let made = 0, disposed = 0;
  await assert.rejects(teamStage(CONTEXT, { left: side, right: side }, 0, {
    engine: "missing-engine", minds: () => { made++; return { dispose() { disposed++; } }; },
  }));
  assert.equal(made, 1, "the fixture must reach the owned minds before engine refusal");
  assert.equal(disposed, made);
});

test("configurable non-extremities take the same collision injury as their unchanged shape", async () => {
  const { modelSpec } = await import("../src/core/bodies/models.ts");
  const { freshEngine } = await import("./harness/core-stand.mjs");
  const { createWorld } = await import("../src/core/world/world.ts");
  const { buildBody } = await import("../src/core/bodies/build/build-body.ts");
  const { centreOfToRef } = await import("../src/core/bodies/read-motion.ts");
  const { createPool } = await import("../src/combat/pool.ts");
  const { watchBlows } = await import("../src/combat/blows.ts");
  const engine = await freshEngine(), base = modelSpec("workshop-fighter"), head = base.segments.find(segment => segment.name === "head");
  const rules = rulebook("arena");
  const collide = (configurable) => {
    const segment = { ...head, ...configurable ? { configurations: { initial: "normal", shapes: { normal: head.shape } } } : {} };
    const spec = { ...base, mass: head.mass, segments: [segment], joints: [], held: [], effectors: [], ends: [],
      wounds: { hp: base.wounds.hp, vital: ["head"], whole: [], limbs: [], bareExtremities: [] } };
    const world = createWorld(engine, { gravity: false }), fighters = [];
    let watch;
    try {
      for (const i of [0, 1]) {
        const built = buildBody(spec, world, { position: [0, 0, i * .4] });
        fighters.push({ id: String(i), side: String(i), built, pool: createPool(spec, rules) });
        const one = built.segments.get("head");
        one.body.applyImpulse(new Vector3(0, 0, (i ? -5 : 5) * one.rigid.mass), centreOfToRef(one, new Vector3()));
      }
      watch = watchBlows(world, fighters, rules);
      world.step(10);
      assert.ok(watch.blows.length, "the fixture must land a physical blow");
      return structuredClone(watch.blows);
    } finally { watch?.dispose(); for (const fighter of fighters) fighter.built.dispose(); world.dispose(); }
  };
  assert.deepEqual(collide(true), collide(false));
});

class WorkerStub {
  static latest;
  static postFailure = null;
  listeners = new Map();
  sent = [];
  terminated = false;
  constructor() { WorkerStub.latest = this; }
  postMessage(value) { if (WorkerStub.postFailure) throw WorkerStub.postFailure; this.sent.push(value); }
  addEventListener(kind, listener) {
    const list = this.listeners.get(kind) ?? [];
    list.push(listener); this.listeners.set(kind, list);
  }
  emit(kind, data) { for (const listener of this.listeners.get(kind) ?? []) listener(kind === "message" ? { data } : data); }
  terminate() { this.terminated = true; }
}

test("a synchronous worker post failure closes startup and every pending request", async () => {
  const before = globalThis.Worker, failure = new Error("fixture post failure");
  globalThis.Worker = WorkerStub;
  try {
    WorkerStub.postFailure = failure;
    await assert.rejects(openWorld({ kind: "duel", start: {} }, new AbortController().signal), error => error === failure);
    assert.equal(WorkerStub.latest.terminated, true);
    WorkerStub.postFailure = null;
    const opening = openWorld({ kind: "duel", start: {} }, new AbortController().signal), worker = WorkerStub.latest;
    worker.emit("message", { kind: "ready", hz: 120, roster: [], frame: new Float64Array(4) });
    const link = await opening;
    const pending = assert.rejects(link.step(1), error => error === failure);
    WorkerStub.postFailure = failure;
    await assert.rejects(link.tape(), error => error === failure);
    await pending;
    assert.equal(worker.terminated, true);
  } finally { WorkerStub.postFailure = null; globalThis.Worker = before; }
});

test("world requests settle their own replies and reject on every terminal path", async (context) => {
  const before = globalThis.Worker;
  globalThis.Worker = WorkerStub;
  try {
    const controller = new AbortController();
    const opening = openWorld({ kind: "duel", start: {} }, controller.signal);
    const worker = WorkerStub.latest;
    worker.emit("message", { kind: "ready", hz: 120, roster: [], frame: new Float64Array(4) });
    const link = await opening;
    const first = link.step(1); let secondDone = false;
    const second = link.step(120).then(() => { secondDone = true; });
    const requests = worker.sent.filter((message) => message.kind === "step");
    worker.emit("message", { kind: "stepped", request: requests[0].request });
    await first;
    assert.equal(secondDone, false);
    worker.emit("message", { kind: "stepped", request: requests[1].request });
    await second;
    const one = link.tape(), two = link.tape();
    const tapes = worker.sent.filter((message) => message.kind === "tape");
    worker.emit("message", { kind: "tape", request: tapes[1].request, tape: [{ step: 120 }] });
    worker.emit("message", { kind: "tape", request: tapes[0].request, tape: [{ step: 1 }] });
    assert.deepEqual(await Promise.all([one, two]), [[{ step: 1 }], [{ step: 120 }]]);
    link.dispose();
    for (const path of ["dispose", "abort", "fault"]) await context.test(path, async () => {
      const signal = new AbortController(), opening = openWorld({ kind: "duel", start: {} }, signal.signal);
      const worker = WorkerStub.latest;
      worker.emit("message", { kind: "ready", hz: 120, roster: [], frame: new Float64Array(4) });
      const link = await opening;
      const step = assert.rejects(link.step(2)), tape = assert.rejects(link.tape());
      if (path === "dispose") link.dispose();
      else if (path === "abort") signal.abort(new Error("fixture abort"));
      else worker.emit("message", { kind: "fault", message: "fixture fault" });
      await Promise.all([step, tape]);
      await assert.rejects(link.step(1));
      await assert.rejects(link.tape());
    });
  } finally { globalThis.Worker = before; }
});


test("external character settings return owner refusals for geometry and numeric limits", async () => {
  const { BODY_MODELS, HUMANOID_MODELS, resolveCharacter, resolveCharacterChecked } = await import("../src/core/bodies/models.ts");
  const model = "workshop-fighter";
  assert.deepEqual(resolveCharacterChecked({ model, attributes: { size: -1 } }), { refused: "Size must be greater than zero." });
  assert.deepEqual(resolveCharacterChecked({ model, attributes: { weight: 1.5 } }), {
    refused: "Invalid workshop-fighter geometry: middleTrunk intersects upperArm.left; middleTrunk intersects upperArm.right",
  });
  const capsule = resolveCharacterChecked({ model, attributes: { weight: 100 } });
  assert.deepEqual(Object.keys(capsule), ["refused"]);
  assert.match(capsule.refused, /^no capsule .+ m long holds .+ m3$/);
  for (const model of BODY_MODELS) {
    const mass = HUMANOID_MODELS.includes(model) ? "the mass times the size cubed and the weight" : "mass times size cubed and weight";
    assert.deepEqual(resolveCharacterChecked({ model, attributes: { size: 1e308 } }), { refused: mass + " is outside finite numeric representation" });
    assert.deepEqual(resolveCharacterChecked({ model, attributes: { size: 1e-308 } }), { refused: mass + " underflows a positive physical quantity" });
  }
  assert.deepEqual(resolveCharacterChecked({ model, attributes: { size: 1e100, weight: 1e-300 } }), {
    refused: "Invalid workshop-fighter geometry: upperTrunk: the points lie in a plane and bound no volume",
  });
  const supported = { model, attributes: { size: 1.05, weight: 1.01, strength: 1.2, speed: .9, haste: 50 } };
  assert.deepEqual(resolveCharacterChecked(supported), resolveCharacter(supported));
});


test("nested configured parts return whole role and value faults before graph traversal", async () => {
  const { GAME, MINDS } = await import("../src/app/catalog.ts");
  const tuned = legs => ({ ...MINDS.option.config, tuning: { parts: { legs } } });
  const move = legs => ({ kind: "move", gaits: [{ name: "braced", label: "Braced", legs }], rules: [], otherwise: "braced" });
  const cases = [
    ...[4, [], null].map(parts => [{ ...MINDS.option.config, tuning: { parts } }, ["tuning.parts: a record of service parts"]]),
    ...[4, [], null].map(tuning => [{ ...MINDS.option.config, tuning }, ["tuning: a record of research settings"]]),
    [tuned({ kind: "stance-walk" }), ["tuning.parts.legs: a gait part cannot go where a locomotion part goes"]],
    [tuned({ kind: "missing" }), ['tuning.parts.legs: no part of kind "missing"']],
    [tuned(move({ kind: "walk-run", tuning: { walk: { run: -1 } } })),
      ["tuning.parts.legs.gaits.0.legs: a walk and run's walk gives only the walk's settings, each finite, its run, turns and leg positive, timed to its haste to the power 0, 1/2 or 1"]],
    [tuned(move({ kind: "move" })), ["tuning.parts.legs.gaits.0.legs: a locomotion part cannot go where a gait part goes"]],
    [tuned(move({ kind: "missing" })), ['tuning.parts.legs.gaits.0.legs: no part of kind "missing"']],
    [tuned({ ...move({ kind: "stance-walk" }), rules: null }), ["tuning.parts.legs: rules: a list of move-rule parts"]],
    [tuned({ ...move({ kind: "stance-walk" }), gaits: null }), ["tuning.parts.legs: gaits: a list of named gait parts"]],
    [tuned({ ...move({ kind: "stance-walk" }), gaits: [null] }), ["tuning.parts.legs.gaits.0.legs: no part of kind undefined"]],
  ];
  for (const [config, faults] of cases) assert.deepEqual(GAME.treeFaults(config), faults);
  const configured = move({ kind: "walk-run", tuning: { walk: { run: 1 } } });
  assert.deepEqual(GAME.treeFaults(tuned(configured)), [], "the valid nested configuration reaches the same admission path");
  assert.deepEqual(GAME.withoutTuning(configured), move({ kind: "walk-run" }));
  assert.deepEqual(configured.gaits[0].legs.tuning, { walk: { run: 1 } }, "stripping owns its copy");
});
