import test from "node:test";
import assert from "node:assert/strict";
import { loadEngine } from "../src/core/engine/engines.ts";
import { rapierModule } from "../src/core/engine/rapier.ts";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";
import { humanSpec } from "../src/core/human/spec.ts";
import { driveMuscles } from "../src/core/muscle/driver.ts";
import { servo } from "../src/core/control/servo.ts";

test("angular-limit configurations share a module, retain their snapshot setting, and reject cross-configuration loads", async () => {
  const reference = await loadEngine("rapier"), corrected = await loadEngine("rapier-coordinate");
  assert.notEqual(reference.revision, corrected.revision);
  const R = await rapierModule(), spec = humanSpec("workshop-rogue");
  const stands = await Promise.all(["rapier", "rapier-coordinate", "rapier-coordinate"].map((engine) =>
    coreStand(spec, { engine, gravity: false, ground: false, pinned: "lowerTrunk" })));
  const drivers = stands.map((s) => driveMuscles(s.built, s.world, (d, dt) => servo(d, (i) => {
    const channel = d.channels[i];
    return channel.dof.spec.max.value;
  }, 0.08, dt)));
  const trace = (s, d) => {
    const frames = [];
    for (let i = 0; i < 60; i++) { s.step(); frames.push(d.channels.map((_, k) => [d.angle(k), d.speed(k)])); }
    return frames;
  };
  try {
    for (const s of stands) assert.equal(s.world.physics.rapier, R);
    assert.equal(stands[0].world.physics.raw.integrationParameters.coordinateAngularLimits, false);
    for (const s of stands) s.step(120);
    const saved = saveStand(stands[1].world, { driver: drivers[1].state });
    assert.equal(stands[1].world.physics.raw.integrationParameters.coordinateAngularLimits, true);
    const expected = trace(stands[1], drivers[1]);
    loadStand(stands[1].world, { driver: drivers[1].state }, saved);
    assert.deepEqual(trace(stands[1], drivers[1]), expected);
    loadStand(stands[2].world, { driver: drivers[2].state }, saved);
    assert.equal(stands[2].world.physics.raw.integrationParameters.coordinateAngularLimits, true);
    assert.deepEqual(trace(stands[2], drivers[2]), expected);
    const referenceBefore = saveStand(stands[0].world, { driver: drivers[0].state });
    assert.throws(() => loadStand(stands[0].world, { driver: drivers[0].state }, saved));
    assert.deepEqual(saveStand(stands[0].world, { driver: drivers[0].state }), referenceBefore);
    const correctedBefore = saveStand(stands[1].world, { driver: drivers[1].state });
    assert.throws(() => loadStand(stands[1].world, { driver: drivers[1].state }, referenceBefore));
    assert.deepEqual(saveStand(stands[1].world, { driver: drivers[1].state }), correctedBefore);
    assert.notDeepEqual(trace(stands[0], drivers[0]), expected);
  } finally { drivers.forEach((d) => d.dispose()); stands.forEach((s) => s.dispose()); }
});
