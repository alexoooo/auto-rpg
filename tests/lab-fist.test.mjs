import assert from "node:assert/strict";
import test from "node:test";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { FINGERS, fistTurns, palmFrame } from "../src/render/fist.ts";
import { loadGlb, restBones } from "../scripts/lab/fist-probe.mjs";

const POSE = {
  fingers: {
    index: { mcp: 65, pip: 85, dip: 55 },
    middle: { mcp: 70, pip: 95, dip: 60 },
    ring: { mcp: 75, pip: 80, dip: 50 },
    pinky: { mcp: 80, pip: 75, dip: 45 },
  },
  thumb: [
    { forward: 0.44, palmar: 0.71, radial: 0.55 },
    { forward: 0.52, palmar: 0.69, radial: -0.5 },
    { forward: 0.69, palmar: 0, radial: -0.73 },
  ],
};
const UP = new Vector3(0, 1, 0);

/** Each bone's direction in its hand's frame, with `turns` on the rest locals. */
function directions(bones, side, turns) {
  const orientation = new Map([[`hand_${side}`, Quaternion.Identity()]]);
  const of = (name) => {
    if (!orientation.has(name)) {
      const bone = bones.get(name);
      const local = turns.has(name) ? bone.rotation.multiply(turns.get(name)) : bone.rotation;
      orientation.set(name, of(bone.parent).multiply(local));
    }
    return orientation.get(name);
  };
  return (name) => UP.applyRotationQuaternion(of(name));
}

for (const model of ["workshop-fighter", "workshop-rogue"]) {
  const glb = await loadGlb(model);
  test(`${model}: each finger closes in its own flexion plane, to the angles asked, on both hands`, () => {
    const read = {};
    for (const side of ["r", "l"]) {
      const bones = restBones(glb, side), palm = palmFrame(bones, side), dir = directions(bones, side, fistTurns(bones, side, POSE));
      read[side] = {};
      for (const finger of FINGERS) {
        read[side][finger] = [1, 2, 3].map((joint) => {
          const d = dir(`${finger}_0${joint}_${side}`);
          // In the plane across the knuckles: a fist whose fingers sweep sideways fails here.
          assert.ok(Math.abs(Vector3.Dot(d, palm.flexion)) < 1e-6, `${finger}_0${joint}_${side} leaves its plane`);
          return Math.round(Math.atan2(Vector3.Dot(d, palm.palmar), Vector3.Dot(d, palm.forward)) * 180 / Math.PI * 1000) / 1000;
        });
      }
      for (const [k, aim] of POSE.thumb.entries()) {
        const d = dir(`thumb_0${k + 1}_${side}`);
        const want = palm.forward.scale(aim.forward).add(palm.palmar.scale(aim.palmar)).add(palm.radial.scale(aim.radial)).normalize();
        assert.ok(Vector3.Distance(d, want) < 1e-6, `thumb_0${k + 1}_${side} misses its aim`);
      }
    }
    const wrap = (a) => ((a % 360) + 360) % 360;
    const asked = Object.fromEntries(FINGERS.map((f) => {
      const { mcp, pip, dip } = POSE.fingers[f];
      return [f, [mcp, mcp + pip, mcp + pip + dip].map(wrap)];
    }));
    assert.deepEqual(Object.fromEntries(Object.entries(read.r).map(([f, a]) => [f, a.map(wrap)])), asked);
    assert.deepEqual(Object.fromEntries(Object.entries(read.l).map(([f, a]) => [f, a.map(wrap)])), asked);
  });

  test(`${model}: the palm's frame is right-handed about the flexion axis, and radial points to the index`, () => {
    for (const side of ["r", "l"]) {
      const bones = restBones(glb, side), palm = palmFrame(bones, side);
      // Turning forward by a right angle about the flexion axis gives palmar.
      const turned = palm.forward.applyRotationQuaternion(Quaternion.RotationAxis(palm.flexion, Math.PI / 2));
      assert.ok(Vector3.Distance(turned, palm.palmar) < 1e-9);
      const index = bones.get(`index_01_${side}`).position, pinky = bones.get(`pinky_01_${side}`).position;
      assert.ok(Vector3.Dot(index.subtract(pinky), palm.radial) > 0);
    }
  });
}
