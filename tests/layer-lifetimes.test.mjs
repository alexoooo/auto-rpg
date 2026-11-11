import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { replyBox } from "../src/app/apart/box.ts";
import { modelSpec } from "../src/core/bodies/models.ts";
import { mindThreads } from "../src/app/apart/host.ts";
import { runLanes } from "../src/evaluation/lanes.ts";
import { standingFoot, forearmChain, scaling, standingHuman } from "../src/app/browser/physics-bench/cases.ts";

test("reply boxes preserve FIFO beyond exact Number counters", () => {
  const box = replyBox(64), counters = new BigInt64Array(box.buffer, 0, 2);
  counters.fill(2n ** 53n + 1n);
  const messages = ["a", "b", "c", "d"];
  for (const message of messages) box.put(message);
  assert.deepEqual(messages.map(() => box.take()), messages);
  assert.equal(box.take(), null);
});

test("mind thread disposal stops every link when its first post throws", () => {
  const failure = new Error("stop post failed"), stopped = [];
  const links = [0, 1].map(index => ({
    post() { if (index === 0) throw failure; }, stop() { stopped.push(index); },
  }));
  const minds = mindThreads(links);
  assert.throws(() => minds.dispose(), error => error === failure);
  assert.deepEqual(stopped, [0, 1]);
  minds.dispose();
  assert.deepEqual(stopped, [0, 1]);
});

test("a fatal lane answer closes pending siblings before rejection", async () => {
  const failure = new Error("answer failed"), stopped = [], answers = [];
  let made = 0;
  await assert.rejects(runLanes([0, 1], { lanes: 2, minutes: 1,
    spawn(listen) {
      const id = made++;
      return { post(job) { if (id === 0) queueMicrotask(() => listen.answer(job)); }, terminate() { stopped.push(id); } };
    },
    onAnswer(job) { answers.push(job); throw failure; },
    onLost() { assert.fail("a cancelled sibling is not a lost trial"); },
  }), error => error === failure);
  assert.deepEqual(answers, [0]);
  assert.deepEqual(stopped.sort(), [0, 1]);
});

test("a lane retains loss reported during spawn and clears synchronous post failures", async () => {
  const lost = [], stopped = [];
  await runLanes([0], { lanes: 1, minutes: 1,
    spawn(listen) { listen.lost("startup failed"); return { post() { assert.fail("a lost worker receives no job"); }, terminate() { stopped.push(0); } }; },
    onAnswer() { assert.fail("lost startup has no answer"); }, onLost(job, reason) { lost.push({ job, reason }); },
  });
  assert.deepEqual(lost, [{ job: 0, reason: "startup failed" }]);
  assert.deepEqual(stopped, [0]);
  const failure = new Error("post failed");
  await assert.rejects(runLanes([0], { lanes: 1, minutes: 1,
    spawn() { return { post() { throw failure; }, terminate() { stopped.push(1); } }; },
    onAnswer() { assert.fail(); }, onLost() { assert.fail(); },
  }), error => error === failure);
  assert.deepEqual(stopped, [0, 1]);
});

test("every browser physics benchmark disposes after its first prepare fails", () => {
  const failure = new Error("prepare failed"), acquired = [], disposed = [];
  const make = scene => {
    const id = acquired.length; acquired.push(id);
    return { segments: scene.models.reduce((sum, model) => sum + model.segments.length, 0),
      prepare() { throw failure; }, dispose() { disposed.push(id); } };
  };
  const settings = { hz: 120 };
  for (const run of [() => standingFoot(make, settings), () => forearmChain(make, settings),
    () => scaling(make, settings, "standing", 1), () => standingHuman(make, settings)]) {
    assert.throws(run, error => error === failure);
  }
  assert.deepEqual(acquired, [0, 1, 2, 3]);
  assert.deepEqual(disposed, acquired);
});


