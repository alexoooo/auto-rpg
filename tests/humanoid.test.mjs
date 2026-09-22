import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Ray } from "@babylonjs/core/Culling/ray.js";
import { createHeadlessArena } from "./harness/golem-headless-arena.mjs";
import { buildGolemStand, golemLayers } from "../src/golem/stand.ts";
import { golemModule } from "../src/golem/registry.ts";
import { DungeonRun } from "../src/dungeon/run.ts";
import { neutralIntent } from "../src/dungeon/commands.ts";
import { ARM_LIMITS, ARM_REST, armForward, rotationError, solveArm } from "../src/golem/humanoid/kinematics.ts";
import { humanSetup } from "../src/golem/humanoid/presets.ts";
import { loadHumanAssets } from "../src/golem/humanoid/appearance.ts";
import { turnHand } from "../src/golem/humanoid/orientation.ts";
import { freshHavok, runBout } from "./harness/bout-runner.mjs";

const advance = (scene, frames) => {
  for (let i = 0; i < frames; i++) {
    scene._renderId++;
    scene._advancePhysicsEngineStep(1000 / 60);
  }
};

test("anatomical IK reaches independent position and orientation on both sides", () => {
  for (const sign of [-1, 1]) {
    const goal = armForward([sign * 0.4, -0.8, sign * 0.35, -1.2, sign * 0.6, 0.4, sign * 0.2]);
    const result = armForward(solveArm(goal.point, goal.rotation, ARM_REST, 160));
    assert.ok(Vector3.Distance(goal.point, result.point) < 0.001);
    assert.ok(rotationError(goal.rotation, result.rotation).length() < 0.003);
    const turned = goal.rotation.multiply(Quaternion.RotationAxis(Vector3.Up(), sign * 0.25));
    const q = solveArm(goal.point, turned, ARM_REST, 160), pose = armForward(q);
    assert.ok(Vector3.Distance(goal.point, pose.point) < 0.002, "rotation must not require moving the hand");
    assert.ok(rotationError(turned, pose.rotation).length() < 0.006);
    q.forEach((angle, i) => assert.ok(angle >= ARM_LIMITS[i][0] && angle <= ARM_LIMITS[i][1]));
  }
  const impossible = solveArm(new Vector3(10, 10, 10), Quaternion.Identity(), ARM_REST, 100);
  impossible.forEach((angle, i) => assert.ok(Number.isFinite(angle) && angle >= ARM_LIMITS[i][0] && angle <= ARM_LIMITS[i][1]));
});

test("direct hand control rotates each orientation axis independently", () => {
  const rotations = [];
  for (const axes of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
    const hand = { ...neutralIntent().primary, orientation: { x: 0, y: 0, z: 0, w: 1 } };
    turnHand(hand, ...axes, 0.25);
    const q = new Quaternion(hand.orientation.x, hand.orientation.y, hand.orientation.z, hand.orientation.w);
    assert.ok(Math.abs(q.length() - 1) < 1e-8);
    assert.ok(rotationError(q, Quaternion.Identity()).length() > 0.4);
    rotations.push(q);
  }
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(rotationError(rotations[i], rotations[j]).length() > 0.5);
  const legacy = neutralIntent().primary, before = { ...legacy };
  turnHand(legacy, 1, 1, 1, 0.25); assert.deepEqual(legacy, before);
});

for (const terminal of ["blade", "plate", "mace", "whip", "fist"]) {
  test(`anatomical ${terminal}: mirrored loaded arms sweep, settle and release`, async () => {
    const arena = await createHeadlessArena({ populateDefaultGeometry: false });
    const { scene } = arena, stand = buildGolemStand(scene, { side: "left" });
    const modules = ["primary", "secondary"].map(slot => golemModule(`effector.anatomical.${terminal}`).build({
      scene, side: "left", name: `test.${slot}`, socket: stand.socket(slot),
      layers: golemLayers("left"), materials: stand.materials,
    }));
    const command = neutralIntent(); let clock = 0;
    const observer = scene.onBeforePhysicsObservable.add(() => {
      clock += 1 / 240;
      const sweep = Math.min(1, Math.max(0, (clock - 1) / 0.3));
      command.primary.pointerX = 0.3 * sweep; command.secondary.pointerX = -0.3 * sweep;
      command.primary.pointerY = command.secondary.pointerY = 0.6 * sweep;
      modules.forEach(m => { m.command(command); m.step(1 / 240); });
    });
    try {
      // Keep bodies awake: a sleeping hinge would conceal steady-state instability.
      for (const m of modules) for (const p of m.parts) scene.getPhysicsEngine().getPhysicsPlugin().setActivationControl(p.part.body, 1);
      advance(scene, 60); const starts = modules.map(m => m.view().tip.clone());
      advance(scene, 300);
      modules.forEach((m, i) => {
        const v = m.view();
        assert.equal(v.axes.length, 7);
        assert.ok(Vector3.Distance(starts[i], v.tip) > 0.08, "the sweep must actually move the loaded arm");
        assert.ok(v.anchorStray < 0.03, `${terminal} hand stray ${v.anchorStray}`);
        assert.ok(v.orientation && Math.abs(v.orientation.length() - 1) < 1e-5);
        for (const axis of v.axes) assert.ok(Math.abs(axis.commanded - axis.achieved) < 0.08, axis.id);
      });
      modules.forEach(m => m.sever()); advance(scene, 30);
      assert.ok(modules.every(m => m.parts.every(p => p.part.mesh.position.asArray().every(Number.isFinite))));
    } finally {
      scene.onBeforePhysicsObservable.remove(observer); modules.forEach(m => m.dispose()); stand.dispose(); arena.dispose();
    }
  });
}

