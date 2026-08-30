import assert from "node:assert/strict";
import test from "node:test";

import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { Combat } from "../src/combat.ts";
import { CONFIG } from "../src/config.ts";
import { ARBALEST_HARDWARE, ARBALEST_LEFT_SWORD_GUARD, ARBALEST_LOCOMOTION, ARBALEST_SENSORS,
  arbalestBlueprint, arbalestControl, arbalestProgram,
  arbalestProfileMetrics, arbalestSavedConstruct } from "../src/construct/arbalest.ts";
import { humanoidBlueprint } from "../src/construct/humanoid.ts";
import { evaluateExpression } from "../src/construct/program.ts";
import { installedSensorsForBlueprint, SensorFrame } from "../src/construct/sensors.ts";
import { stepPair } from "../src/fighter.ts";
import { flatSupportedWorldRegistry } from "../src/supported-locomotion-production.ts";
import { postureOnlySavedConstruct,
  runConstructWarriorCurriculum } from "../scripts/construct-warrior-curriculum.mjs";
import { arbalestCurriculumDefinition } from "../scripts/arbalest-warrior-qualifier.mjs";
import { createConstructHeadlessArena } from "../scripts/construct-headless-arena.mjs";
import { UNITS, unitDefinition } from "../src/units.ts";

test("the_Arbalest_reuses_the_human_scale_body_with_a_right_launcher_and_an_ordinary_left_sword", () => {
  const swordbearer = humanoidBlueprint();
  const blueprint = arbalestBlueprint();
  assert.equal(blueprint.id, "arbalest-effigy");
  assert.deepEqual(blueprint.parts, swordbearer.parts);
  assert.deepEqual(blueprint.joints, swordbearer.joints);
  assert.equal(blueprint.modules.some(({ id }) => id === "effigy-sword"), false);

  const launcher = blueprint.modules.find(({ id }) => id === "effigy-arbalest");
  const magazine = blueprint.modules.find(({ id }) => id === "effigy-arbalest-magazine");
  const leftSword = blueprint.modules.find(({ id }) => id === "effigy-left-sword");
  const ordinarySword = swordbearer.modules.find(({ id }) => id === "effigy-sword");
  assert.equal(launcher.kind, "launcher");
  assert.equal(launcher.socket, "socket-sword-hand");
  assert.equal(magazine.kind, "magazine");
  assert.equal(blueprint.sockets.find(({ id }) => id === magazine.socket).part, "torso");
  assert.equal(launcher.massKg, 3.2);
  assert.equal(magazine.massKg, 2.4);
  assert.equal(magazine.ammunition, 12);
  assert.equal(launcher.reloadSeconds, 0.65);
  assert.equal(launcher.projectile.damageScale, 1.15);
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

test("the_Arbalest_public_graph_exposes_tracking_fire_and_the_existing_biped_support_actions", () => {
  const control = arbalestControl();
  assert.deepEqual(Object.fromEntries(control.actions.map(({ id, controller }) => [id, controller])), {
    hold: "hold-joints", stabilize: "hold-joints", move: "supported-biped-move",
    "limp-left": "supported-biped-limp-left", "limp-right": "supported-biped-limp-right",
    turn: "supported-biped-turn", brace: "supported-biped-brace",
    recover: "supported-biped-recover", aim: "aim-direction",
    track: "track-target", fire: "fire-projectile", "guard-left-sword": "arbalest-left-sword-guard",
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
  const guard = control.groups.find(({ id }) => id === "left-sword-guard");
  assert.deepEqual(guard.joints, ["left-shoulder", "left-elbow", "left-wrist", "left-palm"]);
  assert.deepEqual(guard.modules, ["effigy-left-sword"]);
  assert.deepEqual(ARBALEST_LEFT_SWORD_GUARD,
    { shoulder: -0.35, elbow: -0.65, wrist: 0.35, palm: -0.15 });
  assert.deepEqual(new Set(arbalestSavedConstruct().program.rules.map(({ action }) => action)),
    new Set(["fire", "track", "guard-left-sword", "brace", "stabilize", "move", "limp-left",
      "limp-right", "turn", "recover"]));
});

test("an_Arbalest_draw_starts_only_upright_on_fresh_support_and_then_keeps_its_launcher", () => {
  assert.equal(ARBALEST_LOCOMOTION.retreatBelowM, 1.80);
  const installed = installedSensorsForBlueprint(arbalestBlueprint(), ARBALEST_SENSORS);
  const frame = new SensorFrame(installed);
  for (const [id, value] of Object.entries({
    "core-upright": true, "line-of-sight": true, "opponent-range": 2,
    "contact-left-foot": false, "contact-right-foot": false,
    "reload-effigy-arbalest-magazine": 0, "ammo-effigy-arbalest-magazine": 12,
    "module-health-effigy-arbalest": 1, "module-health-effigy-arbalest-magazine": 1,
    "power-charge-j": 24_000, overheated: false,
  })) frame.publish(id, value);
  const fire = arbalestProgram().rules.find(({ id }) => id === "fire-in-range");
  assert.ok(fire);
  const admitted = (active) => Boolean(evaluateExpression(fire.condition, frame,
    { isActionActive: (action) => active && action === "fire" }).value);
  assert.equal(admitted(false), false, "an otherwise valid shot cannot begin without a fresh foot");
  frame.publish("contact-left-foot", true);
  assert.equal(admitted(false), true, "one exact fresh support admits the ordinary fire Action");
  frame.publish("core-upright", false); frame.publish("contact-left-foot", false);
  assert.equal(admitted(false), false, "a fallen Arbalest cannot begin a shot");
  frame.publish("line-of-sight", false);
  assert.equal(admitted(true), true,
    "a draw already admitted by upright support survives transient support/LOS withdrawal");
});

test("the_Arbalest_is_selectable_without_replacing_either_sword_effigy_and_idle_changes_only_its_program", () => {
  const active = arbalestSavedConstruct();
  const idle = postureOnlySavedConstruct(active, ARBALEST_SENSORS);
  assert.equal(active.digests.blueprint, idle.digests.blueprint);
  assert.equal(active.digests.control, idle.digests.control);
  assert.deepEqual(idle.program.rules.map(({ action }) => action), ["brace", "stabilize"]);
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
      assert.ok(torso, `${constructSide} Arbalest never landed a physical torso arrow`);
      assert.equal(torso.effectorId.startsWith("effigy-arbalest:"), true);
      assert.equal(torso.report.weapon, "arrow");
      assert.equal(observedActions.has("fire"), true);
      assert.equal(observedActions.has("brace"), true);
      assert.equal(observedActions.has("stabilize"), true);
      assert.equal(observedActions.has("guard-left-sword"), true);
      assert.ok(construct.state.hardware().resources.ammunition["effigy-arbalest-magazine"] < beforeAmmo,
        "the physical shot must spend declared torso-magazine ammunition");
    } finally {
      combat.dispose(); warrior.dispose(); construct.dispose();
      palette.shared.dispose(false, false); arena.dispose();
    }
  }
});
