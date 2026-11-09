import { segmentResource, ASSIST_RESOURCE } from "../../src/skills/framework/action.ts";
/** Reproduced applicability, command ownership and observation failures at skill boundaries. */
import test from "node:test";
import assert from "node:assert/strict";
import { modelSpec } from "../../src/core/bodies/models.ts";
import { Vector3, Quaternion } from "../../src/core/math/vector.ts";
import { frameOf } from "../../src/core/bodies/spec/body.ts";
import { derive } from "../../src/core/quantity.ts";
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
  assert.throws(() => resources.validatePatch([segmentResource("arm.a")], { assist }), /undeclared.*assist/);
  assert.doesNotThrow(() => resources.validatePatch([segmentResource("arm.a"), ASSIST_RESOURCE], { assist }));
  assert.equal(resources.overlap([segmentResource("arm.a"), ASSIST_RESOURCE], [segmentResource("arm.b"), ASSIST_RESOURCE]), true);
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
import { stockBody } from "../../src/app/stock-body.ts";
import { guardSkill } from "../../src/skills/guard/guard.ts";
import { riseLimbs } from "../../src/skills/recovery/implementations/staged/limbs.ts";
import { RISE } from "../../src/skills/recovery/implementations/staged/stages.ts";
import { heldBody, heldCommand } from "../../src/skills/recovery/held-body.ts";
import { saveState, loadState } from "../../src/core/state.ts";

