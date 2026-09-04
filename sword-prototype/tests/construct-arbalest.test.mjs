import assert from "node:assert/strict";
import test from "node:test";

import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";

import { Combat } from "../src/combat.ts";
import { CONFIG } from "../src/config.ts";
import { Construct, constructProfileForBlueprint } from "../src/construct/construct.ts";
import { ARBALEST_HARDWARE, ARBALEST_LEFT_SWORD_GUARD, ARBALEST_LOCOMOTION, ARBALEST_SENSORS,
  ARBALEST_TACTICS,
  arbalestBlueprint, arbalestControl, arbalestProgram,
  arbalestProfileMetrics, arbalestSavedConstruct } from "../src/construct/arbalest.ts";
import { humanoidBlueprint } from "../src/construct/humanoid.ts";
import { resolveConstructBindTransforms } from "../src/construct/compile.ts";
import { evaluateExpression } from "../src/construct/program.ts";
import { installedSensorsForBlueprint, SensorFrame } from "../src/construct/sensors.ts";
import { stepPair } from "../src/fighter.ts";
import { flatSupportedWorldRegistry } from "../src/supported-locomotion-production.ts";
import { postureOnlySavedConstruct,
  CONSTRUCT_WARRIOR_CURRICULUM_SEEDS,
  runConstructWarriorCurriculum } from "../scripts/construct-warrior-curriculum.mjs";
import { arbalestCurriculumDefinition } from "../scripts/arbalest-warrior-qualifier.mjs";
import { runConstructWarriorBout } from "../scripts/construct-warrior-bout.mjs";
import { createConstructHeadlessArena } from "../scripts/construct-headless-arena.mjs";
import { UNITS, unitDefinition } from "../src/units.ts";

test("the_Arbalest_reuses_the_human_scale_body_with_a_right_launcher_and_an_ordinary_left_sword", () => {
  const swordbearer = humanoidBlueprint();
  const blueprint = arbalestBlueprint();
  assert.equal(blueprint.id, "arbalest-effigy");
  assert.deepEqual(blueprint.parts, swordbearer.parts,
    "launcher clearance must not replace the proven humanoid body");
  assert.deepEqual(blueprint.joints, swordbearer.joints,
    "launcher clearance must not change the proven two-axis aiming chain");
  assert.equal(blueprint.modules.some(({ id }) => id === "effigy-sword"), false);

  const launcher = blueprint.modules.find(({ id }) => id === "effigy-arbalest");
  const magazine = blueprint.modules.find(({ id }) => id === "effigy-arbalest-magazine");
  const leftSword = blueprint.modules.find(({ id }) => id === "effigy-left-sword");
  const ordinarySword = swordbearer.modules.find(({ id }) => id === "effigy-sword");
  assert.equal(launcher.kind, "launcher");
  assert.equal(launcher.socket, "socket-sword-hand");
  assert.deepEqual(blueprint.sockets.find(({ id }) => id === launcher.socket).frame.positionM,
    [0.24, swordbearer.sockets.find(({ id }) => id === launcher.socket).frame.positionM[1], 0.20]);
  assert.equal(magazine.kind, "magazine");
  assert.equal(blueprint.sockets.find(({ id }) => id === magazine.socket).part, "torso");
  assert.equal(launcher.massKg, 3.2);
  assert.equal(magazine.massKg, 2.4);
  assert.equal(magazine.ammunition, 12);
  assert.equal(launcher.reloadSeconds, 0.65);
  assert.equal(launcher.projectile.penetrationEfficiency, 1);
  assert.equal(leftSword.kind, "sword");
  assert.equal(leftSword.massKg, 1.4);
  assert.equal(leftSword.striker.damageScale, 1.15);
  assert.deepEqual(leftSword.geometry, ordinarySword.geometry);
  assert.deepEqual(leftSword.striker, ordinarySword.striker);
  assert.equal(blueprint.sockets.find(({ id }) => id === leftSword.socket).part, "left-hand");
  assert.equal(magazine.massKg,
    ARBALEST_HARDWARE.ammunition * ARBALEST_HARDWARE.projectile.massKg + ARBALEST_HARDWARE.carrierMassKg,
  "magazine mass is declared bolt mass plus its torso carrier, not a hidden balance scale");
});

