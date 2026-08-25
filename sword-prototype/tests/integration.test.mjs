import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import HavokPhysics from "@babylonjs/havok";

import { CONFIG } from "../src/config.ts";
import { defaultMatchup, EQUIPMENT, withEquipment } from "../src/bout.ts";
import { Fighter, stepPair } from "../src/fighter.ts";
import { policyMind, POLICIES } from "../src/mind.ts";
import { attachPhysics, COLLIDES, LAYER, layersFor } from "../src/physics.ts";
import { Quiver } from "../src/arrow.ts";
import { composeTactic, handActionOption, movementIntent } from "../src/options.ts";
import { COMBAT_FIELDS } from "./fixtures/intent.mjs";

process.env.SWORD_MEASURE_LIBRARY = "1";
const { freshHavok, runBout } = await import("../scripts/measure.mjs");

const wasm = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);
const FIXED = 1 / CONFIG.world.physicsHz;
const FRAME_MS = 1000 / 60;

const materialsFor = (scene) => {
  const mat = (name) => new StandardMaterial(name, scene);
  return {
    flesh: mat("flesh"), cloth: mat("cloth"), steel: mat("steel"),
    leather: mat("leather"), brass: mat("brass"), hide: mat("hide"),
    wood: mat("wood"), arrowAccent: mat("arrow-accent"),
  };
};

const census = (scene) => ({
  meshes: scene.meshes.length,
  materials: scene.materials.length,
  textures: scene.textures.length,
  bodies: scene.getPhysicsEngine().getBodies().length,
  constraints: scene.getPhysicsEngine().getPhysicsPlugin()._integrationLiveConstraints ?? 0,
  // Observable removal is deferred with a zero-delay timer; marked observers
  // are already inert and are not live resources.
  beforePhysicsObservers: scene.onBeforePhysicsObservable.observers.filter((observer) => !observer._willBeUnregistered).length,
  beforeRenderObservers: scene.onBeforeRenderObservable.observers.filter((observer) => !observer._willBeUnregistered).length,
  particles: scene.particleSystems.length,
  trails: scene.meshes.filter((mesh) => mesh.name.endsWith(".trace")).length,
});

const torso = (fighter) => fighter.limbs.find((limb) => limb.key === "torso");

test("every_setup_loadout_and_policy_builds_steps_finishes_and_disposes", () => {
  const reachable = new Map();
  for (const handA of EQUIPMENT) for (const handB of EQUIPMENT) {
    let matchup = withEquipment(defaultMatchup(), "left", "handA", handA.name);
    matchup = withEquipment(matchup, "left", "handB", handB.name);
    const loadout = { primary: matchup.left.handA, secondary: matchup.left.handB };
    reachable.set(`${loadout.primary}/${loadout.secondary}`, loadout);
  }
  for (const policy of POLICIES) {
    for (const [label, loadout] of reachable) {
      let samples = 0;
      const result = runBout({
        left: policy.name,
        right: "idle",
        seeds: [101, 202],
        leftLoadout: loadout,
        rightLoadout: { primary: "empty", secondary: "empty" },
        onSample({ right }) {
          samples += 1;
          if (samples === 8) torso(right).health = 0;
        },
      });
      assert.ok(samples >= 8, `${policy.name}/${label} stepped the real pair`);
      assert.equal(result.ending, "exhausted", `${policy.name}/${label} reached a verdict`);
      assert.equal(result.winner, "left", `${policy.name}/${label} kept the forced winner`);
    }
  }
});

