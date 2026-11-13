import test from "node:test";
import assert from "node:assert/strict";
import { coreStand } from "../harness/core-stand.mjs";
import { modelSpec } from "../../src/core/bodies/models.ts";
import { withLoadout } from "../../src/core/bodies/items/held.ts";
import { bodyKey } from "../../src/core/bodies/spec/body.ts";
import { dataOf } from "../../src/core/data/store.ts";
import { stockBody } from "../../src/app/stock-body.ts";
import { guardPosture } from "../../src/skills/guard/guard.ts";
import { straightPunchExecutor } from "../../src/skills/strikes/straight-punch.ts";
import { faceOf } from "../../src/skills/strikes/held-blow.ts";

test("a held face prepares with reachable wrist goals under the damped servo", async () => {
  const spec = withLoadout(modelSpec("workshop-fighter"), { left: "empty", right: "sword" }), guard = guardPosture(spec);
  const stand = await coreStand(spec, { posture: guard }), body = stockBody(stand.built, stand.world, { servoSeconds: .1 });
  try {
    const at = [0, body.view.head.y, 1.2], request = { id: 1, action: "thrust", effector: "hand.right", target: { kind: "point", at } };
    const executor = straightPunchExecutor(body, guard, ["thrust"], dataOf("sword-thrust")[bodyKey(spec)].settings, () => at,
      { faces: { right: faceOf(spec, "right", "point") } });
    const around = { heading: 0, lower: 0 };
    executor.start(body.view, request, around);
    const command = executor.command(body.view, 1, around), wrist = spec.joints.find(j => j.name === "wrist.right");
    const channels = wrist.dofs.map(dof => `${wrist.name} ${dof.positive}`);
    assert.ok(channels.some(channel => command.posture[channel] !== guard[channel]), "the face must request an alignment correction");
    assert.deepEqual(command.pushes.filter(push => channels.includes(push.channel)), [], "preparation must retain the wrist servo's damping");
    for (const dof of wrist.dofs) {
      const channel = `${wrist.name} ${dof.positive}`, angle = command.posture[channel];
      assert.ok(angle >= dof.min.value && angle <= dof.max.value, `${channel}: ${angle} outside its stops`);
    }
  } finally { body.dispose(); stand.dispose(); }
});
