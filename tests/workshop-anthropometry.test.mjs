import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { createBout, freshHavok } from "./harness/bout-runner.mjs";
import { humanSetup } from "../src/golem/humanoid/presets.ts";
import { workshopSource } from "../src/golem/humanoid/workshop-profile.ts";
import { golemUpperMassKg } from "../src/golem/build.ts";
import {
  TYPICAL_STATURE_M, WORKSHOP_BODY_KG, WORKSHOP_FIT_SCALE, WORKSHOP_SKIN_TOP_M, workshopSegmentKgAtX1,
} from "../src/golem/humanoid/anthropometry.ts";

Logger.LogLevels = Logger.ErrorLogLevel;

const MODELS = ["workshop-fighter", "workshop-rogue"];

/** The bind-pose bounds of one mesh's positions, read from the GLB's own accessor. */
function glbMeshBounds(file, meshName) {
  const buffer = readFileSync(file);
  const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString("utf8"));
  const mesh = json.meshes.find((m) => m.name === meshName || m.name === `${meshName}.001`);
  assert.ok(mesh, `${file} has no ${meshName}`);
  const accessor = json.accessors[mesh.primitives[0].attributes.POSITION];
  return { min: accessor.min, max: accessor.max };
}

test("each model's stature is the top of its own skin, read from the asset", () => {
  for (const model of MODELS) {
    const file = `public/assets/humanoid/${model}.glb`;
    assert.ok(Math.abs(glbMeshBounds(file, "base__skin").max[1] - WORKSHOP_SKIN_TOP_M[model]) < 5e-4, model);
    assert.ok(Math.abs(glbMeshBounds(file, "bare__feet").min[1]) < 5e-4, `${model} stands on 0`);
  }
  assert.equal(WORKSHOP_SKIN_TOP_M["workshop-fighter"] * WORKSHOP_FIT_SCALE, TYPICAL_STATURE_M);
});

test("a model's segment masses are its body mass, split by de Leva", () => {
  for (const model of MODELS) {
    const kg = workshopSegmentKgAtX1(model);
    const whole = kg.pelvisMass + kg.ballMass + kg.coreMass + kg.neckMass + kg.headMass
      + 2 * (kg.thighMass + kg.shinMass + kg.footMass + kg.arm[0] + kg.arm[1] + kg.arm[2] + kg.fist);
    // de Leva's fractions sum to 1 to the fourth digit.
    assert.ok(Math.abs(whole / WORKSHOP_BODY_KG[model] - 1) < 2e-4, `${model}: ${whole}`);
    // The trunk is his three segments, and the arm a twentieth of the body.
    assert.ok(Math.abs((kg.pelvisMass + kg.ballMass + kg.coreMass) / WORKSHOP_BODY_KG[model] - 0.43) < 0.01);
    assert.ok(Math.abs((kg.arm[0] + kg.arm[1] + kg.arm[2] + kg.fist) / WORKSHOP_BODY_KG[model] - 0.047) < 0.004);
  }
  assert.ok(WORKSHOP_BODY_KG["workshop-rogue"] < WORKSHOP_BODY_KG["workshop-fighter"] * 0.75);
});

/** Every built part's mass by the name the body gives it, and the body's neck base. */
async function assembled(model, size) {
  const setup = size === 1 ? humanSetup("fist", "fist", model) : { ...humanSetup("fist", "fist", model), attributes: { size } };
  const bout = createBout({ left: "idle", right: "idle", leftGolem: setup, rightGolem: humanSetup("fist", "fist"),
    seeds: [1, 2], separation: 8, locomotionMode: "supported", maxSeconds: 1, physics: await freshHavok() });
  try {
    const parts = bout.left.limbs.map((limb) => limb.part ?? limb);
    const masses = Object.fromEntries(parts.map((part) => [part.mesh.name.replace(/^left\.golem\./, ""),
      part.body.getMassProperties().mass]));
    const neck = parts.find((part) => part.mesh.name.endsWith(".head.neck")).mesh;
    neck.computeWorldMatrix(true); neck.refreshBoundingInfo();
    return { setup, masses, neckBase: neck.getBoundingInfo().boundingBox.minimumWorld.y };
  } finally { bout.dispose(); }
}

test("an assembled human is its model's typical adult at x1, and the size stat scales it from there", async () => {
  for (const model of MODELS) for (const size of [1, 1.1]) {
    const { setup, masses, neckBase } = await assembled(model, size);
    const kg = workshopSegmentKgAtX1(model), cube = size ** 3;
    const expected = {
      "legs.pelvis": kg.pelvisMass, "legs.thighL": kg.thighMass, "legs.shinL": kg.shinMass, "legs.footL": kg.footMass,
      "legs.thighR": kg.thighMass, "legs.shinR": kg.shinMass, "legs.footR": kg.footMass,
      "trunk.waist": kg.ballMass, "trunk.core": kg.coreMass, "head.neck": kg.neckMass, "head.head": kg.headMass,
      "primary.upper": kg.arm[0], "primary.fore": kg.arm[1], "primary.hand": kg.arm[2], "primary.fist": kg.fist,
      "secondary.upper": kg.arm[0], "secondary.fore": kg.arm[1], "secondary.hand": kg.arm[2], "secondary.fist": kg.fist,
    };
    assert.deepEqual(Object.keys(masses).sort(), Object.keys(expected).sort(), model);
    for (const [id, mass] of Object.entries(expected)) {
      assert.ok(Math.abs(masses[id] - mass * cube) < 1e-5, `${model} x${size} ${id}: ${masses[id]} against ${mass * cube}`);
    }
    // The fit reaches the built body, not only the tables: the neck stands where the model's does,
    // brought to a typical adult and then to the stat.
    const neckHeight = workshopSource(model).neckHeight * WORKSHOP_FIT_SCALE * size;
    assert.ok(Math.abs(neckBase - neckHeight) < 1e-3, `${model} x${size}: neck at ${neckBase}, not ${neckHeight}`);
    // What the carrier holds up is the model's own upper body, as built.
    const upper = Object.entries(masses).filter(([id]) => !id.startsWith("legs.")).reduce((a, [, m]) => a + m, 0);
    assert.ok(Math.abs(golemUpperMassKg(setup) - upper) < 1e-4, `${model} x${size}: ${golemUpperMassKg(setup)} against ${upper}`);
  }
});
