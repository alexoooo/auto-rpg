/** Reproduced applicability, command ownership and observation failures at skill boundaries. */
import test from "node:test";
import assert from "node:assert/strict";
import { modelSpec } from "../../src/core/bodies/models.ts";
import { Vector3, Quaternion } from "../../src/core/math/vector.ts";
import { frameOf } from "../../src/core/bodies/spec/body.ts";
import { derive } from "../../src/core/bodies/spec/quantity.ts";
import { validRunCycle, RUN_CYCLE } from "../../src/skills/locomotion/cycle-run.ts";
import { WALK_RUN_PART } from "../../src/skills/locomotion/walk-run-part.ts";
import { validStepUp } from "../../src/skills/recovery/implementations/staged/records.ts";
import { validStraightPunchPart } from "../../src/skills/strikes/straight-punch.ts";
import { surfaceContains } from "../../src/skills/perception/openings.ts";
import { actionResources } from "../../src/skills/framework/action-resources.ts";
import { profileReading, skillDigest } from "../../src/skills/framework/profile.ts";
import { loadData, dataIdentity } from "../../src/core/data/store.ts";
import { bodyRecords } from "../../src/skills/framework/records.ts";
import { heldClearance } from "../../src/skills/locomotion/navigation/held-clearance.ts";
import { withLoadout, LOADOUTS } from "../../src/core/bodies/items/held.ts";
import { coreStand } from "../harness/core-stand.mjs";

const stock = modelSpec("workshop-fighter");

test("invalid authored settings return refusals before the implementation consumes them", () => {
  const renamed = { ...RUN_CYCLE };
  const [key] = Object.keys(renamed);
  renamed.invented = renamed[key]; delete renamed[key];
  assert.equal(validRunCycle(renamed), false, "a same-size object must contain the actual settings");
  assert.equal(validStraightPunchPart(null), false);
  assert.equal(validStepUp({ settle: { speed: .1, seconds: .2 }, climb: 1, stages: { stage: { scale: 1, progress: { near: .1 } } } }), true);
  assert.equal(validStepUp({ settle: { speed: .1, seconds: .2 }, climb: 1, stages: {}, roll: {} }), false);
  const joints = stock.joints.map(joint => joint.name === "hip.left" ? { ...joint, name: "hip.port" } : joint);
  const ends = stock.ends.map(end => end.from === "hip.left" ? { ...end, from: "hip.port" } : end);
  assert.match(WALK_RUN_PART.fits({ ...stock, joints, ends }), /bilateral/);
  assert.equal(WALK_RUN_PART.fits(stock), null);
});

test("configuration observations select the sensed collision surface", () => {
  const original = stock.segments.find(segment => segment.name === stock.marks.high);
  const frame = frameOf(original);
  const centre = derive("m", "the observed shape is centred in its segment frame", [], () => frame.origin);
  const shape = radius => ({ kind: "sphere", centre, radius: derive("m", "the configured probe radius", [], () => radius) });
  const segment = { ...original, contacts: [], shape: shape(.1), configurations: { initial: "small", shapes: { small: shape(.1), expanded: shape(.9) } } };
  const spec = { ...stock, segments: stock.segments.map(one => one === original ? segment : one) };
  const sensed = { position: new Vector3(), rotation: new Quaternion(), configuration: "small" };
  const foe = { spec, segments: new Map([[segment.name, sensed]]) };
  assert.equal(surfaceContains(foe, segment.name, [.4, 0, 0]), false);
  sensed.configuration = "expanded";
  assert.equal(surfaceContains(foe, segment.name, [.4, 0, 0]), true);
});

test("assist writes require ownership and conflict across otherwise independent limbs", () => {
  const resources = actionResources([], [{ segment: "arm.a", channels: [] }, { segment: "arm.b", channels: [] }], [], []);
  const assist = { force: new Vector3(), moment: new Vector3() };
  assert.throws(() => resources.validatePatch(["arm.a"], { assist }), /undeclared.*assist/);
  assert.doesNotThrow(() => resources.validatePatch(["arm.a", "assist"], { assist }));
  assert.equal(resources.overlap(["arm.a", "assist"], ["arm.b", "assist"]), true);
});

