import test from "node:test";
import assert from "node:assert/strict";
import { createBody } from "../src/core/body.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { GUARD } from "../src/core/skills/guard.ts";
import { placedReach, recipeExecutor } from "../src/core/skills/strike.ts";
import { coreStand } from "./harness/core-stand.mjs";

const around = { heading: 0, placed: true, support: null, walk: null, lower: .05 };
const dt = 1 / 120;

async function fixture() {
  const spec = humanSpec("workshop-fighter");
  const stand = await coreStand(spec, { posture: GUARD, pinned: "lowerTrunk" });
  const body = createBody(stand.built, stand.world, { servoSeconds: .1 });
  const executor = recipeExecutor(spec, ["jab"], { repertoire: [], guard: GUARD });
  const at = [body.view.head.x, body.view.head.y, body.view.head.z + placedReach(spec, "right", 0)];
  const request = { id: 1, action: "jab", effector: "hand.right", target: { kind: "point", at } };
  return { stand, body, executor, request, dispose() { body.dispose(); stand.dispose(); } };
}

test("recipe admission and command inspection do not advance motion", async () => {
  const f = await fixture();
  try {
    const { executor, body, request } = f;
    assert.deepEqual(executor.readiness(body.view, "jab", "hand.right", request.target, around), { kind: "ready" });
    assert.deepEqual(executor.state, { live: null });
    executor.start(body.view, request, around);
    assert.equal(executor.state.live.stage, "admitting");
    assert.equal(executor.state.live.time, 0);
    const before = structuredClone(executor.state);
    const first = executor.command(body.view, 1, around);
    assert.deepEqual(executor.command(body.view, 1, around), first);
    assert.deepEqual(executor.state, before);
    assert.ok(!Object.keys(first.posture).some(name => name.includes(".left ")));
    assert.deepEqual(executor.needs("jab", "hand.right"), ["hand.right", "trunk", "legs"]);
  } finally { f.dispose(); }
});

test("a cancelled recipe cannot recommit when the same request returns", async () => {
  const f = await fixture();
  try {
    const { executor, body, request } = f;
    executor.start(body.view, request, around);
    assert.deepEqual(executor.update(body.view, [], around, dt), [
      { id: 1, phase: "release", stage: "return", holds: ["hand.right", "trunk", "legs"] },
    ]);
    let ended;
    for (let i = 0; i < 10; i++) {
      const result = executor.update(body.view, [request], around, dt);
      if (result[0]?.ending) { ended = result; break; }
      assert.equal(result[0].phase, "release");
    }
    assert.deepEqual(ended, [{ id: 1, ending: { kind: "cancelled" } }]);
    assert.deepEqual(executor.state, { live: null });
  } finally { f.dispose(); }
});

test("a recipe's committed placed stroke continues after withdrawal and returns under physics", async () => {
  const f = await fixture();
  try {
    const { executor, body, request, stand } = f;
    executor.start(body.view, request, around);
    let committed = false, released = false, ended = null, committedFrames = 0;
    body.drive((view, step) => {
      const changes = executor.update(view, committed ? [] : [request], around, step);
      const change = changes[0];
      if (change?.ending) ended = change.ending;
      if (change?.phase === "commit") { committed = true; committedFrames++; }
      if (change?.phase === "release") released = true;
      const claim = executor.state.live ? executor.command(view, 1, around) : {};
      return { posture: { ...GUARD, ...claim.posture }, effectors: claim.effectors, handPoses: claim.handPoses,
        pushes: claim.pushes ?? [], stance: { feet: ["left", "right"], centre: null, height: view.standing - around.lower, heading: 0 } };
    });
    stand.step(stand.seconds(4));
    assert.equal(committed, true);
    assert.ok(committedFrames >= 40, `committed intervals: ${committedFrames}`);
    assert.equal(released, true);
    assert.ok(ended, "the finite return ends");
    assert.notEqual(ended.kind, "cancelled");
    assert.deepEqual(executor.state, { live: null });
  } finally { f.dispose(); }
});
