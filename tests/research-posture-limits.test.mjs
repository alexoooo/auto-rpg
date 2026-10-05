import test from "node:test";
import assert from "node:assert/strict";
import { jointCoordinateMotion } from "../src/core/build/joint-coordinate.ts";
import { leastShare, posed, postureStopDirections, staticBody } from "../research/core-posture-trials.mjs";

test("posture stop directions match measured world-coordinate virtual work", async (t) => {
  const body = await staticBody(undefined, "rapier-coordinate");
  try {
    const posture = { height: 1, pitch: .3, roll: -.2, angles: body.freedoms.map((f, i) => f.lo + (f.hi - f.lo) * (i % 2 ? .35 : .7)) };
    posed(body, posture);
    body.dynamics.update(body.joints.map((joint) => body.freedoms.flatMap((f, i) => f.joint === joint ? [posture.angles[i]] : [])));
    const directions = postureStopDirections(body, posture); let peakError = 0, crossAxis = 0;
    for (const [i, freedom] of body.freedoms.entries()) {
      const measured = jointCoordinateMotion(freedom.joint, freedom.k).row[0].angular;
      for (const [j, other] of body.freedoms.entries()) {
        const expected = other.joint === freedom.joint
          ? measured.reduce((sum, value, k) => sum + value * body.dynamics.axis(j)[k], 0) : 0;
        peakError = Math.max(peakError, Math.abs(directions[i][j] - expected));
        if (i !== j) crossAxis = Math.max(crossAxis, Math.abs(directions[i][j]));
      }
    }
    assert.ok(peakError < 1e-7, `posed-node and reduced-coordinate gradient error ${peakError}`); assert.ok(crossAxis > .1);
    const reference = postureStopDirections({ ...body, limitModel: "parent-axis" }, posture);
    assert.deepEqual(reference, body.freedoms.map((_, i) => body.freedoms.map((_, j) => Number(i === j))));
    assert.throws(() => postureStopDirections({ ...body, limitModel: "unknown" }, posture), /limit model/);
    t.diagnostic(JSON.stringify({ peakError, crossAxis, engine: body.engine }));
  } finally { body.dispose(); }
});

test("the static programme balances coupled stop loads even on channels with no ground contact", async (t) => {
  const built = await staticBody(undefined, "rapier-coordinate");
  try {
    const joint = built.joints.find((j) => j.spec.name === "shoulder.left");
    const freedoms = built.freedoms.filter((f) => f.joint === joint).map((f, k) => ({ ...f, j: 0, k, lo: -2, hi: k ? 2 : .7, plus: 1, minus: 1 }));
    const body = { limitModel: "coordinate", joints: [joint], freedoms, weight: 1, moves: freedoms.map(() => new Set()), contacts: {},
      dynamics: { update() {}, root: { centre: [0, 0, 0], gravity: [0, 0, 0, 0, 0, 0] }, gravity: [0, 0, 0] } };
    const posture = { angles: [.7, -.45, .6] }, direction = postureStopDirections(body, posture)[0];
    body.dynamics.gravity = direction.map((v) => 10 * v);
    const corrected = leastShare(body, { touch: [] }, posture, { snap: true });
    const reference = leastShare({ ...body, limitModel: "parent-axis" }, { touch: [] }, posture, { snap: true });
    assert.equal(corrected.balanced, true); assert.ok(corrected.share < 1e-7);
    assert.ok(corrected.torques.every((value) => Math.abs(value) < 1e-7));
    assert.equal(corrected.stops.length, 1); assert.ok(Math.abs(corrected.stops[0].torque + 10) < 1e-7);
    assert.ok(reference.share > 1, "a diagonal stop falsely leaves the coupled load to muscles");
    const interior = { angles: [.6, -.45, .6] };
    const unloaded = leastShare(body, { touch: [] }, interior, { snap: true });
    assert.ok(unloaded.share >= 10 - 1e-7, "an unreached stop cannot support the load");
    t.diagnostic(JSON.stringify({ direction, corrected: corrected.share, reference: reference.share, interior: unloaded.share }));
  } finally { built.dispose(); }
});
