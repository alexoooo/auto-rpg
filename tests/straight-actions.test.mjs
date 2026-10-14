import test from "node:test";
import assert from "node:assert/strict";
import { createBody } from "../src/core/body.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { GUARD } from "../src/core/skills/guard.ts";
import { straightPunchExecutor, STRAIGHT_PUNCH } from "../src/core/skills/straight-punch.ts";
import { coreStand } from "./harness/core-stand.mjs";

const around = { heading: 0, placed: true, support: null, walk: null, lower: .05 };
test("the native straight punch prepares, commits, returns and emits pure own-arm commands", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { posture: GUARD, pinned: "lowerTrunk" });
  const body = createBody(stand.built, stand.world, { servoSeconds: .1 });
  const executor = straightPunchExecutor(body, ["straight"], STRAIGHT_PUNCH);
  const request = { id: 1, action: "straight", effector: "hand.right", target: { kind: "point", at: [0, body.view.head.y, .6] } };
  try {
    executor.start(body.view, request, around);
    assert.equal(executor.state.live.stage, "admitting");
    const before = structuredClone(executor.state), claim = executor.command(body.view, 1, around);
    assert.deepEqual(executor.command(body.view, 1, around), claim);
    assert.deepEqual(executor.state, before);
    assert.ok(!Object.keys(claim.posture).some(channel => channel.includes(".left ")));
    let committed = false, intervals = 0, ending;
    body.drive((view, dt) => {
      const result = executor.update(view, committed ? [] : [request], around, dt);
      if (result[0]?.phase === "commit") { committed = true; intervals++; }
      if (result[0]?.ending) ending = result[0].ending;
      const command = executor.state.live ? executor.command(view, 1, around) : {};
      return { posture: { ...GUARD, ...command.posture }, pushes: command.pushes ?? [], handPoses: command.handPoses,
        stance: { feet: ["left", "right"], centre: null, height: view.standing - .05, heading: 0 } };
    });
    stand.step(stand.seconds(1));
    assert.equal(committed, true);
    assert.ok(intervals >= 20);
    assert.deepEqual(ending, { kind: "completed" });
    assert.equal(executor.state.live, null);
    executor.start(body.view, { ...request, id: 2 }, around);
    assert.equal(executor.update(body.view, [], around, 1 / 120)[0].phase, "release");
    assert.deepEqual(executor.state.live.ending, { kind: "cancelled" });
    executor.interrupt(body.view, 2);
    assert.deepEqual([executor.state.live, executor.update(body.view, [], around, 1 / 120)], [null, []], "interrupted, it is forgotten at once");
  } finally { body.dispose(); stand.dispose(); }
});