test("profiles retain every observed exit percept and hash global data", async () => {
  const profile = { target: null, trials: [{ start: { range: 1, phase: "clear" }, done: true, dealt: 0, taken: 0, seconds: 1, recovers: null, down: false, exit: { balance: .4 } }] };
  assert.deepEqual(profileReading(profile, stock).expect({ range: 1, phase: "clear" }, null).exit, { balance: .4 });
  await loadData(["boundary-global-a", "boundary-global-b", "boundary-row"], {
    "boundary-global-a": async () => ({ gain: 1 }), "boundary-global-b": async () => ({ gain: 2 }),
    "boundary-row": bodyRecords(async () => ({ [stock.model]: { gain: 3 } })),
  });
  assert.deepEqual(dataIdentity("boundary-row", stock.model), { gain: 3 });
  assert.equal(dataIdentity("boundary-row", "unrecorded-body"), null);
  const action = { name: "act", executor: "driver", effectors: [] }, executor = { name: "driver", kind: "test" };
  const digest = key => skillDigest({ of: () => ({ reads: () => [key] }) }, stock, [executor], action);
  assert.notEqual(digest("boundary-global-a"), digest("boundary-global-b"));
});

test("a held rigid carrier can be observed without an effector actuator", async () => {
  const loadout = LOADOUTS.find(one => one.right === "club" && one.left === "empty");
  assert.ok(loadout, "the existing club fixture is present");
  const armed = withLoadout(stock, loadout);
  const spec = { ...armed, effectors: armed.effectors.filter(one => one.segment !== "hand.right") };
  const stand = await coreStand(spec, { gravity: false });
  try {
    const segments = Object.fromEntries([...stand.built.segments].map(([name, segment]) => [name, segment.pose]));
    const radius = heldClearance(spec)({ segments, stance: { centre: { x: 0, z: 0 } } });
    assert.ok(Number.isFinite(radius) && radius > 0);
  } finally { stand.dispose(); }
});
import { commandedBody } from "../../src/app/commanded-body.ts";
import { guardSkill } from "../../src/skills/guard/guard.ts";
import { riseLimbs } from "../../src/skills/recovery/implementations/staged/limbs.ts";
import { RISE } from "../../src/skills/recovery/implementations/staged/stages.ts";
import { heldBody, heldCommand } from "../../src/skills/recovery/held-body.ts";
import { saveState, loadState } from "../../src/core/world/state.ts";

test("takeover clears a paced ward and staged toe support restores into a fresh player", async () => {
  const loadout = LOADOUTS.find(one => one.left === "buckler" && one.right === "empty");
  assert.ok(loadout, "the existing covering buckler fixture is present");
  const stand = await coreStand(withLoadout(stock, loadout), { gravity: false });
  const host = commandedBody(stand.built, stand.world, { servoSeconds: .1 });
  try {
    const guard = guardSkill(stand.built.spec, undefined, { wardSpeeds: { "hand.left": 1 } });
    guard.command(host.view, { "hand.left": { guarded: [0, 1, 0], threat: [0, 1, 2] } });
    assert.ok(guard.state.wards["hand.left"], "the actual guard command began a paced ward");
    guard.resume(host.view);
    assert.equal(guard.state.wards["hand.left"], null);
    const own = heldBody(host.driver, heldCommand(host.driver.muscles.channels.length)).own;
    const first = riseLimbs(own, RISE), fresh = riseLimbs(own, RISE);
    const toes = own.spec.ends.map(end => end.kind === "foot");
    first.read(1, false, toes, { x: 0, z: 100 });
    loadState(fresh.state, saveState(first.state));
    for (const made of [first, fresh]) {
      made.read(1, false, toes, { x: 0, z: -100 });
      for (let i = 0; i < made.limbs.length; i++) if (toes[i]) made.bear(i, new Float64Array(own.muscles.channels.length), 1, 1, 1);
    }
    const rows = made => made.limbs.filter((_, i) => toes[i]).map(limb => limb.work.rows);
    assert.ok(rows(first).some(row => row !== null), "the controller actually latched a rolled toe support");
    assert.deepEqual(rows(fresh), rows(first));
  } finally { host.dispose(); stand.dispose(); }
});
import { soleRefusal } from "../../src/control/support.ts";
import { fitsPaws } from "../../src/control/quadruped/fit.ts";