test("late Arena callbacks and local Dungeon warming release every hosted mind", async () => {
  await import("./harness/preload-data.mjs");
  const [{ CONTEXT }, { freshEngine }, { createWorld }, { Duel }, { TeamBout }, { createDungeonRun }] = await Promise.all([
    import("../src/app/node/context.ts"), import("./harness/core-stand.mjs"), import("../src/core/world/world.ts"),
    import("../src/game/arena/duel.ts"), import("../src/game/arena/team-bout.ts"), import("../src/game/dungeon/run.ts"),
  ]);
  let made = 0, disposed = 0;
  const catalog = { ...CONTEXT.catalog, controllerOf(config) {
    const controller = CONTEXT.catalog.controllerOf(config);
    return { ...controller, create(host, config) {
      return controller.create({ ...host, take(make) {
        return host.take(own => {
          const mind = make(own); made++;
          return { ...mind, dispose() { disposed++; mind.dispose(); } };
        });
      } }, config);
    } };
  } };
  const context = { ...CONTEXT, catalog }, engine = await freshEngine(), failure = new Error("late built callback");
  const side = { model: "workshop-fighter", count: 1, loadout: { left: "empty", right: "empty" } };
  for (const build of [world => new Duel(world, { left: "workshop-fighter", right: "workshop-fighter" }, context, { onBuilt() { throw failure; } }),
    world => new TeamBout(world, { left: side, right: side }, context, { onBuilt() { throw failure; } })]) {
    const world = createWorld(engine), before = made;
    try { assert.throws(() => build(world), error => error === failure); }
    finally { world.dispose(); }
    assert.equal(made - before, 2, "the callback must follow both hosted minds");
    assert.equal(disposed, made);
  }
  const size = 30, layout = { seed: 1, size, floor: new Uint8Array(size * size).fill(1), rooms: [], doors: [],
    start: { x: 3, z: 3 }, exit: { x: 25, z: 25 }, spawns: [{ x: 25, z: 25 }] };
  const before = made, run = createDungeonRun({ engine, seed: 1, layout }, context);
  assert.equal("refused" in run, false, "the distant enemy fixture must be admitted");
  try { assert.equal(run.enemies[0].fighter, null, "the enemy must reach only warming"); }
  finally { run.dispose(); }
  assert.equal(made - before, 2, "one hero and one temporary warm mind are built");
  assert.equal(disposed, made);
});


test("a worker startup frame failure reports its error and disposes the completed stage", async () => {
  let disposed = 0, listener;
  const posts = [], failure = new Error("initial frame failed");
  globalThis.__lifetimeStage = { frame() { throw failure; }, dispose() { disposed++; } };
  const hook = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL?.endsWith("/src/app/browser/worker/serve.ts?lifetime-regression") &&
      ["../../worker/stage.ts", "../../worker/duel-stage.ts", "../../worker/crypt-stage.ts", "./minds.ts", "../context.ts"].includes(specifier)) {
      return { shortCircuit: true, url: "data:text/javascript," + encodeURIComponent(
        "export const teamStage=async()=>globalThis.__lifetimeStage,duelStage=teamStage,cryptStage=teamStage,pageMinds=()=>{},CONTEXT={};") };
    }
    return next(specifier, context);
  } });
  try {
    const { serve } = await import("../src/app/browser/worker/serve.ts?lifetime-regression");
    serve({ addEventListener(_kind, receive) { listener = receive; }, postMessage(message) { posts.push(message); } }, () => {});
    listener({ data: { kind: "duel", start: {} } });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(posts, [{ kind: "fault", message: failure.message }]);
    assert.equal(disposed, 1);
  } finally { hook.deregister(); delete globalThis.__lifetimeStage; }
});

