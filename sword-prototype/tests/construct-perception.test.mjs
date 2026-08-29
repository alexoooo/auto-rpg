import assert from "node:assert/strict";
import test from "node:test";

import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { CONFIG } from "../src/config.ts";
import { Construct, opponentOwnsSightHit } from "../src/construct/construct.ts";
import { twinbladeSavedConstruct, TWINBLADE_SENSORS } from "../src/construct/twinblade.ts";
import { unitDefinition } from "../src/units.ts";
import { createConstructHeadlessArena } from "../scripts/construct-headless-arena.mjs";

test("Construct_line_of_sight_owns_limbs_and_held_equipment_but_not_unknown_world_bodies", () => {
  const limbBody = { id: "limb" };
  const guardBody = { id: "guard" };
  const worldBody = { id: "world" };
  const point = new Vector3(0.2, 1.1, -0.4);
  const parryCalls = [];
  const opponent = {
    limbFor: (body) => body === limbBody ? { key: "torso" } : undefined,
    parriedBy: (body, at) => {
      parryCalls.push({ body, at });
      return body === guardBody ? { kind: "buckler" } : null;
    },
  };

  assert.equal(opponentOwnsSightHit(opponent, limbBody, point), true);
  assert.equal(parryCalls.length, 0, "a real opponent limb is sufficient ownership evidence");
  assert.equal(opponentOwnsSightHit(opponent, guardBody, point), true);
  assert.deepEqual(parryCalls, [{ body: guardBody, at: point }],
    "removing the held-equipment parry ownership branch must fail this mutation");
  assert.equal(opponentOwnsSightHit(opponent, worldBody, point), false);
});

const materials = (scene) => {
  const shared = new StandardMaterial("construct-perception.shared", scene);
  return Object.freeze({ flesh: shared, cloth: shared, steel: shared, leather: shared,
    brass: shared, hide: shared, wood: shared, arrowAccent: shared });
};

test("Construct_publishes_the_real_opponent_weapon_tip_and_clears_it_for_empty_hands", async () => {
  const arena = await createConstructHeadlessArena();
  const saved = twinbladeSavedConstruct();
  const definition = Object.freeze({ blueprint: saved.blueprint, control: saved.control,
    program: saved.program, sensors: TWINBLADE_SENSORS });
  const fighterMaterials = materials(arena.scene);
  const construct = new Construct({ scene: arena.scene, side: "left", origin: Vector3.Zero(), facing: 0,
    materials: fighterMaterials, policyName: "construct-program" }, definition);
  let opponent;
  try {
    opponent = unitDefinition("warrior").build({ scene: arena.scene, side: "right",
      origin: new Vector3(0, 0, CONFIG.fighter.separation), facing: Math.PI,
      materials: fighterMaterials, policyName: "idle",
      loadout: { primary: "sword", secondary: "buckler" } });
    construct.observe(opponent, 0);
    const armed = construct.control.snapshot().facts;
    assert.equal(armed["opponent-weapon-present"], true);
    const tip = [armed["opponent-weapon-local-x"], armed["opponent-weapon-local-y"],
      armed["opponent-weapon-local-z"]];
    assert.equal(tip.every(Number.isFinite), true);
    assert.equal(tip.some((component) => component !== 0), true,
      "weapon telemetry must publish the described sword tip, not a presence-only placeholder");

    opponent.dispose();
    opponent = unitDefinition("warrior").build({ scene: arena.scene, side: "right",
      origin: new Vector3(0, 0, CONFIG.fighter.separation), facing: Math.PI,
      materials: fighterMaterials, policyName: "idle",
      loadout: { primary: "empty", secondary: "empty" } });
    construct.observe(opponent, 1 / CONFIG.world.physicsHz);
    const empty = construct.control.snapshot().facts;
    assert.equal(empty["opponent-weapon-present"], false);
    assert.deepEqual([empty["opponent-weapon-local-x"], empty["opponent-weapon-local-y"],
      empty["opponent-weapon-local-z"]], [0, 0, 0],
    "an unarmed observation must clear the pooled weapon record instead of retaining the prior sword");
  } finally {
    opponent?.dispose();
    construct.dispose();
    arena.dispose();
  }
});
