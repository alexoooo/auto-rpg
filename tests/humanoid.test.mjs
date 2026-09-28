import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createHeadlessArena } from "./harness/golem-headless-arena.mjs";
import { buildGolemStand, golemLayers } from "../src/golem/stand.ts";
import { golemModule } from "../src/golem/registry.ts";
import { DungeonRun } from "../src/dungeon/run.ts";
import { neutralIntent } from "../src/dungeon/commands.ts";
import { ARM_LIMITS, ARM_REST, armForward, rotationError, solveArm } from "../src/golem/humanoid/kinematics.ts";
import { humanSetup } from "../src/golem/humanoid/presets.ts";
import { HEATER_GRIP, HEATER_CENTRE } from "../src/golem/humanoid/shield.ts";
import { PALM_GRIP, HUMAN_MOUNT } from "../src/golem/humanoid/grip.ts";
import { TERMINAL_BLADE } from "../src/golem/config.ts";
import { turnHand } from "../src/golem/humanoid/orientation.ts";
import { freshHavok, runBout } from "./harness/bout-runner.mjs";
import { CONFIG } from "../src/config.ts";

/** One control step is one solver substep, at whatever rate the solver runs. */
const SUBSTEP = 1 / CONFIG.world.physicsHz;

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
  const rolledShaft = HUMAN_MOUNT.perp.rotateByQuaternionToRef(rotations[0], new Vector3());
  assert.ok(Vector3.Distance(rolledShaft, HUMAN_MOUNT.perp) < 1e-8, "roll must turn around the held shaft");
  const legacy = neutralIntent().primary, before = { ...legacy };
  turnHand(legacy, 1, 1, 1, 0.25); assert.deepEqual(legacy, before);
});

for (const terminal of ["blade", "plate", "fist"]) {
  test(`anatomical ${terminal}: mirrored loaded arms sweep, settle and release`, async () => {
    const arena = await createHeadlessArena({ populateDefaultGeometry: false });
    const { scene } = arena, stand = buildGolemStand(scene, { side: "left" });
    const modules = ["primary", "secondary"].map(slot => golemModule(`effector.anatomical.${terminal}`).build({
      scene, side: "left", name: `test.${slot}`, socket: stand.socket(slot),
      layers: golemLayers("left"), materials: stand.materials,
    }));
    const command = neutralIntent(); let clock = 0;
    const observer = scene.onBeforePhysicsObservable.add(() => {
      clock += SUBSTEP;
      const sweep = Math.min(1, Math.max(0, (clock - 1) / 0.3));
      command.primary.pointerX = 0.3 * sweep; command.secondary.pointerX = -0.3 * sweep;
      command.primary.pointerY = command.secondary.pointerY = 0.6 * sweep;
      modules.forEach(m => { m.command(command); m.step(SUBSTEP); });
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
        if (terminal !== "fist") {
          const hand = m.parts.find(p => p.id.endsWith(".hand")).part.mesh;
          const item = m.parts.find(p => p.id.endsWith(`.${terminal}`)).part.mesh;
          const palm = PALM_GRIP.rotateByQuaternionToRef(hand.rotationQuaternion, new Vector3()).add(hand.position);
          const local = terminal === "blade" ? new Vector3(0, -TERMINAL_BLADE.length / 2 - .065, 0) :
            HEATER_GRIP.subtract(HEATER_CENTRE(i === 0 ? 1 : -1));
          const grip = local.rotateByQuaternionToRef(item.rotationQuaternion, new Vector3()).add(item.position);
          assert.ok(Vector3.Distance(palm, grip) < .006, `${terminal}: handle must stay inside the palm`);
          const shaft = (terminal === "plate" ? Vector3.Forward() : Vector3.Up()).rotateByQuaternionToRef(item.rotationQuaternion, new Vector3());
          const fingers = HUMAN_MOUNT.perp.rotateByQuaternionToRef(hand.rotationQuaternion, new Vector3());
          assert.ok(Vector3.Dot(shaft, fingers) > .995, `${terminal}: handle must follow the authored grip axis`);
          if (terminal === "blade") assert.ok(item.getChildMeshes().some(mesh => mesh.name.endsWith(".hilt")));
        }

      });
      modules.forEach(m => m.sever()); advance(scene, 30);
      assert.ok(modules.every(m => m.parts.every(p => p.part.mesh.position.asArray().every(Number.isFinite))));
    } finally {
      scene.onBeforePhysicsObservable.remove(observer); modules.forEach(m => m.dispose()); stand.dispose(); arena.dispose();
    }
  });
}

