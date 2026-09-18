import assert from "node:assert/strict";
import test from "node:test";

import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { Combat } from "../src/combat.ts";
import { CONFIG } from "../src/config.ts";
import { Fighter, stepPair } from "../src/fighter.ts";
import { policyMind, idleMind } from "../src/mind.ts";
import { LAYER } from "../src/physics.ts";
import { flatSupportedWorldRegistry } from "../src/supported-locomotion-production.ts";
import { createHeadlessArena } from "../scripts/golem-headless-arena.mjs";

const FIXED = 1 / CONFIG.world.physicsHz;

const materialsFor = (scene) => {
  const material = new StandardMaterial("supported-fist.material", scene);
  return { owner: material, fighter: {
    flesh: material, cloth: material, steel: material, leather: material,
    brass: material, hide: material, wood: material, arrowAccent: material,
  } };
};

const liveObservers = (observable) => observable.observers
  .filter((observer) => !observer._willBeUnregistered).length;

async function supportedPunch(disableTrigger) {
  const arena = await createHeadlessArena();
  const materials = materialsFor(arena.scene);
  const registry = flatSupportedWorldRegistry();
  const physics = arena.scene.getPhysicsEngine();
  const plugin = physics.getPhysicsPlugin();
  const baseline = { bodies: physics.getBodies().length,
    before: liveObservers(arena.scene.onBeforePhysicsObservable),
    triggers: liveObservers(plugin.onTriggerCollisionObservable) };
  let left; let right; let leftCombat; let rightCombat;
  try {
    left = new Fighter(arena.scene, { side: "left", origin: Vector3.Zero(), facing: 0,
      mind: policyMind("duelist", 91), loadout: { primary: "empty", secondary: "empty" },
      locomotionMode: "supported", locomotionWorld: registry }, materials.fighter);
    right = new Fighter(arena.scene, { side: "right", origin: new Vector3(0, 0, 1.10), facing: Math.PI,
      mind: idleMind(), loadout: { primary: "empty", secondary: "empty" },
      locomotionMode: "supported", locomotionWorld: registry }, materials.fighter);

    const reports = [];
    leftCombat = new Combat("left", left.strikers, (event) => reports.push(event));
    rightCombat = new Combat("right", right.strikers);
    leftCombat.attach(right); rightCombat.attach(left);
    const leftFists = left.strikers.filter(({ kind }) => kind === "empty");
    const trigger = leftFists[0].nonSolvingTrigger;
    assert.ok(trigger, "a supported empty hand publishes a real trigger");
    assert.equal(trigger.shape.isTrigger, true, "the scoring shape is non-solving");
    assert.notEqual(trigger.body, left.arms.primary.hand.body,
      "the trigger never changes the real hand body's solver role");
    assert.equal(left.arms.primary.hand.shape.filterMembershipMask, LAYER.LEFT_SUPPORTED_ARM,
      "passive hand anatomy stays on the supported non-opponent layer");
    assert.equal(left.arms.primary.hand.shape.filterCollideMask &
      (LAYER.RIGHT_SUPPORTED_TRUNK | LAYER.RIGHT_SUPPORTED_ARM | LAYER.RIGHT_SUPPORTED_LEG), 0,
    "the real hand cannot reintroduce solving anatomy contact beside its trigger");
    if (disableTrigger) {
      for (const fist of leftFists) fist.nonSolvingTrigger.shape.filterCollideMask = 0;
    }

    for (let step = 0; step < 5 * CONFIG.world.physicsHz; step += 1) {
      stepPair(left, right, FIXED, leftCombat.now);
      arena.scene._renderId += 1;
      arena.scene._advancePhysicsEngineStep(1000 * FIXED);
      leftCombat.advance(FIXED); rightCombat.advance(FIXED);
    }
    return { reports: reports.filter(({ report }) => report.weapon === "empty"), trigger,
      live: { bodies: physics.getBodies().length,
        before: liveObservers(arena.scene.onBeforePhysicsObservable),
        triggers: liveObservers(plugin.onTriggerCollisionObservable) }, baseline };
  } finally {
    leftCombat?.dispose(); rightCombat?.dispose();
    left?.dispose(); right?.dispose();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual({ bodies: physics.getBodies().length,
      before: liveObservers(arena.scene.onBeforePhysicsObservable),
      triggers: liveObservers(plugin.onTriggerCollisionObservable) }, baseline,
    "trigger bodies and both observer families leave with their Fighter and Combat owners");
    materials.owner.dispose(false, false);
    arena.dispose();
  }
}

test("supported_bare_fists_score_through_real_non_solving_triggers", async () => {
  const working = await supportedPunch(false);
  assert.ok(working.reports.length > 0, "a shipped bare-hand policy lands a physical supported punch");
  assert.ok(working.reports.some(({ report }) => report.damage > 0),
    "the trigger retains the real fist speed and ordinary scoring path");
  assert.ok(working.reports.every(({ report }) => report.solverImpulse === 0),
    "a non-solving sensor never invents a Havok impulse");
  assert.ok(working.reports.every(({ report }) => [report.point.x, report.point.y, report.point.z,
    report.velocity.x, report.velocity.y, report.velocity.z].every(Number.isFinite)),
  "every trigger report retains a finite physical point and real hand velocity");

  const muted = await supportedPunch(true);
  assert.equal(muted.reports.length, 0,
    "removing the trigger mask mutation removes every supported fist hit");
});