test("the_Arbalest_crossbow_is_authored_outside_its_torso_in_the_bind_pose", () => {
  const blueprint = arbalestBlueprint();
  const transforms = resolveConstructBindTransforms(blueprint);
  const torso = blueprint.parts.find(({ id }) => id === "torso");
  const launcher = blueprint.modules.find(({ id }) => id === "effigy-arbalest");
  const socket = blueprint.sockets.find(({ id }) => id === launcher.socket);
  const owner = transforms.get(socket.part);
  assert.equal(torso.shape.kind, "box");

  const moduleRootX = owner.position.x + socket.frame.positionM[0];
  const moduleRootZ = owner.position.z + socket.frame.positionM[2];
  const torsoOuterX = torso.shape.sizeM[0] / 2 + torso.shell.visualClearanceM;
  const torsoOuterZ = torso.shape.sizeM[2] / 2 + torso.shell.visualClearanceM;
  for (const piece of launcher.geometry) {
    assert.equal(piece.shape.kind, "box");
    const innerX = moduleRootX + piece.frame.positionM[0] - piece.shape.sizeM[0] / 2 - piece.shell.visualClearanceM;
    const innerZ = moduleRootZ + piece.frame.positionM[2] - piece.shape.sizeM[2] / 2 - piece.shell.visualClearanceM;
    const clearance = Math.max(innerX - torsoOuterX, innerZ - torsoOuterZ);
    assert.ok(clearance >= 0.005,
      `${piece.id} has only ${(clearance * 1000).toFixed(1)} mm of bind-pose torso clearance`);
  }
});

test("the_Arbalest_public_graph_exposes_tracking_fire_and_the_existing_biped_support_actions", () => {
  const control = arbalestControl();
  assert.deepEqual(Object.fromEntries(control.actions.map(({ id, controller }) => [id, controller])), {
    hold: "hold-joints", stabilize: "hold-joints", move: "supported-biped-move",
    "limp-left": "supported-biped-limp-left", "limp-right": "supported-biped-limp-right",
    turn: "supported-biped-turn", brace: "supported-biped-brace",
    recover: "supported-biped-recover", aim: "aim-direction", "launcher-neutral": "arbalest-launcher-neutral",
    track: "track-target", fire: "fire-projectile", "left-sword-neutral": "arbalest-left-sword-neutral",
    "cut-left": "humanoid-left-sword-sweep",
  });
  const mount = control.groups.find(({ id }) => id === "arbalest-arm");
  assert.deepEqual(mount.joints, ["sword-yaw", "sword-pitch"]);
  assert.deepEqual(mount.bindings.yaw.joints, ["sword-yaw"]);
  assert.deepEqual(mount.bindings.pitch.joints, ["sword-pitch"]);
  assert.deepEqual(mount.bindings.launcher.modules, ["effigy-arbalest"]);
  assert.deepEqual(control.actions.find(({ id }) => id === "fire").parameters["target-height-offset"],
    { kind: "number", min: -0.5, max: 0.75, unit: "metres" });
  assert.deepEqual(control.actions.find(({ id }) => id === "fire").parameters["target-lateral-offset"],
    { kind: "number", min: -0.6, max: 0.6, unit: "metres" });
  assert.deepEqual(control.actions.find(({ id }) => id === "fire").parameters["target-lane-blend"],
    { kind: "number", min: 0, max: 1, unit: "scalar" });
  assert.deepEqual(control.actions.find(({ id }) => id === "fire").parameters["aim-epsilon-rad"],
    { kind: "number", min: 0.004, max: 0.04, unit: "radians" });
  assert.deepEqual(control.actions.find(({ id }) => id === "fire").parameters["follow-through-s"],
    { kind: "number", min: 0, max: 0.25, unit: "seconds" });
  const guard = control.groups.find(({ id }) => id === "left-sword-guard");
  assert.deepEqual(guard.joints, ["left-shoulder", "left-elbow", "left-wrist", "left-palm"]);
  assert.deepEqual(guard.modules, ["effigy-left-sword"]);
  assert.deepEqual(ARBALEST_LEFT_SWORD_GUARD,
    { shoulder: -0.35, elbow: -0.65, wrist: 0.35, palm: -0.15 });
  assert.deepEqual(new Set(arbalestSavedConstruct().program.rules.map(({ action }) => action)),
    new Set(["fire", "track", "cut-left", "left-sword-neutral", "launcher-neutral", "brace", "stabilize",
      "move", "limp-left", "limp-right", "turn", "recover"]));
});