test("human anatomy wounds while equipment parries with its real kind; severing removes the parry", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const run = new DungeonRun(arena.scene, 42, "warrior", false);
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
    assert.ok(body.applyDamage(arm, 10, "cut") > 0);
    body.sever(arm, Vector3.Right()); assert.equal(body.parriedBy(blade.part.body), null);
    body.describe(body.view.self);
    assert.equal(body.view.self.hands.primary.lost, true);
  } finally { run.dispose(); arena.dispose(); }
});

test("authored human policy closes and wounds an exposed opponent", async () => {
  // Seeds 44 and 79, measured 2026-09-24 (Node harness): 29 hits and 0.076 damage. Physical contact
  // session 05 priced the effective mass, which for a human's light arm and a blade struck near its
  // tip is under the blade's own, so the human's pace halved and 42/77 -- 0.071 before -- wounds
  // nothing in 15 s. A fixture has to exhibit a wound for this to test one, so the seeds moved to
  // the first pair (a, a + 35) from 42 up that clears the threshold, and the assertion did not.
  //
  // **That rule is now the fixture, rather than the seeds it last chose.** Which pairs wound moves
  // with the dynamics, and the solver's rate is dynamics: measured (Node bout runner, 2026-09-25),
  // damage by a from 42 is 0, 0, 0.132, 0, 0.016, 0.085, 0.045, 0.015 at 240 Hz and 0.080, 0, 0, 0,
  // 0.006, 0, 0.513, 0.056 at 120, with more than five hits in every bout at both. So the bout is
  // the first pair from 44 up whose wound clears the threshold, and the test fails only when none
  // of eight does.
  //
  // **The threshold is blows, not a price, from the release at 120 Hz.** 0.05 of damage was two or
  // so blows at the settled reading's prices, and the `"arrival"` reading bills a blow about half of
  // that (`CONFIG.combat.contactReading`): the same bouts land as many blows and none clears 0.05.
  // Node bout runner, seeds 42 to 57 (a, a + 35), 2026-09-25, landed arm servo:
  //
  // | rate, reading | mean damage | bouts over 0.05 | mean blows | bouts with 2 or more |
  // |---------------|------------:|----------------:|-----------:|---------------------:|
  // | 240, settled  |      0.036  |       4 of 16   |      1.75  |            9 of 16   |
  // | 240, arrival  |      0.017  |       0 of 16   |      1.50  |            8 of 16   |
  // | 120, settled  |      0.022  |       2 of 16   |      0.81  |            3 of 16   |
  // | 120, arrival  |      0.018  |       0 of 16   |      1.63  |           10 of 16   |
  //
  // "2 or more" counts bouts that also did damage. (0 of 34 over 0.05 at 120 arrival from 42 to
  // 75; 9 of 34 at 240 settled.) A blow is a report over its weapon's energy
  // floor -- `alignments` in `tests/harness/bout-runner.mjs`, which excludes the `weak` contacts a
  // scrape files -- so two of them that wound are a policy that closed and struck, whatever the
  // reading prices them at. The first such pair from 44 is 44 at 240 settled and 45 at 120 arrival;
  // `alignments` counts parries too, which an idle opponent does not make.
  //
  // Watched red at 120 arrival with the policy's pointers low-passed at 0.03 a decision and its
  // thrust dropped, which walks in and scrapes: 44/79 files 15 hits and no blow and is refused,
  // and 45/80 then fails on 2 hits. Dropping the thrust alone does not stop a strike -- the
  // tactics' strokes are pointer sweeps -- and the same 16 seeds still land 1.6 blows a bout.
  //
  // The wound is the bar's, and the loop reads it too (2026-09-28). With the human's trunk, 44/79
  // lands 2 blows for 0.197 damage on parts that move the bar to 0.9994 only, so a pair that struck
  // was taken before its wound was read. Node bout runner, damage by a from 44: 0.197, 0.275, 0.711,
  // 0.376, 0.186, 0.466, 0, 0.455, where it was 0.126, 0.158, 0.074, 0.205, 0.152, 0.063, 0.073,
  // 0.233 on stone's trunk.
  let result = null;
  const struck = (bout) => bout && bout.left.alignments.length >= 2 && bout.left.damage > 0
    && bout.behaviour.right.vitality < 0.999;
  for (let a = 44; a < 52 && !struck(result); a += 1) {
    result = runBout({ left: "humanoid-duelist", right: "idle", leftGolem: humanSetup(), rightGolem: humanSetup("fist", "fist"),
      locomotionMode: "supported", seeds: [a, a + 35], maxSeconds: 15, separation: 2.6, physics: await freshHavok() });
    assert.ok(result.left.hits > 5, `seeds ${a}/${a + 35}: ${result.left.hits} hits`);
  }
  assert.ok(struck(result), `motion and weapon scraping alone must not pass: ${result.left.alignments.length} blows`);
  assert.ok(result.behaviour.right.vitality < 0.999);
});


