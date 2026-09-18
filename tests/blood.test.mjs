import assert from "node:assert/strict";
import test from "node:test";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.js";

import { Blood } from "../src/blood.ts";
import { CONFIG } from "../src/config.ts";

test("paused_blood_remains_drawable_without_advancing_with_scene_render", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const texture = { dispose() {} };
  const blood = new Blood(scene, texture);
  blood.spray(Vector3.Zero(), Vector3.Up(), CONFIG.blood.fullSpray);
  const particles = scene.particleSystems[0];

  assert.equal(particles.updateSpeed, 0.01);
  blood.setPaused(true);
  assert.equal(particles.updateSpeed, 0, "rendering the paused scene cannot age the spray");
  blood.setPaused(false);
  assert.equal(particles.updateSpeed, 0.01);

  blood.dispose();
  scene.dispose();
  engine.dispose();
});
