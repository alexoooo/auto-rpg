import { test } from "node:test";
import assert from "node:assert/strict";

import { Logger } from "@babylonjs/core/Misc/logger.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { createHeadlessArena } from "./harness/golem-headless-arena.mjs";
import { boxPart } from "../src/rig.ts";
import { LAYER } from "../src/physics.ts";
import {
  baseReachM, convexHull, leanHoldN, leanRoomM, leverAt, massDistributionOf, rockingDecayMps2, tippingGeometry,
  tippingLineMps, TIPPING,
} from "../src/tipping.ts";

Logger.LogLevels = Logger.ErrorLogLevel;

const close = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} against ${expected}`);

test("the hull is the convex outline, counter-clockwise, whatever order its points arrive in", () => {
  const hull = convexHull([[1, 1], [-1, -1], [0, 0], [1, -1], [-1, 1], [0.5, 0.2]]);
  assert.deepEqual(hull, [[-1, -1], [1, -1], [1, 1], [-1, 1]]);
});

test("the base reaches the edge its ray leaves by, and from outside only back across it", () => {
  const hull = convexHull([[-0.2, -0.1], [0.3, -0.1], [0.3, 0.1], [-0.2, 0.1]]);
  close(baseReachM(hull, 1, 0), 0.3, 1e-12, "+x");
  close(baseReachM(hull, -1, 0), 0.2, 1e-12, "-x");
  close(baseReachM(hull, 0, 1), 0.1, 1e-12, "+z");
  // A diagonal meets the nearer edge: z reaches 0.1 at 0.1 * sqrt(2).
  close(baseReachM(hull, 1, 1), 0.1 * Math.SQRT2, 1e-12, "diagonal");
  // A centre of mass outside its base is past the edges on its own side: pushed further away it
  // goes over at any touch, and pushed back it is carried across and over the far edge.
  const outside = convexHull([[0.1, -0.1], [0.3, -0.1], [0.3, 0.1], [0.1, 0.1]]);
  assert.equal(baseReachM(outside, -1, 0), 0);
  close(baseReachM(outside, 1, 0), 0.3, 1e-12, "back across");
  // A ray that passes the base by meets nothing.
  assert.equal(baseReachM(outside, 0, 1), 0);
  assert.equal(baseReachM(convexHull([[0.1, 0.2], [0.3, 0.2], [0.3, 0.4], [0.1, 0.4]]), 1, 0), 0);
});

test("the fall line is the energy to lift the centre of mass over the edge, in ledger units", () => {
  const h = 1.1, k = 0.55, r = 0.17;
  const R = Math.hypot(h, r);
  // I w^2 / 2 = M g (R - h), with w = J h / I and I = M (k^2 + R^2), J / M = v.
  const v = tippingLineMps(h, k, r);
  const energy = (v * h) ** 2 / (k * k + R * R) / 2;
  close(energy, TIPPING.GRAVITY_MPS2 * (R - h), 1e-12, "energy");
  // Wider is harder, higher is easier, and no base is no line at all.
  assert.ok(tippingLineMps(h, k, 0.25) > v);
  assert.ok(tippingLineMps(1.4, k, r) < v);
  assert.equal(tippingLineMps(h, k, 0), 0);
  close(rockingDecayMps2(h, r), TIPPING.GRAVITY_MPS2 * r / h, 1e-12, "decay");
});

test("a blow counts by its height over the centre of mass's, never below the ground", () => {
  const mass = massDistributionOf([{ massKg: 2, x: 0, y: 1, z: 0 }, { massKg: 2, x: 0, y: 2, z: 0 }]);
  close(mass.y, 1.5, 1e-12, "centre");
  close(mass.gyrationM, 0.5, 1e-12, "gyration");
  const geometry = tippingGeometry(mass, [{ x: -0.1, y: 0.5, z: -0.1 }, { x: 0.1, y: 0.5, z: -0.1 },
    { x: 0.1, y: 0.5, z: 0.1 }, { x: -0.1, y: 0.5, z: 0.1 }]);
  close(geometry.comHeightM, 1, 1e-12, "height over the ground");
  close(leverAt(geometry, 2.5), 2, 1e-12, "above");
  assert.equal(leverAt(geometry, 0), 0);
  assert.equal(leverAt(geometry, undefined), 1);
  // A body whose centre of mass is under its lowest support has nothing to tip over.
  assert.equal(tippingGeometry(mass, [{ x: 0, y: 1.6, z: 0 }]), null);
});

/**
 * **A leaning body tips at the static line through its whole base** (physical contact session 10). A
 * sustained force filed past what the lean holds, at its lever, against the righting the ledger
 * already gives: it grows exactly when `F (y - ground) > W (reach + room)`, and the room is the base's
 * reach on the side the force comes from. Checked on an off-centre base, both ways along it, so a
 * room read off the wrong side cannot pass.
 */
test("a body leaning against a push holds it until the push beats its weight over the base's whole depth", () => {
  const massKg = 100, weightN = massKg * TIPPING.GRAVITY_MPS2;
  const mass = massDistributionOf([{ massKg, x: 0, y: 1.1, z: 0 }]);
  const geometry = tippingGeometry(mass, [{ x: -0.2, y: 0, z: -0.15 }, { x: 0.14, y: 0, z: -0.15 },
    { x: 0.14, y: 0, z: 0.15 }, { x: -0.2, y: 0, z: 0.15 }]);
  close(leanRoomM(geometry.hull, 1, 0), 0.2, 1e-12, "pushed along +x it leans back toward -x");
  close(leanRoomM(geometry.hull, -1, 0), 0.14, 1e-12, "and along -x toward +x");
  const atY = 0.9;
  close(leanHoldN(geometry, weightN, atY, 0.2), weightN * 0.2 / 0.9, 1e-9, "the lean's moment over the arm");
  assert.equal(leanHoldN(geometry, weightN, 0, 0.2), Infinity, "a force at the feet tips nothing");
  assert.equal(leanHoldN(null, weightN, atY, 0.2), 0, "a body with no reading holds nothing");
  assert.equal(leanHoldN(geometry, weightN, atY, 0), 0, "and one with no room nothing past its reach");
  // One second of the ledger: what is filed past the lean, at its lever, less the righting.
  const net = (forceN, dir) => {
    const hold = leanHoldN(geometry, weightN, atY, leanRoomM(geometry.hull, dir, 0));
    const filed = Math.max(0, forceN - hold) * leverAt(geometry, atY) / massKg;
    return filed - rockingDecayMps2(geometry.comHeightM, baseReachM(geometry.hull, dir, 0));
  };
  for (const dir of [1, -1]) {
    const line = weightN * 0.34 / atY;
    assert.ok(net(line * 1.01, dir) > 0, `1 % past the whole depth it tips (${dir})`);
    assert.ok(net(line * 0.99, dir) < 0, `1 % under it the lean holds (${dir})`);
    // The control: without the lean it would go at its reach alone, well under the line.
    const reach = baseReachM(geometry.hull, dir, 0);
    const rigid = (forceN) => forceN * leverAt(geometry, atY) / massKg - rockingDecayMps2(geometry.comHeightM, reach);
    assert.ok(rigid(weightN * reach / atY * 1.01) > 0, `a rigid body goes at its reach (${dir})`);
  }
});

/**
 * A block standing on the arena floor, struck horizontally at `atY` by `impulse` N.s; whether it
 * went over within four seconds. Real Havok, headless arena, friction high enough that it pivots
 * rather than slides.
 */
async function strikeBlock(size, mass, atY, impulse) {
  const arena = await createHeadlessArena();
  try {
    const block = boxPart(arena.scene, { name: "block", position: new Vector3(0, size.y / 2 + 0.001, 0),
      size, mass, layer: LAYER.DEBRIS, collidesWith: LAYER.WORLD, friction: 1.5, restitution: 0 });
    const step = () => { arena.scene._renderId += 1; arena.scene._advancePhysicsEngineStep(1000 / 60); };
    for (let i = 0; i < 30; i += 1) step();
    block.body.applyImpulse(new Vector3(impulse, 0, 0), new Vector3(block.mesh.position.x - size.x / 2, atY, 0));
    const up = new Vector3();
    let lowest = 1;
    for (let i = 0; i < 240; i += 1) {
      step();
      Vector3.UpReadOnly.rotateByQuaternionToRef(block.mesh.rotationQuaternion ?? Quaternion.Identity(), up);
      lowest = Math.min(lowest, up.y);
    }
    return lowest < 0.3;
  } finally {
    arena.dispose();
  }
}

/**
 * **The formula against the solver** (physical contact session 08). Bisected in the same harness,
 * the impulse that tips each block is 0.941, 1.009 and 0.940 of the prediction (0.3 x 1.2 x 0.3 m,
 * 100 kg, struck at 0.9 m; 0.4 x 1.0 x 0.4, 60 kg at 0.5; 0.3 x 1.6 x 0.5, 200 kg at 1.4). So the
 * tolerance is 15 %: a blow 15 % under the line leaves the block standing and one 15 % over puts it
 * down, which a factor of sqrt(2) anywhere in the line, or a lever read from the wrong height, does
 * not survive.
 */
test("a rigid block tips at the impulse the rocking body predicts, within 15 %", async () => {
  for (const { size, mass, atY } of [
    { size: new Vector3(0.3, 1.2, 0.3), mass: 100, atY: 0.9 },
    { size: new Vector3(0.4, 1.0, 0.4), mass: 60, atY: 0.5 },
  ]) {
    const h = size.y / 2;
    const geometry = tippingGeometry(massDistributionOf([{ massKg: mass, x: 0, y: h, z: 0 }]),
      [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: sx * size.x / 2, y: 0, z: sz * size.z / 2 }))));
    const k = Math.sqrt((size.x ** 2 + size.y ** 2) / 12);
    const predicted = mass * tippingLineMps(geometry.comHeightM, k, baseReachM(geometry.hull, 1, 0))
      / leverAt(geometry, atY);
    assert.equal(await strikeBlock(size, mass, atY, predicted * 0.85), false, `${size} stood at 0.85`);
    assert.equal(await strikeBlock(size, mass, atY, predicted * 1.15), true, `${size} went over at 1.15`);
  }
});