test("human maul takes its second grip, and the shared biped walks without losing health", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const run = new DungeonRun(arena.scene, 42, "human-maul", false);
  const observer = arena.scene.onBeforePhysicsObservable.add(() => run.step(1 / 240));
  try {
    advance(arena.scene, 300);
    const view = run.hero.body.effectors.primary.module.view();
    assert.notEqual(view.gripStray, null, "a missing second grip must fail");
    assert.ok(view.gripStray < 0.015);
    const hands = run.hero.body.visualParts().filter(p => p.slot === "primary" && p.id.endsWith(".hand"));
    assert.equal(hands.length, 2);
    assert.ok(Vector3.Distance(hands[0].host.position, hands[1].host.position) > 0.07, "the two fists must have separate grips");
    const start = run.hero.body.feetPosition().clone();
    run.commands.setMode({ keyboard: true, facing: false }); run.commands.right = 1;
    advance(arena.scene, 60);
    assert.ok(Vector3.Distance(start, run.hero.body.feetPosition()) > 0.5);
    assert.equal(run.hero.body.vitality, 1);
  } finally { arena.scene.onBeforePhysicsObservable.remove(observer); run.dispose(); arena.dispose(); }
});

test("human anatomy wounds while equipment parries with its real kind; severing removes the parry", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const run = new DungeonRun(arena.scene, 42, "human-warrior", false);
  try {
    const body = run.hero.body, arm = body.limbs.find(p => p.key.endsWith("primary.upper"));
    const blade = body.limbs.find(p => p.key.endsWith("primary.blade"));
    const plate = body.limbs.find(p => p.key.endsWith("secondary.plate"));
    assert.ok(arm && blade && plate);
    assert.equal(arm.guarding, false); assert.equal(body.limbFor(arm.part.body), arm);
    assert.equal(body.limbFor(blade.part.body), undefined);
    assert.deepEqual(body.parriedBy(blade.part.body), { kind: "sword" });
    assert.deepEqual(body.parriedBy(plate.part.body), { kind: "shield" });
    assert.equal(blade.vitalityWeight, 0);
    assert.ok(body.applyDamage(arm, 10) > 0);
    body.sever(arm, Vector3.Right()); assert.equal(body.parriedBy(blade.part.body), null);
    body.describe(body.view.self);
    assert.equal(body.view.self.hands.primary.lost, true);
  } finally { run.dispose(); arena.dispose(); }
});

test("authored human policy closes and produces damaging sword contacts", async () => {
  const result = runBout({ left: "humanoid-duelist", right: "idle", leftGolem: humanSetup(), rightGolem: humanSetup(),
    locomotionMode: "supported", seeds: [42, 77], maxSeconds: 15, separation: 2.6, physics: await freshHavok() });
  assert.ok(result.left.hits > 5);
  assert.ok(result.left.damage > 0.05, "motion and weapon scraping alone must not pass");
  assert.ok(result.behaviour.right.vitality < 0.999);
});

test("warrior skin follows achieved bodies, is pickable away from origin and disposes cleanly", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(await readFile(new URL("../public/assets/humanoid/warrior.glb", import.meta.url)));
  try { await loadHumanAssets(); } finally { globalThis.fetch = originalFetch; }
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const run = new DungeonRun(arena.scene, 42, "human-warrior", false);
  let disposed = false;
  try {
    arena.scene._frameId++; arena.scene._renderId++;
    arena.scene.onBeforeRenderObservable.notifyObservers(arena.scene);
    const meshes = arena.scene.meshes.filter(m => m.metadata?.humanSlot === "torso");
    assert.ok(meshes.length > 0);
    const p = run.hero.body.visualParts().find(p => p.slot === "torso" && p.id.endsWith(".core"));
    const x = p.host.position.x, z = p.host.position.z;
    const hit = arena.scene.pickWithRay(new Ray(new Vector3(x, 1.2, z - 3), Vector3.Forward(), 6), m => meshes.includes(m));
    assert.ok(hit.hit, "picking must hit the deformed torso, not its bind pose at world origin");
    const before = meshes[0].getBoundingInfo().boundingBox.centerWorld.clone();
    p.host.position.x += 0.4; // Achieved-transform fixture, no command or animation involved.
    arena.scene._frameId++; arena.scene._renderId++; arena.scene.onBeforeRenderObservable.notifyObservers(arena.scene);
    assert.ok(meshes[0].getBoundingInfo().boundingBox.centerWorld.x - before.x > 0.2);
    run.dispose(); disposed = true;
    assert.ok(meshes.every(m => m.isDisposed()));
  } finally { if (!disposed) run.dispose(); arena.dispose(); }
});