test("an_Arbalest_draw_starts_from_verified_upright_posture_and_then_keeps_its_launcher", () => {
  assert.equal(ARBALEST_LOCOMOTION.retreatBelowM, 2.40);
  assert.deepEqual(ARBALEST_TACTICS, { blockerClearanceM: 0.20, targetHeightOffsetM: -0.05,
    reacquireAfterReloadS: 0.10, finishDownedAfterS: 1.25,
    finishTargetHeightOffsetM: 0.12, desperateLauncherHealth: 0.45,
    downedRetreatBelowM: 0.95, downedCloseAboveM: 1.65,
    leftSwordLaneX: -0.34, leftSwordLaneToleranceM: 0.08 });
  assert.equal(ARBALEST_SENSORS.some(({ id }) => id === "opponent-upright"), true);
  assert.equal(ARBALEST_SENSORS.some(({ id }) => id === "opponent-rising"), true);
  assert.equal(ARBALEST_SENSORS.some(({ id }) => id === "opponent-aim-local-x"), true);
  assert.equal(ARBALEST_SENSORS.some(({ id }) => id === "module-max-health-effigy-arbalest"), true);
  const installed = installedSensorsForBlueprint(arbalestBlueprint(), ARBALEST_SENSORS);
  const frame = new SensorFrame(installed);
  for (const [id, value] of Object.entries({
    "core-upright": true, "opponent-upright": true, "opponent-rising": false,
    "opponent-aim-local-x": -0.07, "line-of-sight": true, "opponent-range": 2,
    "contact-left-foot": false, "contact-right-foot": false,
    "reload-effigy-arbalest-magazine": 0, "ammo-effigy-arbalest-magazine": 12,
    "module-health-effigy-arbalest": 1, "module-max-health-effigy-arbalest": 90,
    "module-health-effigy-arbalest-magazine": 1,
    "power-charge-j": 24_000, overheated: false,
  })) frame.publish(id, value);
  const fire = arbalestProgram().rules.find(({ id }) => id === "fire-in-range");
  assert.ok(fire);
  assert.deepEqual(fire.parameters["target-lateral-offset"],
    { kind: "expression", value: { op: "constant", value: 0, unit: "metres" } });
  assert.deepEqual(fire.parameters["target-height-offset"],
    { kind: "expression", value: { op: "constant", value: -0.05, unit: "metres" } });
  assert.deepEqual(fire.parameters["target-lane-blend"],
    { kind: "expression", value: { op: "constant", value: 0.3, unit: "scalar" } });
  assert.deepEqual(fire.parameters["aim-epsilon-rad"],
    { kind: "expression", value: { op: "constant", value: 0.0085, unit: "radians" } });
  assert.deepEqual(fire.parameters["follow-through-s"],
    { kind: "expression", value: { op: "constant", value: 0.08, unit: "seconds" } });
  assert.equal(fire.dwellS, ARBALEST_TACTICS.reacquireAfterReloadS);
  const admitted = (active) => Boolean(evaluateExpression(fire.condition, frame,
    { isActionActive: (action) => active && action === "fire" }).value);
  assert.equal(admitted(false), true,
    "verified supported upright posture does not wait for the carrier's alternating planted-foot sample");
  frame.publish("contact-left-foot", true);
  assert.equal(admitted(false), true, "a planted foot remains compatible with the ordinary fire Action");
  frame.publish("opponent-upright", false);
  assert.equal(admitted(false), false, "the Mind does not begin another shot at a fallen opponent");
  assert.equal(admitted(true), true, "an already admitted draw completes across the knockdown it caused");
  frame.publish("module-health-effigy-arbalest", 0.05);
  assert.equal(admitted(false), false,
    "damage to an ordinary launcher cannot masquerade as deliberately fragile hardware");
  frame.publish("module-max-health-effigy-arbalest", ARBALEST_TACTICS.desperateLauncherHealth);
  assert.equal(admitted(false), false,
    "the fragile rising-pressure branch does not admit a merely prone target without the finishing dwell");
  frame.publish("opponent-rising", true);
  assert.equal(admitted(false), true, "a critically fragile launcher times pressure against a bounded rise");
  frame.publish("module-health-effigy-arbalest", 1);
  frame.publish("module-max-health-effigy-arbalest", 90);
  assert.equal(admitted(false), false, "ordinary hardware allows the rise to complete");
  frame.publish("opponent-rising", false);
  frame.publish("opponent-upright", true);
  frame.publish("core-upright", false); frame.publish("contact-left-foot", false);
  assert.equal(admitted(false), false, "a fallen Arbalest cannot begin a shot");
  frame.publish("line-of-sight", false);
  assert.equal(admitted(true), true,
    "a draw already admitted by upright support survives transient support/LOS withdrawal");

  const finish = arbalestProgram().rules.find(({ id }) => id === "finish-downed-opponent");
  assert.ok(finish);
  assert.equal(finish.dwellS, ARBALEST_TACTICS.finishDownedAfterS);
  assert.deepEqual(finish.parameters["target-height-offset"],
    { kind: "expression", value: { op: "constant", value: 0.12, unit: "metres" } });
  assert.deepEqual(finish.parameters["target-lane-blend"],
    { kind: "expression", value: { op: "constant", value: 0, unit: "scalar" } });
  const finishes = () => Boolean(evaluateExpression(finish.condition, frame,
    { isActionActive: () => false }).value);
  frame.publish("core-upright", true); frame.publish("contact-left-foot", true);
  frame.publish("line-of-sight", true); frame.publish("opponent-upright", true);
  assert.equal(finishes(), false, "the finishing rule cannot compete with an upright-target shot");
  frame.publish("opponent-upright", false); frame.publish("opponent-rising", true);
  assert.equal(finishes(), false, "the recovery animation remains an inviolable firing window");
  frame.publish("opponent-rising", false);
  frame.publish("contact-left-foot", false);
  assert.equal(finishes(), true,
    "a core-upright launcher may resolve a target that remains prone between exact foot samples");
});

