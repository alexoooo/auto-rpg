import test from "node:test";
import assert from "node:assert/strict";
import { modelSpec, modelHolding } from "../src/core/bodies/models.ts";
import { bodyIntersections } from "../src/core/bodies/spec/clearance.ts";
import { jointKinematics } from "../src/core/bodies/build/joint-kinematics.ts";
import { buildBody } from "../src/core/bodies/build/build-body.ts";
import { createWorld } from "../src/core/world/world.ts";
import { createSenses } from "../src/core/world/senses.ts";
import { saveState, loadState } from "../src/core/state.ts";
import { Vector3, Quaternion } from "../src/core/math/vector.ts";
import { freshEngine, coreStand } from "./harness/core-stand.mjs";
import { embody } from "../src/minds/seat/embodiment.ts";
import { commandedMind } from "../src/minds/sub-mind.ts";
import { driveBy } from "../src/minds/decider.ts";
import { stockMotor } from "../src/app/registration/stock-motor.ts";
import { SERVO_SECONDS } from "../src/control/body.ts";
import { fitsPaws } from "../src/control/quadruped/fit.ts";
import { VISIBILITY_NAVIGATION } from "../src/skills/locomotion/navigation/visibility-navigation.ts";
import { bodyClearance } from "../src/skills/locomotion/navigation/sensed-bounds.ts";
import { clearStep } from "../src/skills/locomotion/navigation/clear-step.ts";
import { fallenSolids } from "../src/skills/locomotion/navigation/crowd.ts";
import { walkTerms } from "../src/minds/option/places.ts";
import { walker } from "../src/minds/option/walk.ts";
import { locomotion } from "../src/skills/locomotion/locomotion.ts";
import { orderedIntent } from "../src/minds/ordered.ts";
import { facesTravel } from "../src/skills/framework/intent.ts";

test("physics refuses different gravity and rate before changing the destination", async () => {
  const engine = await freshEngine();
  const make = (hz, gravity) => {
    const world = engine.createPhysics({ hz, gravity });
    world.addBody({ name: "box", position: new Vector3(0, 2, 0), rotation: Quaternion.Identity() },
      [{ kind: "box", centre: [0, 0, 0], size: [1, 1, 1] }],
      { mass: 1, centre: [0, 0, 0], moments: [1, 1, 1], orientation: Quaternion.Identity() });
    return world;
  };
  const source = make(120, true), destinations = [make(120, false), make(60, true)];
  try {
    const saved = source.save();
    for (const destination of destinations) {
      const before = destination.save();
      assert.throws(() => destination.load(saved), /different physics configuration/);
      assert.deepEqual(destination.save(), before);
    }
  } finally { source.dispose(); for (const world of destinations) world.dispose(); }
});

const q = value => ({ value });
const hull = (centre, turn = Quaternion.Identity()) => ({ kind: "hull", points: [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => {
  const point = new Vector3(x, .3 * y, .4 * z).applyRotationQuaternionToRef(turn, new Vector3()).addInPlace(new Vector3(...centre));
  return q([point.x, point.y, point.z]);
}))) });

test("convex clearance separates rounded corners and edge-cross-edge hulls", () => {
  const cube = { kind: "hull", points: [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => q([x, y, z])))) };
  const spec = (a, b) => ({ joints: [], segments: [{ name: "a", shape: a }, { name: "b", shape: b }] });
  assert.deepEqual(bodyIntersections(spec(cube, { kind: "sphere", centre: q([1.8, 1.8, 0]), radius: q(1) })), []);
  assert.deepEqual(bodyIntersections(spec(cube, { kind: "sphere", centre: q([1.6, 1.6, 0]), radius: q(1) })), ["a intersects b"]);
  const capsule = radius => ({ kind: "capsule", from: q([1.8, 1.8, -2]), to: q([1.8, 1.8, 2]), radius: q(radius) });
  assert.deepEqual(bodyIntersections(spec(cube, capsule(1))), []);
  assert.deepEqual(bodyIntersections(spec(cube, capsule(1.2))), ["a intersects b"]);
  const centre = [-.021448899991810322, -.9001908836886287, -.4753047737292945];
  const turn = new Quaternion(.5892599642047703, -.2511914421872364, .6865959021783768, -.34389187409584154);
  assert.deepEqual(bodyIntersections(spec(hull([0, 0, 0]), hull(centre, turn))), []);
  assert.deepEqual(bodyIntersections(spec(hull([0, 0, 0]), hull([0, 0, 0], turn))), ["a intersects b"]);
});

