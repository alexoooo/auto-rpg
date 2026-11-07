import { buildBout } from "../../src/app/node/evaluation.ts";
import { recipeOf } from "../../src/app/node/setup.ts";
import { reportNow } from "../../src/minds/apart.ts";
/** Command delivery, suspension and restoration, independent of skill capability. */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "../../src/core/math/vector.ts";
import { modelSpec } from "../../src/core/bodies/models.ts";
import { poseAngles } from "../../src/control/kinematics.ts";
import { GUARD } from "../../src/skills/guard/guard.ts";
import { createWorld } from "../../src/core/world/world.ts";
import { buildBody } from "../../src/core/bodies/build/build-body.ts";
import { embody } from "../../src/minds/embodiment.ts";
import { loadState, saveState } from "../../src/core/state.ts";
import { freshEngine, coreStand } from "../harness/core-stand.mjs";
import { SERVO_SECONDS } from "../../src/control/body.ts";
import { commandedMind } from "../../src/minds/sub-mind.ts";
import { driveBy } from "../../src/minds/decider.ts";
import { standingSkills } from "../../src/app/standing-skills.ts";
import { standIntent } from "../../src/skills/intent/intent.ts";
import { stockMotor } from "../../src/app/stance-balance.ts";
import { isOrdersEntry } from "../../src/game/arena/duel.ts";
import { MOVE_PART } from "../../src/skills/locomotion/move-part.ts";
import { PAW_MOVE } from "../../src/skills/locomotion/quadruped/paw-legs.ts";

/** The command's delay a world is made with to show it: more than one step, so its ring is read through. */
const SHOWN_DELAY = 2;

test("a body's command is applied the world's delay after it is sent, none before, none again after its level leaves full, and across a save and load", async () => {
  // A body-declared actuator away from a bilateral hand name, with its own configuration names.
  const stock = modelSpec("workshop-fighter");
  const spec = JSON.parse(JSON.stringify(stock).replaceAll('"hand.right"', '"tool.central"'));
  const tool = spec.segments.find(segment => segment.name === "tool.central");
  const shapes = tool.configurations.shapes;
  tool.configurations = { initial: "extended", shapes: { extended: shapes.open, retracted: shapes.fist, latched: shapes.grip },
    holding: { configuration: "latched", release: "extended" } };
  const world = createWorld(await freshEngine(), { actuation: "directional", delay: SHOWN_DELAY });
  const built = buildBody(spec, world, { position: [0, 1, 0], joints: poseAngles(spec, GUARD) });
  // Held in place, every muscle's strength is the one at rest, so a ceiling reads the activation that set it; its weight sets its assist's ceiling.
  for (const segment of built.segments.values()) segment.body.setFixed(true);
  const actuator = built.configurations.model.find(entry => entry.segment === tool.name);
  assert.ok(actuator, "the body must expose its declared actuator regardless of its segment name");
  const poses = actuator.configurations.slice(0, 2);
  assert.equal(poses.length, 2, "the fixture needs an actuator with two configurations");
  const sent = [], level = (k) => 0.05 + 0.1 * (k % 7), push = (k) => [k + 1, 0, 0];
  const embodied = embody(built, world, () => {
    const state = { pending: -1 };
    return { name: "delay probe", has: () => "delay probe", dispose() {}, mind: {
      state, interrupt() { state.pending = -1; },
      think() { state.pending = sent.length; sent.push(state.pending); },
      act(control) {
        const k = state.pending;
        if (k < 0) return;
        control.muscles.activation.fill(level(k)); control.muscles.velocity.fill(0);
        control.assist.force.set(...push(k)); control.assist.moment.setAll(0);
        control.configurations.request(tool.name, poses[k % 2]);
      },
    } };
  }, { assist: { force: 10, moment: 10 } });
  // The body's own muscles and assist, not the mind's view of them, which a world with a delay keeps on a mirror a step behind.
  const muscles = embodied.held.muscles, channel = muscles.channels.findIndex((c) => c.positive.tendon === null && c.negative.tendon === null);
  assert.ok(channel >= 0, "the fixture needs a channel without a tendon");
  // What the body was given on the step just taken: the activation its ceiling reads, the assist's push and the hand's pose asked.
  const given = () => ({ activation: Math.round(1e9 * muscles.bounds.positive[channel] / muscles.strength(channel, 1)) / 1e9,
    push: embodied.held.assist.given.force.x, pose: built.configurations.state[tool.name].requested });
  const expected = (k, since) => k - since < SHOWN_DELAY ? { activation: 0, push: 0, pose: null }
    : { activation: Math.round(1e9 * level(k - SHOWN_DELAY)) / 1e9, push: push(k - SHOWN_DELAY)[0], pose: poses[(k - SHOWN_DELAY) % 2] };
  // A hand keeps the pose it was last asked: where none is due, the reading names none if the hand holds the one it held as the steps began.
  const played = (from, steps, since) => {
    const held = built.configurations.state[tool.name].requested;
    return Array.from({ length: steps }, (_, i) => {
      world.step();
      const reading = given(), want = expected(from + i, since);
      return { ...reading, pose: want.pose === null && reading.pose === held ? null : reading.pose };
    });
  };
  const wanted = (from, steps, since) => Array.from({ length: steps }, (_, i) => expected(from + i, since));
  assert.deepEqual(played(0, 8, 0), wanted(0, 8, 0));
  // Off its level and back, the body is its mind's again from its next command: none sent before is given.
  muscles.setLevel("limp"); world.step(3); muscles.setLevel("full");
  for (const segment of built.segments.values()) segment.body.setFixed(true);
  assert.deepEqual(played(8, 6, 8), wanted(8, 6, 8));
  // Saved between a command sent and its step, the load gives the same commands again.
  const root = { world: world.state, body: embodied.state, sent }, saved = saveState(root);
  const after = played(14, 5, 8);
  loadState(root, saved);
  assert.deepEqual(played(14, 5, 8), after);
  assert.deepEqual(after, wanted(14, 5, 8));
  embodied.dispose(); world.dispose();
});