test("cached support controllers refuse changing colliders and admit identical numeric configurations", async () => {
  for (const [base, fits, supportName] of [[stock, soleRefusal, "foot.left"], [modelSpec("reptile"), fitsPaws, "paw.front.left"]]) {
    const support = base.segments.find(segment => segment.name === supportName);
    const same = { ...support.shape, centre: derive("m", "the same support centre with independent provenance", [support.shape.centre], value => value) };
    const sphere = { kind: "sphere", centre: support.shape.centre, radius: derive("m", "a rounded support configuration", [], () => .05) };
    const configured = (initial, shapes) => ({ ...base, segments: base.segments.map(segment => segment === support ? { ...segment, configurations: { initial, shapes } } : segment) });
    assert.equal(fits(configured("same", { same })), null);
    const changed = configured("round", { round: sphere });
    const stand = await coreStand(changed, { gravity: false });
    try {
      assert.equal(stand.built.segments.get(supportName).rigid.shapes[0].kind, "sphere", "the valid body's actual initial collider differs from its cached box");
      assert.match(fits(changed), /fixed support shapes/);
      assert.match(fits(configured("same", { same, round: sphere })), /fixed support shapes/, "a later reachable shape also matters");
    } finally { stand.dispose(); }
  }
});
import { crouchSteady } from "../../research/skills/recovery/witness/climb.mjs";
import { pendingControl } from "../../research/minds/pending-control.mjs";

import { steadying } from "../../src/skills/recovery/implementations/modes/steady.ts";
import { kitOf } from "../../src/skills/kit.ts";
for (const [name, makeSteady] of [["witness crouch", crouchSteady], ["steady mode", (own, view) => steadying(own, view, kitOf(partLookup, own.spec))]]) {
test(`${name} initializes its own stance when it is the first holder`, async () => {
  const stand = await coreStand(stock);
  let steady, ticks = 0;
  const body = commandedBody(stand.built, stand.world, { servoSeconds: .1 }, [(own, view) => {
    steady = makeSteady(own, view);
    const pending = pendingControl(own.muscles.channels.length);
    return { name: "first recovery", has: () => "first recovery", dispose() {}, mind: {
      state: { steady: steady.state, pending: pending.state }, wants: () => true, begin() { steady.begin?.(); }, end() {},
      act: pending.act, interrupt: pending.interrupt,
      think() {
        pending.think(); steady.step(pending.control, own.dt); ticks++;
        assert.ok([...pending.control.muscles.velocity].every(value => !Number.isNaN(value)), "torque-source speeds may be unbounded, but never NaN");
        assert.ok([...pending.control.muscles.activation].every(Number.isFinite));
      },
    } };
  }]);
  try {
    stand.step(3);
    assert.equal(ticks, 3, "the first-holder control steps actually ran");
    assert.ok(steady.state.legs.reference !== null && Number.isFinite(steady.state.legs.reference), "the private locomotion initializes while the host has never driven");
  } finally { body.dispose(); stand.dispose(); }
});}

import { PAW_MOVE } from "../../src/skills/locomotion/quadruped/paw-legs.ts";
import { PAW_MOTOR } from "../../src/control/quadruped/paw-motor.ts";