test("two-freedom joints refuse nonorthogonal axes", () => {
  const original = modelSpec("man").joints.find(joint => joint.dofs.length === 2);
  assert.ok(original, "the fixture needs a joint with exactly two freedoms");
  const changed = { ...original, dofs: original.dofs.map((dof, i) => ({ ...dof, axis: { ...dof.axis, value: i === 0 ? [1, 0, 0] : [1, 1, 0] } })) };
  assert.throws(() => jointKinematics(changed), /not square/);
  assert.equal(jointKinematics(original).dofs.length, 2);
});

test("completed equipment and canonical up cannot contaminate shared constants", () => {
  const loadout = { left: "empty", right: "sword" }, spec = modelHolding("man", loadout);
  assert.ok(Object.isFrozen(spec) && Object.isFrozen(spec.held) && Object.isFrozen(spec.held[0].item));
  assert.throws(() => { spec.held[0].item.name = "changed"; }, TypeError);
  assert.equal(modelHolding("man", loadout), spec);
  assert.throws(() => Vector3.UpReadOnly.set(1, 0, 0), TypeError);
  assert.deepEqual([Vector3.UpReadOnly.x, Vector3.UpReadOnly.y, Vector3.UpReadOnly.z], [0, 1, 0]);
});

test("failed body construction removes every completed segment", async () => {
  const world = createWorld(await freshEngine());
  const add = world.physics.addBody.bind(world.physics), remove = world.physics.removeBody.bind(world.physics);
  let made = 0, removed = 0;
  const failure = new Error("second segment failed");
  world.physics.addBody = (...args) => { if (made === 1) throw failure; const body = add(...args); made++; return body; };
  world.physics.removeBody = body => { removed++; remove(body); };
  try {
    assert.throws(() => buildBody(modelSpec("man"), world, { position: [0, 0, 0] }), error => error === failure);
    assert.deepEqual({ made, removed }, { made: 1, removed: 1 });
  } finally { world.dispose(); }
});

test("senses admit opaque prototype names and restore their complete frames", async () => {
  const stand = await coreStand(modelSpec("man")), hub = createSenses(stand.world);
  try {
    const readers = ["constructor", "__proto__"].map(id => hub.add({ id, side: id, built: stand.built, out: () => false }));
    assert.deepEqual(readers.map(read => read().others.map(other => other.id)), [["__proto__"], ["constructor"]]);
    const saved = saveState(hub.state);
    stand.step();
    loadState(hub.state, saved); hub.show();
    assert.deepEqual(saveState(hub.state), saved);
    hub.remove("constructor");
    assert.deepEqual(readers[1]().others, []);
  } finally { hub.dispose(); stand.dispose(); }
});

test("paw admission consumes its declared support point and patch", () => {
  const stock = modelSpec("reptile");
  const spec = structuredClone(stock), paw = spec.ends.find(end => end.kind === "paw");
  assert.ok(paw, "the fixture needs a declared paw");
  paw.point = "missing";
  assert.match(fitsPaws(spec), /unknown support endpoint/);
  const segment = spec.segments.find(segment => segment.name === paw.segment);
  segment.points.contact = segment.points.sole; delete segment.points.sole; paw.point = "contact";
  assert.equal(fitsPaws(spec), null);
  paw.sole = true; segment.shape = { kind: "sphere", centre: q([0, 0, 0]), radius: q(.1) };
  assert.match(fitsPaws(spec), /rectangular support sole needs a box/);
});

