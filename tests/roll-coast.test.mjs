import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "../src/core/math/vector.ts";
import { turnAboutToRef } from "../src/core/math/turn.ts";
import { rollCoast } from "../src/core/recovery/rise/roll-coast.ts";

test("a side swing is needed for backward momentum, not for an established side or frontward roll", () => {
  const coasts = rollCoast(), belly = [0, 0, 1];
  for (const over of ["left", "right"]) {
    const rotation = turnAboutToRef(Vector3.Forward(), over === "right" ? -Math.PI / 2 : Math.PI / 2, new Quaternion());
    const stage = { kind: "pose", name: "swing", posture: {}, seconds: 1, over, hold: { turned: .5, most: 3 } };
    const saved = rotation.clone();
    for (const [spin, expected] of [[new Vector3(), true], [new Vector3(-2, 0, 0), false], [new Vector3(2, 0, 0), true],
      [new Vector3(-4, 0, 0), false], [new Vector3(4, 0, 0), true], [new Vector3(0, 2, 0), true]]) {
      const before = spin.clone();
      assert.equal(coasts(rotation, spin, stage, belly), expected, `${over}, spin ${spin.asArray()}`);
      assert.deepEqual(spin, before);
      assert.deepEqual(rotation, saved);
    }
    assert.equal(coasts(rotation, new Vector3(), { ...stage, hold: undefined }, belly), false);
  }
});