test("the_Arbalest_is_selectable_without_replacing_either_sword_effigy_and_idle_changes_only_its_program", () => {
  const active = arbalestSavedConstruct();
  const idle = postureOnlySavedConstruct(active, ARBALEST_SENSORS);
  assert.equal(active.digests.blueprint, idle.digests.blueprint);
  assert.equal(active.digests.control, idle.digests.control);
  assert.deepEqual(idle.program.rules.map(({ action }) => action),
    ["launcher-neutral", "left-sword-neutral", "brace", "stabilize"]);
  assert.equal(idle.program.rules.some(({ action }) =>
    ["track", "fire", "cut-left"].includes(action)), false,
  "the posture-only program installs declared neutral fallbacks but no attack action");
  assert.equal(UNITS.some(({ name }) => name === "arbalest-effigy"), true);
  assert.equal(UNITS.some(({ name }) => name === "swordbearer-effigy"), true);
  assert.equal(UNITS.some(({ name }) => name === "twinblade-effigy"), true);
  const unit = unitDefinition("arbalest-effigy");
  assert.equal(unit.defaultPolicy, "humanoid-authored");
  const metrics = arbalestProfileMetrics();
  assert.ok(Math.abs(metrics.crownHeight - 1.8995) < 1e-12);
  assert.deepEqual({ reach: unit.reach, crownHeight: unit.crownHeight,
    vitalHeight: unit.vitalHeight, collisionRadius: unit.collisionRadius }, metrics);
});

test("the_curriculum_accepts_the_Arbalest_saved_definition_without_changing_its_global_default", async () => {
  const source = arbalestSavedConstruct();
  const submitted = [];
  const report = await runConstructWarriorCurriculum({ seeds: [7], sides: ["right"], maxSteps: 240,
    definition: arbalestCurriculumDefinition(), boutRunner: async (options) => {
      submitted.push(options);
      return { physics: "real-havok-fixed-240hz", simulatedSeconds: 1, winner: "draw",
        construct: { blueprintId: options.saved.blueprint.id, programId: options.saved.program.id,
          side: options.constructSide, vitality: 1, damage: 0 },
        warrior: { policy: options.warriorPolicy, seed: options.warriorSeed, vitality: 1, damage: 0 },
        firstUprightConstructDamageS: null };
    } });
  assert.equal(submitted.length, 2);
  assert.equal(submitted.every(({ sensors }) => sensors === ARBALEST_SENSORS), true);
  assert.equal(new Set(submitted.map(({ saved }) => saved.digests.blueprint)).size, 1);
  assert.equal(new Set(submitted.map(({ saved }) => saved.digests.control)).size, 1);
  assert.equal(report.durabilityMultiplier, 0.10);
  await assert.rejects(() => runConstructWarriorCurriculum({ definition: { saved: source } }),
    /definition requires saved, sensors, qualifierId and qualifier/);
});

const materials = (scene) => {
  const shared = new StandardMaterial("construct-arbalest.shared", scene);
  return Object.freeze({ shared, fighter: Object.freeze({ flesh: shared, cloth: shared, steel: shared,
    leather: shared, brass: shared, hide: shared, wood: shared, arrowAccent: shared }) });
};