test("command layers deliver changed tracking, bracing and moving-frame goals", async () => {
  const stand = await coreStand(modelSpec("man")), received = [], stock = stockMotor();
  const motor = { ...stock, make(...args) {
    const made = stock.make(...args), reach = made.reach.bind(made);
    return { ...made, reach(segment, goal) { received.push(structuredClone(goal)); reach(segment, goal); } };
  } };
  const embodied = embody(stand.built, stand.world, own => commandedMind(own, { servoSeconds: SERVO_SECONDS, motor }, stand.world));
  try {
    const body = embodied.construction.body, segment = "hand.right", [point, at] = Object.entries(body.view.effectors[segment].points)[0];
    let goal = { places: [{ point, position: [at.x, at.y, at.z] }], seconds: .2 };
    const changes = [{}, { response: .1 }, { firm: true }, { unbend: true }, { origin: [.01, 0, 0] }, { drift: [.1, 0, 0] }];
    let index = 0;
    const goals = changes.map(change => Object.assign(goal = { ...goal }, change));
    body.drive(() => ({ posture: {}, pushes: [], stance: null, effectors: { [segment]: goals[Math.min(index++, goals.length - 1)] } }));
    stand.step(goals.length + body.delay);
    assert.deepEqual(received, goals);
  } finally { embodied.dispose(); stand.dispose(); }
});

test("pacing detects changed orders from a provider reusing its object", () => {
  let driver, decisions = 0;
  const view = { time: 0, resumed: false }, orders = { face: null, pace: 1 };
  const body = { view, drive(value) { driver = value; } };
  const skills = { state: {}, report: { ledger: [] }, legs: {}, navigation: {}, actions: {}, command() {}, release() {} };
  driveBy(body, { name: "counted", decide() { decisions++; return {}; } }, skills, { every: 10, phase: 0, orders: () => orders });
  driver.decide(view, 1 / 120);
  view.time = 1 / 120; orders.pace = 0;
  driver.decide(view, 1 / 120);
  assert.equal(decisions, 2);
});

test("walk pricing refuses zero pace and bounds tiny-pace pressure sampling", () => {
  let samples = 0;
  const spec = modelSpec("man"), gait = { name: "walk" };
  const pressure = { model: [], phase: "clear", struck: null, peak: 0, latency: 0 };
  const at = { where: { x: 0, z: 0, face: 0 }, apart: 1, range: 1, grace: 0,
    focus: { centre: new Vector3(1, 0, 0), velocity: new Vector3(), segments: new Map(), spec },
    orders: { pace: 0, face: null }, predictions: { pressure, danger: 0, turns: 0 }, sight: { legs: { envelope: null, limitsOf: () => null }, report: { legs: { heading: 0 } }, view: { stance: { centre: new Vector3() } } } };
  const spot = { x: 0, z: 1, face: 0 }, walk = walker(spec);
  assert.equal(walkTerms(at, spot, gait, walk), null);
  at.orders.pace = 1e-12;
  Object.defineProperty(at.focus, "centre", { get() { samples++; return new Vector3(1, 0, 0); } });
  const terms = walkTerms(at, spot, gait, walk);
  assert.ok(terms && Number.isFinite(terms.duration));
  assert.ok(samples < 100, `a walk at a tiny pace sampled the focus ${samples} times`);
});

test("fallen footprints retain observed elevation through navigation memory", () => {
  const spec = modelSpec("man"), segment = spec.segments[0];
  const other = { id: "fallen", down: true, out: false, spec, centre: new Vector3(0, 2.2, 0),
    segments: new Map([[segment.name, { centre: new Vector3(0, 2.2, 0), position: new Vector3(0, 2.2, 0), rotation: Quaternion.Identity() }]]) };
  const solids = fallenSolids({ others: [other] }, null, new Map());
  assert.equal(solids.length, 1);
  assert.ok(solids[0].centre[1] - solids[0].size[1] / 2 > 1, "the observed elevated body must stay above the lower floor");
});