test("replacement paw gaits normalize both travel axes and supply their own braking", async () => {
  const stand = await coreStand(modelSpec("reptile"));
  const body = commandedBody(stand.built, stand.world, { servoSeconds: .1, motor: PAW_MOTOR.make() });
  const seen = {};
  const gait = (name, speed, stopping) => ({
    state: { phase: "settle", steps: 0, placed: 0, sequence: 0, standing: true },
    settings: { crawlHeight: 1, lift: .02, plantSpeed: .1, plant: .1, swing: .1 },
    reach: { forward: speed, aside: 1, turn: 1 }, travel: { speed, stopping }, resume() {},
    command(view, orders) {
      seen[name] = orders;
      return { centre: [view.centre.x, view.centre.y, view.centre.z], velocity: [0, 0, 0], rotation: [0, 0, 0, 1], posture: {},
        endpoints: view.feet.map(foot => ({ target: [foot.at.x, foot.at.y, foot.at.z], bearing: true })) };
    },
  });
  try {
    const gaits = { customTrot: gait("trot", 2, .7), customCrawl: gait("crawl", 4, 1.1) };
    const legs = PAW_MOVE.make(body.driver, { kind: "paw-move", trot: { kind: "customTrot" }, crawl: { kind: "customCrawl" } },
      { parts: { of: (_role, config) => ({ make: () => gaits[config.kind] }) } });
    legs.goal(body.view, { walk: [1, .5], face: 0, gait: "trot" }, body.driver.dt);
    assert.deepEqual(seen.trot, { move: { x: .25, z: .5 }, face: { x: 0, z: 1 } });
    assert.equal(legs.stopping, .7);
    legs.goal(body.view, { walk: [1, .5], face: 0, gait: "crawl" }, body.driver.dt);
    assert.deepEqual(seen.crawl, { move: { x: .125, z: .25 }, face: { x: 0, z: 1 } });
    assert.equal(legs.stopping, 1.1);
  } finally { body.dispose(); stand.dispose(); }
});
import { standingFooting } from "../../src/control/support.ts";
import { stanceFeetOf, stanceSegmentsOf } from "../../src/skills/locomotion/stance-feet.ts";
import { locomotion } from "../../src/skills/locomotion/locomotion.ts";

test("idle stance reads physical foot yaw without an effector actuator or matching end name", async () => {
  const spec = { ...stock, ends: stock.ends.map(end => end.kind === "foot" ? { ...end, name: end.name === "foot.left" ? "anchor.port" : "anchor.starboard" } : end),
    effectors: stock.effectors.filter(effector => !effector.segment.startsWith("foot.")) };
  const stand = await coreStand(spec, { posture: { "hip.left internal rotation": .4 } });
  const body = commandedBody(stand.built, stand.world, { servoSeconds: .1 });
  try {
    const legs = locomotion(stanceFeetOf(spec), null, { segments: stanceSegmentsOf(spec), idleFooting: standingFooting(stand.built) });
    const ends = Object.fromEntries(Object.entries(body.view.stance.ends).map(([name, end]) => [name, { ...end, touching: true }]));
    const view = { ...body.view, time: 1, born: 0, stance: { ...body.view.stance, velocity: new Vector3(), ends, own: null } };
    const result = legs.goal(view, { walk: null, face: 0 }, .25, { idleSettle: true });
    assert.equal(result.goal.swing?.foot, "anchor.port", "the yawed physical support is reset by its declared end identifier");
  } finally { body.dispose(); stand.dispose(); }
});

import { partLookup, MINDS, GAME } from "../../src/app/catalog.ts";
import { filledRefusal } from "../../src/skills/kit.ts";

test("explicit filled parts obey the same body applicability as automatic selection", () => {
  const rat = modelSpec("rat");
  for (const kind of ["cover-guard", "shield-guard"]) {
    const config = { ...MINDS.option.config, tuning: { parts: { guard: { kind } } } };
    assert.deepEqual(GAME.treeFaults(config), []);
    assert.match(filledRefusal(partLookup, rat, config.tuning.parts), /guard: .*hand/);
    assert.match(GAME.stageRefusal(rat, config, []), /guard: .*hand/);
  }
  const humanMotor = partLookup.fitting("motor", stock);
  const humanLegs = partLookup.fitting("locomotion", stock);
  assert.equal(typeof humanMotor, "object");
  assert.equal(typeof humanLegs, "object");
  assert.match(filledRefusal(partLookup, rat, { motor: humanMotor }), /motor:/);
  assert.match(filledRefusal(partLookup, rat, { legs: humanLegs }), /legs:/);
});