test("a_surviving_Arbalest_holds_its_attached_assembly_as_one_post_verdict_pose", async () => {
  const arena = await createConstructHeadlessArena();
  const construct = unitDefinition("arbalest-effigy").build({ scene: arena.scene, side: "left",
    origin: Vector3.Zero(), facing: 0, materials: materials(arena.scene).fighter,
    policyName: "construct-hold", locomotionMode: "supported",
    locomotionWorld: flatSupportedWorldRegistry() });
  try {
    const root = construct.runtime.part(construct.runtime.blueprint.rootPart);
    root.node.rotationQuaternion = Quaternion.RotationAxis(Vector3.Forward(), 0.28);
    construct.stopFighting();
    assert.equal(typeof construct.stepPostVerdictPresentation, "function");
    const attached = [...construct.runtime.parts.values()].filter(({ attached }) => attached);
    assert.ok(attached.length > 1, "the fixture must exercise a jointed assembly");
    assert.equal(attached.every(({ body }) => body.getMotionType() === PhysicsMotionType.ANIMATED), true,
      "the victory hold must move every attached part rather than dragging only the root");
    const radii = new Map(attached.map((part) =>
      [part.id, Vector3.Distance(root.node.position, part.node.position)]));
    for (let step = 0; step < CONFIG.world.physicsHz; step += 1) {
      construct.stepPostVerdictPresentation(1 / CONFIG.world.physicsHz);
      arena.scene._renderId += 1;
      arena.scene._advancePhysicsEngineStep(1000 / CONFIG.world.physicsHz);
    }
    const rootUp = Vector3.Up().rotateByQuaternionToRef(
      root.node.rotationQuaternion ?? Quaternion.Identity(), new Vector3()).y;
    assert.ok(rootUp >= 0.995, `the whole-assembly victory hold remained tilted at ${rootUp}`);
    for (const part of attached) assert.ok(Math.abs(
      Vector3.Distance(root.node.position, part.node.position) - radii.get(part.id)) <= 0.005,
    `${part.id} changed its root radius while the assembly righted`);
  } finally { construct.dispose(); arena.dispose(); }
});

test("the_live_Arbalest_crossbow_stays_out_of_its_own_supported_trunk_in_both_mirrors", async () => {
  for (const constructSide of ["left", "right"]) {
    const arena = await createConstructHeadlessArena();
    const palette = materials(arena.scene);
    const separation = CONFIG.fighter.separation;
    const constructOrigin = constructSide === "left" ? Vector3.Zero() : new Vector3(0, 0, separation);
    const warriorSide = constructSide === "left" ? "right" : "left";
    const warriorOrigin = warriorSide === "left" ? Vector3.Zero() : new Vector3(0, 0, separation);
    const locomotionWorld = flatSupportedWorldRegistry();
    const construct = unitDefinition("arbalest-effigy").build({ scene: arena.scene, side: constructSide,
      origin: constructOrigin, facing: constructSide === "left" ? 0 : Math.PI,
      materials: palette.fighter, policyName: "humanoid-authored",
      locomotionMode: "supported", locomotionWorld });
    const warrior = unitDefinition("warrior").build({ scene: arena.scene, side: warriorSide,
      origin: warriorOrigin, facing: warriorSide === "left" ? 0 : Math.PI,
      materials: palette.fighter, policyName: "duelist",
      policySeed: CONSTRUCT_WARRIOR_CURRICULUM_SEEDS[0],
      loadout: { primary: "sword", secondary: "shield" },
      locomotionMode: "supported", locomotionWorld });
    try {
      const launcher = construct.runtime.modules.get("effigy-arbalest");
      assert.ok(launcher, "the fixture requires the installed launcher module");
      const torso = construct.runtime.part("torso");

      const overlapCounts = new Map(launcher.visual.meshes.map((mesh) => [mesh.name, 0]));
      let firstOverlap = null;
      let minimumRootUp = 1;
      let minimumTorsoHeightM = Number.POSITIVE_INFINITY;
      let minimumHeadAboveTorsoM = Number.POSITIVE_INFINITY;
      const torsoShell = torso.visual.meshes[0];
      const head = construct.runtime.part("head");
      for (let step = 0; step < CONFIG.world.physicsHz * 5; step += 1) {
        stepPair(constructSide === "left" ? construct : warrior,
          constructSide === "left" ? warrior : construct, 1 / CONFIG.world.physicsHz, step / CONFIG.world.physicsHz);
        arena.scene._renderId += 1;
        arena.scene._advancePhysicsEngineStep(1000 / CONFIG.world.physicsHz);
        const rootUp = Vector3.Up().rotateByQuaternionToRef(
          torso.node.rotationQuaternion ?? Quaternion.Identity(), new Vector3()).y;
        minimumRootUp = Math.min(minimumRootUp, rootUp);
        minimumTorsoHeightM = Math.min(minimumTorsoHeightM, torso.node.position.y);
        minimumHeadAboveTorsoM = Math.min(minimumHeadAboveTorsoM,
          head.node.position.y - torso.node.position.y);
        torsoShell.computeWorldMatrix(true);
        for (const mesh of launcher.visual.meshes) {
          mesh.computeWorldMatrix(true);
          if (mesh.intersectsMesh(torsoShell, true)) {
            overlapCounts.set(mesh.name, overlapCounts.get(mesh.name) + 1);
            firstOverlap ??= { step, mesh: mesh.name,
              meshPosition: mesh.getAbsolutePosition().asArray(), torsoPosition: torsoShell.getAbsolutePosition().asArray() };
          }
        }
      }
      const overlaps = [...overlapCounts.values()].reduce((sum, count) => sum + count, 0);
      assert.equal(overlaps, 0,
        `${constructSide} launcher entered its own torso: ${JSON.stringify({ counts: Object.fromEntries(overlapCounts), firstOverlap })}`);
      assert.ok(minimumRootUp >= 0.95 && minimumTorsoHeightM >= 1.10 && minimumHeadAboveTorsoM >= 0.25,
        `${constructSide} mount clearance was bought by an unstable body: ${JSON.stringify({
          minimumRootUp, minimumTorsoHeightM, minimumHeadAboveTorsoM,
        })}`);
    } finally {
      warrior.dispose(); construct.dispose(); palette.shared.dispose(false, false); arena.dispose();
    }
  }
});

