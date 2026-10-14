import test from "node:test";
import assert from "node:assert/strict";
import { createBody } from "../src/core/body.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { GUARD } from "../src/core/skills/guard.ts";
import { pathExecutor } from "../src/core/skills/combat.ts";
import { ATTACK_PATH } from "../src/core/skills/attack-path.ts";
import { placedReach } from "../src/core/skills/strike.ts";
import { coreStand } from "./harness/core-stand.mjs";

const around = { heading: 0, placed: true, support: null, walk: null, lower: .05 };
const dt = 1 / 120;
async function fixture(settings = {}) {
  const spec = humanSpec("workshop-fighter");
  const stand = await coreStand(spec, { posture: GUARD, pinned: "lowerTrunk" });
  const body = createBody(stand.built, stand.world, { servoSeconds: .1 });
  const executor = pathExecutor(body, [{ name: "jab", family: "straight" }, { name: "cross", family: "cross" }],
    { paths: { ...ATTACK_PATH, startup: 0 }, ...settings });
  const at = [body.view.head.x, body.view.head.y, body.view.head.z + placedReach(spec, "right", 0)];
  const request = { id: 1, action: "jab", effector: "hand.right", target: { kind: "point", at } };
  return { stand, body, executor, request, dispose() { body.dispose(); stand.dispose(); } };
}

test("path footprints follow the action and command inspection is pure", async () => {
  const f = await fixture();
  try {
    const { body, executor, request } = f;
    assert.deepEqual(executor.needs("jab", "hand.right"), ["hand.right"]);
    assert.deepEqual(executor.needs("cross", "hand.left"), ["hand.left", "trunk"]);
    executor.start(body.view, request, around);
    const before = structuredClone(executor.state);
    const command = executor.command(body.view, request.id, around);
    assert.deepEqual(executor.command(body.view, request.id, around), command);
    assert.deepEqual(executor.state, before);
    assert.deepEqual(Object.keys(command.effectors), ["hand.right"]);
    assert.equal(executor.state.cycles.right.time, 0);
  } finally { f.dispose(); }
});

test("a path action interrupted is forgotten at once, and its hand admits another", async () => {
  const f = await fixture();
  try {
    const { body, executor, request } = f;
    executor.start(body.view, request, around);
    executor.update(body.view, [request], around, dt);
    executor.interrupt(body.view, 2);
    assert.notEqual(executor.state.lives.right, null, "another id leaves it be");
    executor.interrupt(body.view, request.id);
    assert.deepEqual([executor.state.lives.right, executor.update(body.view, [], around, dt)], [null, []]);
    executor.start(body.view, { ...request, id: 2 }, around);
    assert.equal(executor.state.lives.right.request.id, 2);
  } finally { f.dispose(); }
});

test("path withdrawal before its commitment boundary cannot be undone", async () => {
  const f = await fixture();
  try {
    const { body, executor, request } = f;
    executor.start(body.view, request, around);
    assert.deepEqual(executor.update(body.view, [], around, dt), [
      { id: 1, phase: "release", stage: "return", holds: ["hand.right"] },
    ]);
    let ending;
    for (let i = 0; i < 10; i++) {
      const result = executor.update(body.view, [request], around, dt);
      if (result[0]?.ending) { ending = result; break; }
      assert.equal(result[0].phase, "release");
    }
    assert.deepEqual(ending, [{ id: 1, ending: { kind: "cancelled" } }]);
  } finally { f.dispose(); }
});

test("path actions prepare, commit despite withdrawal and return on the core stand", async () => {
  const f = await fixture();
  try {
    const { body, executor, request, stand } = f;
    executor.start(body.view, request, around);
    let committed = false, committedFrames = 0, release = false, ending;
    body.drive((view, dt) => {
      const result = executor.update(view, committed ? [] : [request], around, dt);
      if (result[0]?.phase === "commit") { committed = true; committedFrames++; }
      if (result[0]?.phase === "release") release = true;
      if (result[0]?.ending) ending = result[0].ending;
      const claim = executor.state.lives.right ? executor.command(view, 1, around) : {};
      return { posture: { ...GUARD, ...claim.posture }, effectors: claim.effectors, handPoses: claim.handPoses,
        pushes: claim.pushes ?? [], stance: { feet: ["left", "right"], centre: null, height: view.standing - .05, heading: 0 } };
    });
    stand.step(stand.seconds(3));
    assert.equal(committed, true);
    assert.ok(committedFrames >= 10, `committed intervals: ${committedFrames}`);
    assert.equal(release, true);
    assert.ok(ending, "the bounded return ends");
    assert.notEqual(ending.kind, "cancelled");
  } finally { f.dispose(); }
});
