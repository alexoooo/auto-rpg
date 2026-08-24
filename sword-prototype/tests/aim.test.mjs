import test from "node:test";
import assert from "node:assert/strict";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";

import { AimIndicator } from "../src/aim.ts";

test("the_aim_indicator_constructs_real_line_buffers_before_its_first_update", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const aim = new AimIndicator(scene);

  assert.ok(scene.getMeshByName("aim.floor").getTotalVertices() > 0);
  assert.ok(scene.getMeshByName("aim.riser").getTotalVertices() > 0);

  aim.dispose();
  scene.dispose();
  engine.dispose();
});