test("the_selectable_Arbalest_tracks_and_physically_hits_an_idle_Warrior_torso_in_both_mirrors", async () => {
  for (const constructSide of ["left", "right"]) {
    const arena = await createConstructHeadlessArena();
    const palette = materials(arena.scene);
    const separation = CONFIG.fighter.separation;
    const constructOrigin = constructSide === "left" ? Vector3.Zero() : new Vector3(0, 0, separation);
    const warriorOrigin = constructSide === "left" ? new Vector3(0, 0, separation) : Vector3.Zero();
    const warriorSide = constructSide === "left" ? "right" : "left";
    const locomotionWorld = flatSupportedWorldRegistry();
    const construct = unitDefinition("arbalest-effigy").build({ scene: arena.scene, side: constructSide,
      origin: constructOrigin, facing: constructSide === "left" ? 0 : Math.PI,
      materials: palette.fighter, policyName: "humanoid-authored",
      locomotionMode: "supported", locomotionWorld });
    const warrior = unitDefinition("warrior").build({ scene: arena.scene, side: warriorSide,
      origin: warriorOrigin, facing: warriorSide === "left" ? 0 : Math.PI,
      materials: palette.fighter, policyName: "idle",
      loadout: { primary: "empty", secondary: "empty" },
      locomotionMode: "supported", locomotionWorld });
    const reports = []; const observedActions = new Set();
    const combat = new Combat(constructSide, construct.strikers, (event) => reports.push(event));
    combat.attach(warrior);
    try {
      const beforeAmmo = construct.state.hardware().resources.ammunition["effigy-arbalest-magazine"];
      for (let step = 0; step < CONFIG.world.physicsHz * 6 &&
          !reports.some(({ report }) => report.damage > 0 && report.key === "torso"); step += 1) {
        stepPair(constructSide === "left" ? construct : warrior,
          constructSide === "left" ? warrior : construct, 1 / CONFIG.world.physicsHz, combat.now);
        const snapshot = construct.control.snapshot();
        for (const { action } of snapshot.active) observedActions.add(action);
        for (const { action, kind } of snapshot.events) {
          if (kind === "started" || kind === "completed") observedActions.add(action);
        }
        arena.scene._renderId += 1;
        arena.scene._advancePhysicsEngineStep(1000 / CONFIG.world.physicsHz);
        combat.advance(1 / CONFIG.world.physicsHz);
      }
      const torso = reports.find(({ report }) => report.damage > 0 && report.key === "torso");
      const finalSnapshot = construct.control.snapshot();
      assert.ok(torso, `${constructSide} Arbalest never landed a physical torso arrow: ${JSON.stringify({
        active: finalSnapshot.active, motors: finalSnapshot.motorTargets,
        muzzle: Object.fromEntries(Object.entries(finalSnapshot.facts).filter(([id]) => id.startsWith("launcher-"))),
        opponent: Object.fromEntries(Object.entries(finalSnapshot.facts).filter(([id]) => id.startsWith("opponent-local"))),
        ammo: construct.state.hardware().resources.ammunition["effigy-arbalest-magazine"],
      })}`);
      assert.equal(torso.effectorId.startsWith("effigy-arbalest:"), true);
      assert.equal(torso.report.weapon, "arrow");
      assert.equal(observedActions.has("fire"), true);
      assert.equal(observedActions.has("brace"), true);
      assert.equal(observedActions.has("stabilize"), true);
      assert.equal(observedActions.has("left-sword-neutral"), true);
      assert.ok(construct.state.hardware().resources.ammunition["effigy-arbalest-magazine"] < beforeAmmo,
        "the physical shot must spend declared torso-magazine ammunition");
    } finally {
      combat.dispose(); warrior.dispose(); construct.dispose();
      palette.shared.dispose(false, false); arena.dispose();
    }
  }
});