test("a fresh physics fork resets exactly the forces pending at its save", async () => {
  const engine = await freshEngine("rapier");
  const make = () => {
    const world = engine.createPhysics({ hz: 120, gravity: false });
    const bodies = [0, 3, 6].map((x, i) => world.addBody(
      { name: `box ${i}`, position: new Vector3(x, 2, 0), rotation: Quaternion.Identity() },
      [{ kind: "box", centre: [0, 0, 0], size: [1, 1, 1] }],
      { mass: 1, centre: [0, 0, 0], moments: [1, 1, 1], orientation: Quaternion.Identity() },
    ));
    return { world, bodies };
  };
  const original = make(), fork = make();
  try {
    original.world.step(1 / 120);
    original.bodies[1].applyForce(new Vector3(), original.bodies[1].pose.position);
    original.bodies[0].applyForce(new Vector3(2, 0, 0), original.bodies[0].pose.position);
    original.bodies[0].applyTorque(new Vector3(0, 1, 0));
    fork.world.load(original.world.save());
    assert.deepEqual(fork.world.save(), original.world.save());
    for (let i = 0; i < 3; i++) {
      original.world.step(1 / 120); fork.world.step(1 / 120);
      assert.deepEqual(fork.world.save(), original.world.save(), `continuation step ${i + 1}`);
    }
  } finally { original.world.dispose(); fork.world.dispose(); }
});

test("a commanded Mind restores its driver's memory from its own state", async () => {
  const make = async () => {
    const stand = await coreStand(modelSpec("workshop-fighter"));
    const embodied = embody(stand.built, stand.world, own => commandedMind(own, { servoSeconds: SERVO_SECONDS, motor: stockMotor() }, stand.world));
    const memory = { decisions: 0 };
    driveBy(embodied.mind.body, { name: "counted stand", state: memory, decide() {
      memory.decisions++;
      return standIntent(0);
    } }, standingSkills);
    return { stand, embodied, memory, dispose() { embodied.dispose(); stand.dispose(); } };
  };
  const original = await make(), fork = await make();
  try {
    original.stand.step(3);
    assert.equal(original.memory.decisions, 3, "the driver must decide before its state is saved");
    const saved = saveState(original.embodied.mind.mind.state);
    loadState(fork.embodied.mind.mind.state, saved);
    assert.deepEqual(fork.memory, original.memory);
    original.stand.step(); fork.stand.step();
    assert.deepEqual(fork.memory, original.memory);
    assert.equal(fork.memory.decisions, 4);
  } finally { original.dispose(); fork.dispose(); }
});

test("recorded orders accept configured gait names across JSON transport", () => {
  const stock = MOVE_PART.gaits(MOVE_PART.defaults);
  assert.ok(stock.length > 0, "the fixture needs a registered gait for its custom name");
  const config = { ...MOVE_PART.defaults, gaits: [...stock, { ...stock[0], name: "entrant-step" }], otherwise: "entrant-step" };
  assert.deepEqual(MOVE_PART.faults(config), [], "the locomotion must admit the configured gait");
  const gaits = [...MOVE_PART.gaits(config), ...PAW_MOVE.gaits(PAW_MOVE.defaults)];
  const tape = gaits.map(({ name }, step) => ({ step, side: "left", orders: { face: null, gait: name } }));
  const transported = JSON.parse(JSON.stringify(tape));
  assert.deepEqual(transported.filter(isOrdersEntry), tape);
  for (const gait of ["", null, 0]) assert.equal(isOrdersEntry({ step: 0, side: "left", orders: { face: null, gait } }), false);
});