test("a changed destination retains a planned route while locomotion is unavailable", () => {
  const navigation = VISIBILITY_NAVIGATION.make(modelSpec("man"), VISIBILITY_NAVIGATION.defaults),
    solids = [{ name: "wall", kind: "box", centre: [0, 1, 3], size: [2, 2, 2] }],
    sight = { view: { time: 0, stance: { centre: { x: 0, y: 1, z: 0 }, velocity: { x: 0, y: 0, z: 0 } },
      senses: { side: "party", others: [], solids } }, report: { legs: { heading: 0 } } },
    gait = { envelope: null, stopping: 1, lag: 0 },
    request = x => ({ kind: "place", points: [{ x, z: 6 }], near: .1 });
  navigation.step(sight, request(0), gait, 1, 1 / 120);
  assert.ok(navigation.report.route.length > 1, "fixture must route around the wall");
  sight.view.time += 1 / 120;
  assert.deepEqual(navigation.step(sight, request(1), gait, 1, 1 / 120, false), { move: null, face: null });
  assert.equal(navigation.report.status, "unavailable");
  const route = navigation.report.route;
  assert.ok(route.length > 1, "unavailability must not erase the new geometric plan");
  assert.deepEqual(route.at(-1), { x: 1, z: 6 });
  let from = [0, 1, 0];
  for (const point of route) {
    const to = [point.x, 1, point.z];
    assert.ok(clearStep(from, to, bodyClearance(modelSpec("man")), solids), "published legs must clear the wall");
    from = to;
  }
});


test("walking preserves requested world velocity while facing turns", () => {
  const legs = locomotion({ "foot.left": "left", "foot.right": "right" }, null, {
    turnLimit: 1, segments: { left: "foot.left", right: "foot.right" },
  });
  const dt = 1 / 120;
  const view = { time: 1, born: 0, standing: 1, root: { rotation: Quaternion.Identity() },
    stance: { phase: "stand", centre: new Vector3(0, 1, 0), support: new Vector3(),
      place: new Vector3(), plan: new Vector3(0, 1, 0), velocity: new Vector3() } };
  legs.resume(view);
  const result = legs.goal(view, { walk: [1, 0], face: Math.PI / 2, height: 1 }, dt, { idleSettle: false });
  assert.ok(legs.heading > 0, "fixture must turn its facing during a moving step");
  assert.deepEqual(result, { kind: "stance", goal: { feet: ["foot.left", "foot.right"], centre: null,
    height: 1, heading: dt, walk: [0, 1] } });
});

test("ordered facing keeps route facing on a long trip and takes over before stopping", () => {
  const sight = { report: { legs: { heading: 0 } } }, face = { x: 0, z: 1 };
  for (const move of [{ kind: "place", points: [{ x: 0, z: -10 }], near: .04 },
    { kind: "range", focus: "foe", near: 1, far: 2 }]) {
    const intent = orderedIntent(sight, { move, face }, {});
    assert.equal(intent.face, 0);
    assert.equal(facesTravel(intent.travelFacing, 10), true, "a long trip must still face forward so the run can run");
    assert.equal(facesTravel(intent.travelFacing, .354), false, "the observed short backing correction must keep facing its target");
    assert.equal(facesTravel(intent.travelFacing, 0), false, "arrival must retain the ordered facing");
    const unasked = orderedIntent(sight, { move, face: null }, {});
    assert.equal(facesTravel(unasked.travelFacing, .354), true, "with no facing ordered, short travel still faces its route");
  }
  const direct = orderedIntent(sight, { move: { kind: "direct", direction: { x: 0, z: -1 } }, face }, {});
  assert.equal(facesTravel(direct.travelFacing), false, "an explicit facing on a direction walk remains explicit");
});