test("the_Arbalest_left_sword_commit_physically_reaches_a_snapshotted_close_target_in_both_mirrors", async () => {
  for (const constructSide of ["left", "right"]) {
    const arena = await createConstructHeadlessArena();
    const palette = materials(arena.scene);
    const separation = 1.75;
    const constructOrigin = constructSide === "left" ? Vector3.Zero() : new Vector3(0, 0, separation);
    // The hardware really has four X hinges: the target is in the left-shoulder
    // plane in either world mirror, not silently recentred by a nonexistent yaw.
    const warriorOrigin = constructSide === "left" ? new Vector3(-0.34, 0, separation) :
      new Vector3(0.34, 0, 0);
    const warriorSide = constructSide === "left" ? "right" : "left";
    const locomotionWorld = flatSupportedWorldRegistry();
    const blueprint = arbalestBlueprint();
    const control = arbalestControl();
    const full = arbalestProgram();
    const program = Object.freeze({ ...full, id: "arbalest-left-sword-physical-probe",
      rules: Object.freeze(full.rules.filter(({ action }) =>
        ["cut-left", "left-sword-neutral", "launcher-neutral", "brace", "stabilize"].includes(action))
        .map((rule) => rule.action === "cut-left" || rule.action === "brace" ? { ...rule,
          priority: rule.action === "cut-left" ? 100 : 90,
          condition: Object.freeze({ op: "constant", value: true }) } : rule)) });
    const construct = new Construct({ scene: arena.scene, side: constructSide,
      origin: constructOrigin, facing: constructSide === "left" ? 0 : Math.PI,
      materials: palette.fighter, policyName: "construct-program",
      locomotionMode: "supported", locomotionWorld },
    Object.freeze({ blueprint, control, program, sensors: ARBALEST_SENSORS,
      profile: constructProfileForBlueprint(blueprint) }));
    const warrior = unitDefinition("warrior").build({ scene: arena.scene, side: warriorSide,
      origin: warriorOrigin, facing: warriorSide === "left" ? 0 : Math.PI,
      materials: palette.fighter, policyName: "idle",
      loadout: { primary: "empty", secondary: "empty" },
      locomotionMode: "supported", locomotionWorld });
    const reports = [];
    const combat = new Combat(constructSide, construct.strikers, (event) => reports.push(event));
    combat.attach(warrior);
    let minimumTipDistanceM = Number.POSITIVE_INFINITY;
    try {
      const sword = construct.strikers.find(({ effectorId }) => effectorId === "effigy-left-sword");
      assert.ok(sword, "the physical probe requires the mounted left sword");
      for (let step = 0; step < CONFIG.world.physicsHz * 4 &&
          !reports.some(({ effectorId, report }) => effectorId === "effigy-left-sword" && report.damage > 0); step += 1) {
        stepPair(constructSide === "left" ? construct : warrior,
          constructSide === "left" ? warrior : construct, 1 / CONFIG.world.physicsHz, combat.now);
        arena.scene._renderId += 1;
        arena.scene._advancePhysicsEngineStep(1000 / CONFIG.world.physicsHz);
        minimumTipDistanceM = Math.min(minimumTipDistanceM,
          Vector3.Distance(sword.tipPosition(), warrior.centre()));
        combat.advance(1 / CONFIG.world.physicsHz);
      }
      const hit = reports.find(({ effectorId, report }) =>
        effectorId === "effigy-left-sword" && report.damage > 0);
      assert.ok(hit, `${constructSide} left sword missed its snapshotted target: ${JSON.stringify({
        minimumTipDistanceM, snapshot: construct.control.snapshot(),
      })}`);
      assert.equal(hit.report.weapon, "sword");
    } finally {
      combat.dispose(); warrior.dispose(); construct.dispose();
      palette.shared.dispose(false, false); arena.dispose();
    }
  }
});