test("every_finish_path_stops_combat_on_the_exact_verdict_step", async () => {
  const calls = { left: [], right: [] };
  let callsAtVerdict = null;
  const tracked = (name, side) => {
    const inner = policyMind(name, side === "left" ? 31 : 47);
    return { name: inner.name, decide(view, dt) { calls[side].push(view.clock); return inner.decide(view, dt); } };
  };
  let samples = 0;
  const result = runBout({
    left: "duelist", right: "swinger", seeds: [31, 47],
    leftMind: tracked("duelist", "left"), rightMind: tracked("swinger", "right"),
    physics: await freshHavok(),
    onSample({ right }) { samples += 1; if (samples === 60) torso(right).health = 0; },
    onVerdict() { callsAtVerdict = { left: calls.left.length, right: calls.right.length }; },
    postVerdictFrames: 3,
  });
  assert.equal(result.ending, "exhausted");
  assert.equal(result.winner, "left");
  for (const side of ["left", "right"]) {
    assert.ok(calls[side].length > 0);
    assert.equal(calls[side].length, callsAtVerdict[side], `${side} mind stopped on the verdict step`);
    assert.ok(calls[side].at(-1) <= result.seconds + Number.EPSILON,
      `${side} received no command after the verdict clock ${result.seconds}`);
  }
});

for (const kind of ["shield", "buckler"]) {
  test(`an_arrow_stopped_by_a_${kind}_records_one_block_and_no_wound`, async () => {
    const contacts = [];
    const result = runBout({
      left: "archer", right: "duelist", seeds: [3101, 7103],
      leftLoadout: { primary: "bow", secondary: "empty" },
      rightLoadout: { primary: "sword", secondary: kind },
      physics: await freshHavok(),
      onEvent(event) {
        if (event.side === "left" && event.report.weapon === "arrow") contacts.push(event);
      },
    });
    const blocks = contacts.filter((event) => event.blocked && event.report.key === `block:${kind}`);
    assert.ok(blocks.length > 0, `${kind} physically intercepted at least one shot`);
    for (const block of blocks) {
      assert.equal(contacts.some((event) => !event.blocked && event.report.at === block.report.at), false,
        "the first-contact block cannot also become a wound before spent promotion");
    }
    assert.ok(result.right, "the real bout completed and disposed");
  });
}

/**
 * Renamed from `all_shipped_intents_stay_finite_and_anatomically_bounded_for_a_full_bout`
 * when session 15 took the camera out of the command. The bout it runs and every
 * bound it checks are unchanged; what it now also states is the shape it is
 * checking, once per control step of a real fight, which is where a stale field
 * would actually reach a fighter.
 */
test("every_policy_returns_a_finite_zoom_free_combat_command", () => {
  const loadoutFor = { idle: { primary: "sword", secondary: "empty" },
    swinger: { primary: "sword", secondary: "empty" }, duelist: { primary: "sword", secondary: "shield" },
    archer: { primary: "bow", secondary: "empty" } };
  const inspect = (intent, label) => {
    assert.deepEqual(Object.keys(intent).sort(), COMBAT_FIELDS, `${label} asked for a host field`);
    const axes = [intent.forward, intent.strafe, intent.turn,
      intent.posture.trunkLean, intent.posture.trunkTwist, intent.posture.crouch];
    for (const value of axes) assert.ok(Number.isFinite(value), `${label} returned a finite body axis`);
    for (const value of [intent.forward, intent.strafe, intent.turn, intent.posture.trunkLean, intent.posture.trunkTwist]) {
      assert.ok(value >= -1 && value <= 1, `${label} kept a normalized signed axis: ${value}`);
    }
    assert.ok(intent.posture.crouch >= 0 && intent.posture.crouch <= 1, `${label} kept crouch anatomical`);
    // A hand, or `null` -- and null means one thing only: what is acting is not
    // a hand. `crawler` drives a set of jaws and is the one shipped policy that
    // answers it, so pinning *which* policies answer null is what keeps this two
    // claims instead of a check every value passes.
    assert.ok(intent.actingHand === "primary" || intent.actingHand === "secondary" || intent.actingHand === null,
      `${label} named a real hand or none at all`);
    assert.equal(intent.actingHand === null, label === "crawler",
      `${label} names a hand exactly when a hand is what acts`);
    assert.equal(typeof intent.natural.thrust, "boolean", `${label} published a natural button`);
    assert.equal(typeof intent.natural.guard, "boolean", `${label} published a natural button`);
    for (const hand of [intent.primary, intent.secondary]) {
      for (const value of [hand.pointerX, hand.pointerY, hand.roll, hand.wristBend]) {
        assert.ok(Number.isFinite(value), `${label} returned a finite hand command`);
      }
      assert.ok(hand.pointerX >= -1 && hand.pointerX <= 1 && hand.pointerY >= -1 && hand.pointerY <= 1,
        `${label} kept its cursor in the controller envelope`);
      assert.ok(hand.roll >= CONFIG.arm.rollMin && hand.roll <= CONFIG.arm.rollMax,
        `${label} kept roll inside ${CONFIG.arm.rollMin}..${CONFIG.arm.rollMax}`);
      assert.ok(hand.wristBend >= 0 && hand.wristBend <= 1, `${label} kept wrist bend anatomical`);
    }
  };
  for (const [index, policy] of POLICIES.entries()) {
    const inner = policy.create(500 + index);
    const mind = { name: inner.name, decide(view, dt) { const intent = inner.decide(view, dt); inspect(intent, policy.name); return intent; } };
    const result = runBout({
      left: policy.name, right: "swinger", seeds: [500 + index, 900 + index], leftMind: mind,
      leftLoadout: loadoutFor[policy.name],
    });
    assert.ok(result.ending === "exhausted" || result.ending === "time", `${policy.name} completed a full bout`);
  }
});