test("mind threads resend values changed inside a stable gait object", async () => {
  let stopping = 1;
  const gait = { envelope: null, get stopping() { return stopping; }, lag: 0 };
  globalThis.__lifetimeSeatHost = { handle() {}, says: () => ({ has: "fixture", report: { gaits: [gait], kit: null } }) };
  const hook = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL?.endsWith("/src/app/apart/thread.ts?lifetime-regression") && specifier === "../../minds/seat/apart.ts") {
      return { shortCircuit: true, url: "data:text/javascript," + encodeURIComponent(
        "export const seatHost=()=>globalThis.__lifetimeSeatHost;") };
    }
    return next(specifier, context);
  } });
  try {
    const { mindThread } = await import("../src/app/apart/thread.ts?lifetime-regression");
    const sent = [], thread = mindThread(length => new Float64Array(length), { say(reply) { sent.push(reply); }, answered() {} });
    const made = thread.handle({ seq: 1, specs: [[0, modelSpec("workshop-fighter")]], asks: [{ seat: 0, ask: { kind: "make", recipe: { statics: { spec: 0 } } }, inbound: new Float64Array(), outbound: new Float64Array() }] });
    assert.deepEqual(made.said[0].gaits, [{ envelope: null, stopping: 1, lag: 0 }]);
    stopping = 9;
    thread.handle({ seq: 2, asks: [{ seat: 0, ask: { kind: "step" } }] });
    assert.deepEqual(sent[0].said[0].gaits, [{ envelope: null, stopping: 9, lag: 0 }]);
    assert.deepEqual(made.said[0].gaits, [{ envelope: null, stopping: 1, lag: 0 }]);
  } finally { hook.deregister(); delete globalThis.__lifetimeSeatHost; }
});


test("frame measurement retains worker cost and excludes interpolation-only batches", async () => {
  const previous = { document: globalThis.document, window: globalThis.window };
  const element = () => ({ style: {}, dataset: {}, setAttribute() {}, append() {}, addEventListener() {}, remove() {} });
  globalThis.document = { createElement: element, addEventListener() {} };
  globalThis.window = { addEventListener() {} };
  const hook = registerHooks({ resolve(specifier, context, next) {
    if (specifier.endsWith("frame-meter.css")) return { shortCircuit: true, url: "data:text/javascript,export default {};" };
    return next(specifier, context);
  } });
  try {
    const { frameMeter } = await import("../src/app/browser/ui/frame-meter.ts?lifetime-regression");
    const { arenaMeasurement } = await import("../src/app/browser/arena/measure.ts");
    const meter = frameMeter({ getCaps: () => ({ timerQuery: false }) }, new AbortController().signal);
    const sample = meter.frame(() => meter.world({ steps: 2, ms: 8 }, 1));
    assert.equal(sample.steps, 2); assert.equal(sample.worker, 8); assert.equal(sample.physics, 0);
    let output;
    const measurement = arenaMeasurement({ append(value) { output = value; } });
    const complete = { ...sample, interval: 16, simulated: 2 / 120, time: 3, hz: 120, active: true };
    measurement.record({ ...complete, steps: 0 });
    for (let i = 0; i < 600; i++) measurement.record(complete);
    const result = JSON.parse(output.dataset.measurement);
    assert.equal(result.frames, 600); assert.equal(result.steps, 1200);
    assert.equal(result.meanStepMs, 4); assert.equal(result.batchStepP95Ms, 4);
    assert.ok(Object.values(result).every(Number.isFinite));
    measurement.dispose();
  } finally { hook.deregister(); globalThis.document = previous.document; globalThis.window = previous.window; }
});

test("the shape renderer draws an admitted capsule with coincident endpoints", async () => {
  const [{ NullEngine }, { Scene }, { Color3 }, { modelSpec }, { puppetBody }, { drawBody }] = await Promise.all([
    import("@babylonjs/core/Engines/nullEngine.js"), import("@babylonjs/core/scene.js"), import("@babylonjs/core/Maths/math.color.js"),
    import("../src/core/bodies/models.ts"), import("../src/app/browser/render/puppet.ts"), import("../src/app/browser/render/body-shapes.ts"),
  ]);
  const base = modelSpec("workshop-fighter"), head = base.segments.find(segment => segment.name === "head");
  assert.equal(head.shape.kind, "capsule", "the fixture needs a capsule to collapse");
  const spec = { ...base, segments: base.segments.map(segment => segment === head ? { ...head, shape: { ...head.shape, to: head.shape.from } } : segment) };
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const puppet = puppetBody(spec, scene), shapes = drawBody(puppet, scene, Color3.White());
    assert.ok(shapes.meshes.length >= spec.segments.length);
    const mesh = shapes.meshes.find(mesh => mesh.name.endsWith(".head.view"));
    assert.ok(mesh, "the collapsed head must be drawn");
    assert.ok(mesh.getVerticesData("position").every(Number.isFinite));
    shapes.dispose(); puppet.dispose();
  } finally { scene.dispose(); engine.dispose(); }
});