test("the_full_health_Arbalest_allows_one_Warrior_recovery_then_wins_with_follow_up_pressure", async () => {
  const saved = arbalestSavedConstruct();
  const report = await runConstructWarriorBout({ saved, sensors: ARBALEST_SENSORS,
    warriorPolicy: "duelist", warriorSeed: CONSTRUCT_WARRIOR_CURRICULUM_SEEDS[0],
    constructSide: "left", maxSteps: CONFIG.world.physicsHz * 30 });
  const states = report.locomotionSteps.map(({ warrior }) => warrior?.state ?? null);
  const risingIndex = states.indexOf("rising");
  const recoveredIndex = states.findIndex((state, index) => index > risingIndex && state === "supported");
  assert.ok(risingIndex >= 0, "a physical arrow must actually knock the Warrior down");
  assert.ok(recoveredIndex > risingIndex, "the Warrior must complete a physical recovery");
  const fallenAtS = report.locomotionSteps.find(({ warrior }) => warrior?.state === "fallen")?.atS;
  const recoveredAtS = report.locomotionSteps[recoveredIndex].atS;
  const starts = report.actionTimeline.filter(({ action, kind }) => action === "fire" && kind === "started");
  assert.equal(starts.some(({ atS }) => atS > fallenAtS && atS < recoveredAtS), false,
    "the first knockdown cannot be maintained by another admitted shot");
  const followUp = report.actionTimeline.some(({ action, kind, atS }) => kind === "started" &&
    (action === "fire" || action === "cut-left") && atS >= recoveredAtS);
  assert.equal(followUp, true,
    "the combined-arms Mind must resume launcher or blade pressure after the completed recovery");
  assert.equal(report.winner, "construct", JSON.stringify({ vitality: report.warrior.vitality,
    seconds: report.simulatedSeconds, starts, contacts: report.constructContacts,
    construct: report.constructPhysical }));
  assert.equal(report.warrior.vitality, 0);
  assert.ok(report.minimumRangeM >= 0.625 - 0.020,
    "the Arbalest cannot make a fallen Warrior disappear inside its carrier footprint");
  assert.ok(report.warriorPhysical.minimumAttachedY >= -0.05 &&
    report.warriorPhysical.maximumAttachedDistanceFromPelvisM <= 1.25,
  "the defeated Warrior remains a cohesive visible body in the arena");
  assert.ok(report.constructPhysical.rootUp >= 0.90 && report.constructPhysical.minimumAttachedY >= -0.05 &&
    report.constructPhysical.maximumAttachedDistanceFromRootM <= 1.65,
  `the winning Arbalest remains upright and physically assembled: ${JSON.stringify(report.constructPhysical)}`);
});

test("the_Arbalest_resolves_an_idle_fallen_Warrior_instead_of_waiting_for_the_bout_cap", async () => {
  const report = await runConstructWarriorBout({ saved: arbalestSavedConstruct(), sensors: ARBALEST_SENSORS,
    warriorPolicy: "idle", warriorSeed: 7, constructSide: "left",
    maxSteps: CONFIG.world.physicsHz * 20 });
  const fallenAtS = report.locomotionSteps.find(({ warrior }) => warrior?.state === "fallen")?.atS;
  const starts = report.actionTimeline.filter(({ action, kind }) => action === "fire" && kind === "started");
  assert.equal(report.winner, "construct", JSON.stringify({ vitality: report.warrior.vitality,
    seconds: report.simulatedSeconds, starts, contacts: report.constructContacts,
    construct: report.constructPhysical }));
  assert.equal(report.warrior.vitality, 0);
  assert.ok(report.simulatedSeconds < 12,
    `the verdict must promptly precede the safety cap, got ${report.simulatedSeconds.toFixed(3)} s`);
  assert.ok(starts.length >= 2 && starts[1].atS - fallenAtS >= ARBALEST_TACTICS.finishDownedAfterS,
    "a finishing draw must wait through the declared prone recovery window");
});
