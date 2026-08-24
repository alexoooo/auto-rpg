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
  const COMBAT_FIELDS = ["driving", "forward", "posture", "primary", "secondary", "strafe", "turn"];
  const inspect = (intent, label) => {
    assert.deepEqual(Object.keys(intent).sort(), COMBAT_FIELDS, `${label} asked for a host field`);
    const axes = [intent.forward, intent.strafe, intent.turn,
      intent.posture.trunkLean, intent.posture.trunkTwist, intent.posture.crouch];
    for (const value of axes) assert.ok(Number.isFinite(value), `${label} returned a finite body axis`);
    for (const value of [intent.forward, intent.strafe, intent.turn, intent.posture.trunkLean, intent.posture.trunkTwist]) {
      assert.ok(value >= -1 && value <= 1, `${label} kept a normalized signed axis: ${value}`);
    }
    assert.ok(intent.posture.crouch >= 0 && intent.posture.crouch <= 1, `${label} kept crouch anatomical`);
    assert.ok(intent.driving === "primary" || intent.driving === "secondary", `${label} named a real hand`);
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