/**
 * A target that does not move the contacted limb is a target in name only.
 *
 * This is asserted on `HitReport.key` out of a real Havok bout rather than on
 * `intent.pointerY`, and the difference is the whole point. A cursor elevation
 * is the *reachable* quantity -- it is written by the aim and read back by the
 * test that wrote it, so it goes green whether or not the blade ends up
 * anywhere new. Session 16 shipped exactly that shape of test twice. The limb
 * the sword actually bit is the quantity the decision is about, and only the
 * report knows it.
 *
 * **This names `thrust` because the rule holds for `thrust`, and it was called
 * `a_requested_high_or_low_target_reaches_that_body_region_without_fallback`
 * while covering one of four actions.** Measured on the same fixture, `cut` and
 * `punch` do not obey a named region at all -- a cut aimed `high` takes a 0.045
 * head share against the measured aim's 0.071, which is *lower* -- and `shoot`
 * lands two to four body contacts a bout, which is too thin to be a claim about
 * anything. The four tables and the structural reason are in
 * `docs/measurements.md` under "Session 17 Stage B"; the short version is that a
 * thrust and a shot are *points*, where the aim is where the tip is sent, and a
 * cut and a punch are *strokes*, where the aim only seeds the centre of an arc
 * that sweeps +-0.62 and +-0.50 in cursor units around it.
 *
 * Measured on this fixture, thrusting with a sword against an idle warrior
 * (`head`, `torso`, and the `pelvis`/`thigh`/`shin` group, contacts per bout):
 *
 * | target        | head | torso | low group |
 * | ---           | ---: | ---:  | ---:      |
 * | as-measured   |   13 |   114 |        17 |
 * | high          |   76 |    66 |        15 |
 * | vital         |    6 |   295 |        32 |
 * | low           |    1 |    24 |       112 |
 *
 * The bands below are wide against those figures on purpose -- this is a
 * physics bout and the claim is about the distribution, not about a count --
 * but they are far inside what an ignored target produces, which is three
 * copies of the `as-measured` row.
 */