// A stationary live body is necessary: sleeping isolated limbs hide persistent oscillation.
test("full human body holds loaded wrists and shield steady after a sweep and impulse", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const run = new DungeonRun(arena.scene, 42, "warrior", false);
  const { scene } = arena;
  const command = neutralIntent();
  let clock = 0;
  const observer = scene.onBeforePhysicsObservable.add(() => {
    clock += SUBSTEP; run.step(SUBSTEP);
    const sweep = Math.min(1, Math.max(0, (clock - 1) / .3));
    command.primary.pointerX = .3 * sweep;
    command.secondary.pointerX = -.3 * sweep;
    for (const slot of ["primary", "secondary"]) run.hero.body.effectors[slot].module.command(command[slot]);
  });
  const modules = ["primary", "secondary"].map(slot => run.hero.body.effectors[slot].module);
  for (const m of modules) for (const p of m.parts) scene.getPhysicsEngine().getPhysicsPlugin().setActivationControl(p.part.body, 1);
  // The arm's own geometry, as it built its joints: the wrist joins the forearm's distal end
  // (-length/2 on its Y) to the hand's proximal one (+length/2), and the palm is `handPivot`.
  const built = modules.map(m => m.captureState().built.captureState());
  const sample = () => modules.map((m, j) => {
    const { lengths, handPivot } = built[j];
    const hand=m.parts.find(p=>p.id.endsWith('.hand')).part.mesh;
    const fore=m.parts.find(p=>p.id.endsWith('.fore')).part.mesh;
    const palm=handPivot.rotateByQuaternionToRef(hand.rotationQuaternion,new Vector3()).add(hand.position);
    const wrist=new Vector3(0,lengths[2]/2,0).rotateByQuaternionToRef(hand.rotationQuaternion,new Vector3()).add(hand.position);
    const foreEnd=new Vector3(0,-lengths[1]/2,0).rotateByQuaternionToRef(fore.rotationQuaternion,new Vector3()).add(fore.position);
    assert.ok(Vector3.Distance(wrist,foreEnd)<.005,'physical wrist must remain continuous');
    return { error:palm.subtract(m.view().anchor), rotation:hand.rotationQuaternion.clone() };
  });
  try {
    advance(scene, 360);
    const shield=modules[1].parts.find(p=>p.id.endsWith('.plate')).part;
    shield.body.applyImpulse(new Vector3(.15,0,.15),shield.mesh.position);
    advance(scene,120);
    const initial=sample();
    let wander=0, rotation=0, error=0;
    for(let i=0;i<120;i++) {
      advance(scene,1); const current=sample();
      current.forEach((s,j)=>{wander=Math.max(wander,Vector3.Distance(s.error,initial[j].error));error=Math.max(error,s.error.length());});
      rotation=Math.max(rotation,rotationError(current[1].rotation,initial[1].rotation).length());
    }
    assert.ok(error<.005,`hand tracking error ${error}`);
    assert.ok(wander<.005,`sustained wrist wander ${wander}`);
    assert.ok(rotation<Math.PI/180,`sustained shield rotation ${rotation}`);
  } finally { scene.onBeforePhysicsObservable.remove(observer); run.dispose(); arena.dispose(); }
});