import { labActor } from "../../src/app/node/game.ts";
import { shoveBody } from "../../src/game/lab/stance-mode.ts";
import { standIntent } from "../../src/skills/intent/intent.ts";
import { rulebook } from "../../src/combat/rulebook.ts";
import { saveStand, loadStand } from "../harness/core-stand.mjs";

test("Lab script memory, its order cache and a pending shove restore with their state roots", async () => {
  const stand = await coreStand(stock);
  const actor = labActor(stand.built, stand.world, { mind: MINDS.option.config, rules: rulebook("arena") });
  assert.ok(!actor.refused, actor.refused);
  const memory = { decisions: 0, elapsed: 0 };
  const driven = actor.drive({ name: "remember", state: memory, decide(_sight, dt) { memory.decisions++; memory.elapsed += dt; return standIntent(0); } });
  assert.ok(!driven.refused, driven.refused);
  const impulses = [];
  const shoving = shoveBody(actor.body, stand.world, () => 0, (_segment, impulse) => impulses.push([impulse.x, impulse.y, impulse.z]));
  assert.ok(!shoving.refused, shoving.refused);
  try {
    stand.step(3);
    assert.ok(memory.decisions > 0, "the memoryful script actually decided");
    shoving.shove(1, 0);
    const roots = { actor: actor.state, shoving: shoving.state }, before = structuredClone(memory);
    const saved = saveStand(stand.world, roots);
    stand.step(3);
    const first = { memory: structuredClone(memory), cache: structuredClone(actor.state.script), impulses: structuredClone(impulses) };
    assert.ok(first.memory.decisions > before.decisions);
    assert.deepEqual(first.impulses, [[0, 0, 1]]);
    loadStand(stand.world, roots, saved);
    assert.deepEqual(memory, before, "the script closure still holds the restored state object");
    impulses.length = 0;
    stand.step(3);
    assert.deepEqual({ memory: structuredClone(memory), cache: structuredClone(actor.state.script), impulses }, first);
  } finally { shoving.dispose(); actor.dispose(); stand.dispose(); }
});

import { stockClearance } from "../../src/skills/locomotion/navigation/clear-step.ts";
import { bodyClearance } from "../../src/skills/locomotion/navigation/sensed-bounds.ts";
import { arenaSolids } from "../../src/game/arena/solids.ts";

test("a low quadruped clears its supporting arena floor while retaining real parapet avoidance", async () => {
  const spec = modelSpec("reptile"), stand = await coreStand(spec);
  const body = commandedBody(stand.built, stand.world, { servoSeconds: .1, motor: PAW_MOTOR.make() });
  try {
    const solids = arenaSolids(), ground = solids.find(one => one.name === "ground"), wall = solids.find(one => one.name === "room.wall.0.collider");
    assert.ok(ground && wall && wall.kind === "box", "the existing arena floor and vertical parapet fixture are present");
    const centre = body.view.stance.centre, y = centre.y;
    assert.ok(bodyClearance(spec) > y - body.view.stance.support.y, "the real low body reaches the former floor-overlap error");
    const clear = stockClearance(spec), view = { ...body.view, senses: { ...body.view.senses, solids: [ground] } };
    assert.equal(clear.exit(view), null);
    assert.deepEqual(clear.keepClear(view, 0, [1, 0]), [1, 0]);
    view.senses.solids = [ground, wall];
    view.stance = { ...view.stance, centre: new Vector3(wall.centre[0], y, wall.centre[2]) };
    assert.notEqual(clear.exit(view), null, "a real vertical obstacle still requires an exit");
    view.stance = { ...view.stance, centre: new Vector3(wall.centre[0], y, wall.centre[2] - wall.size[2] / 2 - bodyClearance(spec) - .1) };
    assert.notDeepEqual(clear.keepClear(view, 0, [1, 0]), [1, 0], "the walk into the parapet is still blocked or steered");
  } finally { body.dispose(); stand.dispose(); }
});