test("a_thrust_at_a_named_high_or_low_target_reaches_that_body_region", () => {
  const HIGH_KEYS = ["head"];
  const LOW_KEYS = ["pelvis", "thighL", "thighR", "shinL", "shinR"];
  const thrusting = (target, seen) => {
    let option = null;
    return { name: `thrust-${target}`, decide(view, dt) {
      if (!option || option.done(view)) {
        option = handActionOption("thrust", { effector: "primary", target, stance: "action-default" });
        option.enter(view);
      }
      const action = option.decide(view, dt);
      seen.add(action.actingHand);
      return composeTactic(view, "close", "thrust", movementIntent("close", view), action);
    } };
  };
  const distribution = (target) => {
    const keys = {}; const hands = new Set(); const filed = { primary: 0, secondary: 0 };
    runBout({
      left: "duelist", right: "idle", seeds: [11, 22],
      leftLoadout: { primary: "sword", secondary: "empty" },
      rightLoadout: { primary: "empty", secondary: "empty" },
      leftMind: thrusting(target, hands),
      onEvent(event) {
        if (event.side !== "left" || event.blocked) return;
        filed[event.hand] += 1;
        keys[event.report.key] = (keys[event.report.key] ?? 0) + 1;
      },
    });
    const count = (group) => group.reduce((sum, key) => sum + (keys[key] ?? 0), 0);
    const body = count(HIGH_KEYS) + count(["torso"]) + count(LOW_KEYS);
    // The arm that did the work, from the thing reported rather than from the
    // reporter. Reading `actingHand` back is bookkeeping: `reset()` writes it
    // from the literal effector, so it can only ever answer "primary" or throw,
    // and it is kept only because the throw is real -- `decide` refuses a named
    // hand that has been severed. `Combat` stamps every report with the hand
    // whose striker filed it, which is the quantity a fallback would move: on a
    // sword+empty body a silent switch to the off hand arrives here as `empty`
    // contacts doing the scoring. Measured, the off hand files 4 of 165 and 2 of
    // 158, which is a covering fist brushing a body it is held in front of.
    //
    // The real proof that a request for one hand is never executed on the other
    // is `a_dual_wielder_executes_the_effector_the_decision_named` in
    // `tests/options.test.mjs`: a shield in the primary and a sword in the
    // secondary is the loadout the old `[preferred, other]` search redirected
    // silently, and this fixture cannot express it because both its hands can
    // thrust.
    assert.deepEqual([...hands], ["primary"], `${target} was executed by a hand nobody asked for`);
    assert.ok(filed.secondary / (filed.primary + filed.secondary) < 0.05,
      `${target}: the off hand filed ${filed.secondary} of ${filed.primary + filed.secondary} contacts`);
    assert.ok(body > 40, `${target} landed only ${body} body contacts, which is too few to read`);
    return { high: count(HIGH_KEYS) / body, low: count(LOW_KEYS) / body, keys };
  };

  const high = distribution("high");
  const low = distribution("low");
  assert.ok(high.high > 0.25, `high aimed at the head and got ${JSON.stringify(high.keys)}`);
  assert.ok(low.low > 0.55, `low aimed at the legs and got ${JSON.stringify(low.keys)}`);
  // And against each other, which is what an ignored target cannot survive: it
  // would make these two bouts the same bout.
  assert.ok(high.high > low.high * 4, `${high.high} head high against ${low.high} low`);
  assert.ok(low.low > high.low * 4, `${low.low} legs low against ${high.low} high`);
});

test("cosmetics_disabled_and_enabled_produce_identical_fight_records", async () => {
  const fight = async (enabled) => {
    const events = [];
    const result = runBout({
      left: "duelist", right: "swinger", seeds: [0x14c0ffee, 0x51debeef],
      physics: await freshHavok(),
      onEvent: (event) => events.push({ side: event.side, type: event.type,
        weapon: event.report?.weapon, key: event.report?.key, damage: event.report?.damage,
        severed: event.report?.severed, at: event.report?.at }),
      onSample({ left, right }) {
        for (const fighter of [left, right]) for (const mesh of fighter.costume) mesh.setEnabled(enabled);
      },
    });
    return { result, events };
  };
  assert.deepEqual(await fight(false), await fight(true));
});