test("a fresh bout load restores the whole published Mind report before another decision", async () => {
  const recipe = { ...recipeOf("?matchup=workshop-fighter,workshop-fighter&control=option,option&left.loadout=empty,empty&right.loadout=empty,empty", { left: {}, right: {} }, "open"),
    commanders: { left: { kind: "drill", after: 0 } } };
  const original = await buildBout(recipe), fork = await buildBout(recipe);
  const report = bout => structuredClone(reportNow(bout.duel.duelists.left.minded.report));
  try {
    original.world.step(120);
    const said = report(original);
    assert.ok(said.engagement?.offers?.length && said.engagement.details?.length, "the fixture must have decided and published its complete engagement");
    assert.notDeepEqual(report(fork), said, "the fresh recipe must distinguish the saved report from its initial report");
    fork.duel.load(original.duel.save());
    assert.deepEqual(report(fork), said);
  } finally { original.dispose(); fork.dispose(); }
});


test("a fallback recovery Option does not count its own transition as an ordinary ascent", async () => {
  const { GAME } = await import("../../src/app/catalog.ts");
  const { catalogOf } = await import("../../src/minds/catalog.ts");
  const { toolkitLists } = await import("../../src/app/toolkit.ts");
  const { REPOSITION_OPTION, WAY_UP_OPTION, waysUpIn, withWaysUp } = await import("../../src/minds/option/rise.ts");
  const { walker } = await import("../../src/minds/option/walk.ts");
  const { optionRecord } = await import("../../src/minds/option/record.ts");
  const spec = modelSpec("workshop-fighter"), fallback = REPOSITION_OPTION.defaults;
  const technique = GAME.partLookup.of("technique", fallback.skill), from = technique.edges[0]?.from;
  assert.equal(technique.fits(spec, fallback.skill, GAME.partLookup), null, "the real fallback technique must fit the fixture body");
  assert.ok(from && technique.starts.length, "the fallback must expose a transition and a declared beginning");
  const [option] = REPOSITION_OPTION.make(fallback, { spec, hz: 120, rate: 120, delay: 0, parts: GAME.partLookup, legs: { kind: "move", rules: [], otherwise: "braced" },
    options: [fallback], tables: { strikes: [], edges: [] }, walk: walker(spec), record: optionRecord(), sites: { all: [], names: [] } });
  assert.ok(option, "the fallback constructor must produce its transition Option");
  const ground = { settled: true, position: from, raw: from, side: "left", velocity: new Vector3(), spin: 0 };
  const now = { ground, sight: { context: { heading: 0, placed: false, lower: 0, support: null, walk: null }, view: { ground }, readiness: () => ({ kind: "ready" }) } };
  assert.deepEqual(option.entry(now), { kind: "ready" }, "a ready uncovered start must retain the fallback's own transition");
  assert.deepEqual(waysUpIn(GAME.partLookup, spec, [fallback]), []);
  const ascent = { ...WAY_UP_OPTION, defaults: { kind: "fixture:ascent", skill: fallback.skill } };
  const catalog = catalogOf(() => ({ ...toolkitLists(), entrants: [{ name: "fixture", parts: [ascent], presets: {} }] }));
  assert.deepEqual(catalog.faults, []);
  assert.deepEqual(waysUpIn(catalog.partLookup, spec, [ascent.defaults, fallback]), [fallback.skill]);
  assert.deepEqual(withWaysUp(catalog.partLookup, [ascent.defaults, fallback], [fallback.skill]), [{ kind: "way-up", skill: fallback.skill }]);
});


test("a measured Lab script follows an explicit numeric walk without a gait envelope", async () => {
  const [{ LAB_MIND }, { labActor }, { startLocomotion }, { trackOf }] = await Promise.all([
    import("../../src/app/node/setup.ts"), import("../../src/app/node/game.ts"),
    import("../../src/game/lab/locomotion-mode.ts"), import("../../src/game/lab/track.ts"),
  ]);
  const stand = await coreStand(modelSpec("workshop-fighter"));
  let session;
  try {
    const actor = labActor(stand.built, stand.world, { mind: LAB_MIND, experiment: { measuring: true } });
    assert.equal("refused" in actor, false, "the measured Lab actor must be admitted");
    const course = trackOf([{ kind: "corner", metres: 0, turn: 0 }, { kind: "straight", metres: 80 }]);
    session = startLocomotion(actor, course, { top: .7, facing: 0 });
    assert.equal("refused" in session, false, "the numeric walk must start");
    assert.equal(actor.mind.skills.envelope, null, "the fixture must remove its measured gait envelope");
    stand.step(stand.seconds(1));
    assert.ok(Number.isFinite(actor.state.script.orders.pace) && actor.state.script.orders.pace > 0, "the script must publish a finite numeric movement");
    assert.equal(actor.mind.report.engagement.phase, "follow orders");
    stand.step(stand.seconds(2));
    const reading = session.frame();
    assert.ok(reading.gait.touchdowns > 0, "the selected ordered walk must reach its first landing");
    assert.equal(reading.fallen, false);
  } finally { session?.dispose(); stand.dispose(); }
});
