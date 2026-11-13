import test from "node:test";
import assert from "node:assert/strict";
import { modelSpec } from "../../src/core/bodies/models.ts";
import { withLoadout } from "../../src/core/bodies/items/held.ts";
import { guardPosture } from "../../src/skills/guard/guard.ts";

test("the guard requests reachable angles on empty and equipped arms", () => {
  for (const model of ["workshop-fighter", "workshop-rogue", "crypt-skeleton"]) {
    for (const right of ["empty", "club", "sword"]) {
      const spec = withLoadout(modelSpec(model), { left: "empty", right }), posture = guardPosture(spec);
      const named = [];
      for (const joint of spec.joints) for (const dof of joint.dofs) {
        const channel = `${joint.name} ${dof.positive}`, angle = posture[channel];
        if (angle === undefined) continue;
        named.push(channel);
        assert.ok(angle >= dof.min.value && angle <= dof.max.value, `${model} ${right} ${channel}: ${angle} outside ${dof.min.value}..${dof.max.value}`);
      }
      assert.deepEqual(named.sort(), Object.keys(posture).sort());
    }
  }
});