test("takeover clears a paced ward and staged toe support restores into a fresh player", async () => {
  const loadout = LOADOUTS.find(one => one.left === "buckler" && one.right === "empty");
  assert.ok(loadout, "the existing covering buckler fixture is present");
  const stand = await coreStand(withLoadout(stock, loadout), { gravity: false });
  const host = stockBody(stand.built, stand.world, { servoSeconds: .1 });
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
import { mindKitOf } from "../../src/skills/assembly/kit.ts";
for (const [name, makeSteady] of [["witness crouch", crouchSteady], ["steady mode", (own, view) => steadying(own, view, mindKitOf(partLookup, own.spec))]]) {
test(`${name} initializes its own stance when it is the first holder`, async () => {
  const stand = await coreStand(stock);
  let steady, ticks = 0;
  const body = stockBody(stand.built, stand.world, { servoSeconds: .1 }, [(own, view) => {
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
  const body = stockBody(stand.built, stand.world, { servoSeconds: .1, motor: PAW_MOTOR.make() });
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
  const body = stockBody(stand.built, stand.world, { servoSeconds: .1 });
  try {
    const legs = locomotion(stanceFeetOf(spec), null, { segments: stanceSegmentsOf(spec), idleFooting: standingFooting(stand.built) });
    const ends = Object.fromEntries(Object.entries(body.view.stance.ends).map(([name, end]) => [name, { ...end, touching: true }]));
    const view = { ...body.view, time: 1, born: 0, stance: { ...body.view.stance, velocity: new Vector3(), ends, own: null } };
    const result = legs.goal(view, { walk: null, face: 0 }, .25, { idleSettle: true });
    assert.equal(result.goal.swing?.foot, "anchor.port", "the yawed physical support is reset by its declared end identifier");
  } finally { body.dispose(); stand.dispose(); }
});

import { partLookup, MINDS, GAME } from "../../src/app/catalog.ts";
import { filledRefusal } from "../../src/skills/assembly/kit.ts";

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
import { standIntent } from "../../src/skills/framework/intent.ts";
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
  const body = stockBody(stand.built, stand.world, { servoSeconds: .1, motor: PAW_MOTOR.make() });
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

import { COVER_GUARD } from "../../src/skills/guard/guard-part.ts";
import { STOMP_PART } from "../../src/skills/strikes/stomp-part.ts";
import { STAGED_DOWN } from "../../src/skills/recovery/implementations/staged/techniques.ts";
import { stepUpTuning } from "../../src/skills/recovery/implementations/staged/records.ts";
import { TROT_PART } from "../../src/skills/locomotion/quadruped/trot.ts";
import { CRAWL_PART } from "../../src/skills/locomotion/quadruped/crawl.ts";
import { JAW_BITE } from "../../src/skills/strikes/bite/index.ts";
import { ROLL_POSES } from "../../src/skills/recovery/implementations/staged/stages.ts";
import { kitSkills } from "../../src/skills/assembly/assembly.ts";
import { LEG_RESOURCE, TRUNK_RESOURCE, poseResource, hasResource } from "../../src/skills/framework/action.ts";
import { MOVE_PART } from "../../src/skills/locomotion/move-part.ts";

test("resource compilation separates segment names from services and uses physical bearing chains", () => {
  const resources = actionResources(["hip flexion", "arm flexion"], [{ segment: "assist", channels: ["arm flexion"] }],
    [{ name: "support", segment: "bare-foot", channels: ["hip flexion"] }], ["assist"]);
  assert.deepEqual(resources.controls([LEG_RESOURCE]), ["stance", "effector:bare-foot", "channel:hip flexion"]);
  assert.deepEqual(resources.controls([TRUNK_RESOURCE]), []);
  assert.equal(resources.overlap([segmentResource("assist")], [ASSIST_RESOURCE]), false);
  assert.equal(resources.overlap([segmentResource("assist")], [poseResource("assist")]), true);
  assert.doesNotThrow(() => resources.validate([LEG_RESOURCE, segmentResource("bare-foot")], { legs: null, pushes: [{ channel: "hip flexion", speed: 0, level: 1 }] }));
  assert.equal(hasResource(structuredClone([segmentResource("assist")]), segmentResource("assist")), true);
});

test("Option skills assemble with physical feet alone and an effector named assist", async () => {
  const rename = value => Array.isArray(value) ? value.map(rename) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, one]) => [key, rename(one)]))
    : value === "hand.left" ? "assist" : value;
  const variants = [
    { ...stock, effectors: stock.effectors.filter(effector => !effector.segment.startsWith("foot.")) },
    rename(stock),
  ];
  for (const spec of variants) {
    const stand = await coreStand(spec), actor = stockBody(stand.built, stand.world, { servoSeconds: .1 });
    let skills;
    try {
      skills = kitSkills(actor.driver, stand.world.clock, partLookup, { legs: partLookup.fitting("locomotion", spec), guard: partLookup.fitting("guard", spec), navigation: partLookup.game("navigation")[0],
        actions: [], executors: [], support: null }, () => []);
      actor.drive((view, dt) => skills.command(view, standIntent(0), dt));
      stand.step(120);
      assert.equal(actor.view.down, false, "the assembled services hold the altered body standing");
      for (const segment of stand.built.segments.values()) assert.ok([segment.pose.position.x, segment.pose.position.y, segment.pose.position.z].every(Number.isFinite));
    } finally { skills?.release(actor.view, "replaced"); actor.dispose(); stand.dispose(); }
  }
});

test("admission resolves guard, staged channels and timed strike and gait settings before construction", () => {
  const hand = stock.segments.find(segment => segment.name === "hand.left"), neutral = { ...hand, configurations: { initial: "neutral", shapes: { neutral: hand.shape } } };
  const spec = { ...stock, segments: stock.segments.map(segment => segment === hand ? neutral : segment) };
  assert.match(COVER_GUARD.fits(spec, COVER_GUARD.defaults, partLookup), /hand.left.*open.*configuration/);
  assert.deepEqual(COVER_GUARD.faults({ kind: "cover-guard", tuning: { covering: null } }), ["invalid guard tuning"]);
  assert.match(COVER_GUARD.fits(stock, { kind: "cover-guard", tuning: { covering: null } }, partLookup), /invalid guard tuning/);
  const tuning = structuredClone(stepUpTuning(stock));
  tuning.stages.fold = { ...tuning.stages.fold, scale: 1, posture: { "unknown channel": 0 } };
  assert.deepEqual(STAGED_DOWN.faults({ kind: "staged-down", tuning }), []);
  assert.match(STAGED_DOWN.fits(stock, { kind: "staged-down", tuning }, partLookup), /unknown channel/);
  assert.match(STOMP_PART.fits(stock, { kind: "stomp", tuning: { swingSeconds: 0 } }, partLookup), /invalid stomp/);
  const reptile = modelSpec("reptile");
  for (const [part, tuning] of [[TROT_PART, { speed: 0 }], [CRAWL_PART, { settle: 0, shift: 0, swing: 0, plant: 0 }], [JAW_BITE, { prepare: 0 }], [JAW_BITE, { snap: 0 }]]) {
    const config = { ...part.defaults, tuning };
    assert.match(part.fits(reptile, config, partLookup), /invalid .*settings/);
    assert.notDeepEqual(part.faults(config, partLookup), []);
  }
  assert.equal(TROT_PART.fits(reptile, { ...TROT_PART.defaults, tuning: { settle: 0 } }, partLookup), null);
  assert.ok(Object.isFrozen(ROLL_POSES.wind) && Object.isFrozen(ROLL_POSES.swing));
});

test("default skill assembly roots the one configured memoryful aim", async () => {
  const stand = await coreStand(stock), body = stockBody(stand.built, stand.world, { servoSeconds: .1 });
  let made = 0, aim;
  const memory = { calls: 0 };
  const custom = {
    ...partLookup,
    of(role, config) {
      if (role === "aim" && config.kind === "remember-aim") return { make() { made++; return Object.assign(() => { memory.calls++; return null; }, { state: memory }); } };
      if (role === "executor" && config.kind === "read-aim") return { make(given) {
        aim = given.aim;
        return { state: {}, needs: () => [], readiness: () => ({ kind: "blocked", reason: "probe" }), update: () => [], start() {}, command: () => ({}), resume() {} };
      } };
      return partLookup.of(role, config);
    },
  };
  const navigation = partLookup.game("navigation")[0];
  let skills;
  try {
    skills = kitSkills(body.driver, stand.world.clock, custom, { legs: partLookup.fitting("locomotion", stock), guard: partLookup.fitting("guard", stock), navigation,
      support: null, executors: [{ kind: "read-aim", name: "reader" }], actions: [{ name: "remember", executor: "reader", effectors: [], aim: { kind: "remember-aim" } }] }, () => []);
    assert.equal(made, 1);
    const target = { kind: "point", at: [0, 0, 0] };
    aim(body.view, target, "remember", "hand.left");
    const saved = saveState(skills.state);
    aim(body.view, target, "remember", "hand.left"); aim(body.view, target, "remember", "hand.left");
    assert.deepEqual(memory, { calls: 3 });
    loadState(skills.state, saved);
    assert.deepEqual(memory, { calls: 1 });
  } finally { skills?.release(body.view, "replaced"); body.dispose(); stand.dispose(); }
});

test("idle foot placement survives its own weight-shift tracking error and yields to a catch", async () => {
  const stand = await coreStand(stock, {posture:{"hip.left abduction":.35,"hip.right abduction":.35}});
  const body = stockBody(stand.built, stand.world, {servoSeconds:.1});
  try {
    const legs = locomotion(stanceFeetOf(stock), null, {segments:stanceSegmentsOf(stock), idleFooting:standingFooting(stand.built)});
    const ends = Object.fromEntries(Object.entries(body.view.stance.ends).map(([name,end]) => [name,{...end,touching:true}]));
    const view = {...body.view, time:1, born:0, down:false, stance:{...body.view.stance, phase:"stand", velocity:new Vector3(), planVelocity:new Vector3(), own:null, ends}};
    const first = legs.goal(view, {walk:null,face:0}, .25).goal;
    assert.ok(first?.swing, "the wide placed pose must request a neutral-footing step");
    const shifting = {...view, time:1.1, stance:{...view.stance, phase:"shift", planVelocity:new Vector3(.11,0,0)}};
    const next = legs.goal(shifting, {walk:null,face:0}, .01).goal;
    assert.deepEqual(next.swing, first.swing, "tracking lag must retain the pending lift and its target");
    const catchView = {...shifting, stance:{...shifting.stance, own:{...first.swing,shift:false}}};
    legs.goal(catchView, {walk:null,face:0}, .01);
    assert.deepEqual({idle:legs.state.idle, placing:legs.state.placing}, {idle:{seconds:0,target:null,centre:null},placing:null}, "a stance-owned catch releases idle placement and its centering target");
  } finally {body.dispose();stand.dispose();}
});