test("a_hundred_arrows_and_twenty_five_rebuilds_return_all_resource_counts_to_baseline", async (t) => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  t.after(() => engine.dispose());
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(wasm) }));
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  plugin._integrationLiveConstraints = 0;
  const initConstraint = plugin.initConstraint.bind(plugin);
  plugin.initConstraint = (...args) => {
    const constraint = args[0];
    const before = constraint._pluginData?.length ?? 0;
    initConstraint(...args);
    plugin._integrationLiveConstraints += (constraint._pluginData?.length ?? 0) - before;
  };
  const disposeConstraint = plugin.disposeConstraint.bind(plugin);
  plugin.disposeConstraint = (constraint) => {
    plugin._integrationLiveConstraints -= constraint._pluginData?.length ?? 0;
    disposeConstraint(constraint);
  };
  scene.getPhysicsEngine().setSubTimeStep(1000 / CONFIG.world.physicsHz);
  const materials = materialsFor(scene);
  const ground = MeshBuilder.CreateBox("integration.ground", { width: 60, height: 1, depth: 60 }, scene);
  ground.position.y = -0.5;
  const aggregate = new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);
  aggregate.shape.filterMembershipMask = LAYER.WORLD; aggregate.shape.filterCollideMask = COLLIDES.WORLD;
  // Babylon installs one engine-owned observer lazily on the first physics
  // advance. Warm that invariant up before calling it a rebuild leak.
  scene._renderId += 1; scene._advancePhysicsEngineStep(FRAME_MS);
  const loadouts = [
    { primary: "sword", secondary: "empty" }, { primary: "sword", secondary: "shield" },
    { primary: "axe", secondary: "shield" }, { primary: "sword", secondary: "sword" },
    { primary: "bow", secondary: "empty" },
  ];
  const rebuildFighters = (rebuild) => {
    const left = new Fighter(scene, { side: "left", origin: Vector3.Zero(), facing: 0,
      mind: policyMind("duelist", rebuild), loadout: loadouts[Math.abs(rebuild) % loadouts.length] }, materials);
    const right = new Fighter(scene, { side: "right", origin: new Vector3(0, 0, CONFIG.fighter.separation), facing: Math.PI,
      mind: policyMind("swinger", rebuild + 1000), loadout: loadouts[(Math.abs(rebuild) + 1) % loadouts.length] }, materials);
    let clock = 0;
    const control = () => { stepPair(left, right, FIXED, clock); clock += FIXED; };
    scene.onBeforePhysicsObservable.add(control);
    scene._renderId += 1; scene._advancePhysicsEngineStep(FRAME_MS);
    scene.onBeforePhysicsObservable.removeCallback(control);
    left.dispose(); right.dispose();
  };
  // The first articulated build makes Havok install one persistent engine-side
  // observer. It belongs to the warmed scene, not to a bout, so establish the
  // rebuild baseline after that one-time initialization.
  rebuildFighters(-1);
  const baseline = census(scene);
  for (let rebuild = 0; rebuild < 25; rebuild += 1) {
    rebuildFighters(rebuild);
    assert.deepEqual(census(scene), baseline, `fighter rebuild ${rebuild + 1} returned every counted resource`);
  }

  const layers = layersFor("left");
  const quiver = new Quiver(scene, { name: "integration.quiver", layer: layers.arrow,
    collidesWith: layers.arrowCollides }, materials);
  let pending = null;
  const driver = scene.onBeforePhysicsObservable.add(() => {
    quiver.step(FIXED);
    if (pending) { quiver.loose(pending.from, pending.along, pending.speed); pending = null; }
  });
  const pooled = census(scene);
  for (let shot = 0; shot < 100; shot += 1) {
    pending = { from: new Vector3(0, 4, -8), along: new Vector3(0, 0, 1), speed: 45 };
    for (let frame = 0; frame < 6; frame += 1) {
      scene._renderId += 1; scene._advancePhysicsEngineStep(FRAME_MS);
    }
  }
  assert.deepEqual(census(scene), pooled, "one prebuilt arrow pool stayed flat across a hundred launches");
  scene.onBeforePhysicsObservable.remove(driver); quiver.dispose();
  assert.deepEqual(census(scene), baseline, "disposing the quiver returned trails, bodies and observers to baseline");
});
