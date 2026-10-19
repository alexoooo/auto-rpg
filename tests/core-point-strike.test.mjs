import test from "node:test";
import assert from "node:assert/strict";
import { createPointStrikeProbe } from "../src/core/tasks/point-strike.ts";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { freshEngine, saveStand, loadStand } from "./harness/core-stand.mjs";

async function fixture(config) {
  const render = new NullEngine(), scene = new Scene(render);
  const task = createPointStrikeProbe(scene, await freshEngine(), { hz: 120, actuation: "directional", offset: 0, held: "empty", miss: false, ...config });
  return { task, dispose() { task.dispose(); scene.dispose(); render.dispose(); } };
}

test("a missed target scores no hit and the strike's continuation replays in another world", async () => {
  for (const held of ["empty", "club"]) {
  const config = { model: "workshop-fighter", hands: "both", held, miss: true }, f = await fixture(config), other = await fixture(config);
  try {
    while (f.task.observe().task.phase !== "strike" && f.task.world.time < 3) f.task.world.step();
    assert.equal(f.task.observe().task.phase, "strike");
    f.task.world.step(15);
    const saved = saveStand(f.task.world, f.task.state);
    const run = (task) => { while (!task.complete && task.world.time < 8) task.world.step(); return { observation: task.observe(), saved: saveStand(task.world, task.state).state }; };
    const expected = run(f.task);
    // Whether the miss returns standing is `core-point-strike-capability`'s: a miss scores no hit, and replays.
    assert.ok(expected.observation.task.strikes.length > 0 && expected.observation.task.strikes.every((s) => s.contacts === 0 && s.firstHit === -1));
    loadStand(f.task.world, f.task.state, saved); assert.deepEqual(run(f.task), expected);
    loadStand(other.task.world, other.task.state, saved); assert.deepEqual(run(other.task), expected);
  } finally { f.dispose(); other.dispose(); }
  }
});

test("moving targets, delayed senses and impact replanning replay in another world", async () => {
  for (const centreControl of [false, true]) {
  const config = { model: "crypt-skeleton", hands: "both", held: "club", centreControl, swing: { angle: 0.1, speed: 0.7, delay: 3, tracking: true, braking: true } };
  const f = await fixture(config), other = await fixture(config);
  try {
    f.task.world.step(120);
    const saved = saveStand(f.task.world, f.task.state);
    const run = (task) => { while (!task.complete && task.world.time < 8) task.world.step(); return { observation: task.observe(), state: saveStand(task.world, task.state).state }; };
    const expected = run(f.task);
    loadStand(f.task.world, f.task.state, saved); assert.deepEqual(run(f.task), expected);
    loadStand(other.task.world, other.task.state, saved); assert.deepEqual(run(other.task), expected);
  } finally { f.dispose(); other.dispose(); }
  }
});
