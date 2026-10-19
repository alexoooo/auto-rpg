import test from "node:test";
import assert from "node:assert/strict";
import { createBody } from "../src/core/body.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { GUARD } from "../src/core/skills/guard.ts";
import { kickExecutor, KICK_PATH, validKickTuning } from "../src/core/skills/kick.ts";
import { coreStand } from "./harness/core-stand.mjs";

const around = { heading: 0, placed: false, support: null, walk: [.3, 0], lower: .05 };
const dt = 1 / 120;
async function fixture() {
  const stand = await coreStand(humanSpec("workshop-fighter"), { posture: GUARD, pinned: "lowerTrunk", ground: false, gravity: false });
  const body = createBody(stand.built, stand.world, { servoSeconds: .1 });
  const executor = kickExecutor(body, ["kick"], { ...KICK_PATH, startup: 0, setupLimit: .1, recenterLimit: .1 });
  const request = { id: 1, action: "kick", effector: "foot.right", target: { kind: "point", at: [body.view.stance.soles.right.x, .3, body.view.stance.soles.right.z + .45] } };
  return { stand, body, executor, request, dispose() { body.dispose(); stand.dispose(); } };
}

test("kick admission permits braking and quiet support after taking its resources", async () => {
  const f = await fixture();
  try {
    const { body, executor, request } = f;
    assert.deepEqual(executor.readiness(body.view, "kick", "foot.right", request.target, around), { kind: "ready" });
    assert.deepEqual(executor.state.support.loads, { left: 0, right: 0 });
    executor.start(body.view, request, around);
    assert.equal(executor.state.live.stage, "admitting");
    assert.equal(executor.state.live.time, 0);
    const before = structuredClone(executor.state);
    const claim = executor.command(body.view, 1, around);
    const base = { posture: GUARD, pushes: [], stance: null };
    const patch = executor.overlay(body.view, 1, base, around);
    assert.deepEqual(executor.command(body.view, 1, around), claim);
    assert.deepEqual(executor.overlay(body.view, 1, base, around), patch);
    assert.deepEqual(executor.state, before);
    assert.deepEqual(claim.legs, { kind: "hold" });
    assert.deepEqual(patch.stance.feet, ["left", "right"]);
    assert.deepEqual(executor.needs("kick", "foot.right"), ["foot.right", "legs", "trunk"]);
  } finally { f.dispose(); }
});

test("an impossible kick preparation releases within its stated deadlines", async () => {
  const f = await fixture();
  try {
    const { body, executor, request, stand } = f;
    executor.start(body.view, request, around);
    let ending;
    body.drive((view, dt) => {
      const result = executor.update(view, [request], around, dt);
      if (result[0]?.ending) ending = result[0].ending;
      const base = { posture: GUARD, pushes: [], stance: null };
      return executor.state.live ? { ...base, ...executor.overlay(view, 1, base, around) } : base;
    });
    stand.step(stand.seconds(.3));
    assert.deepEqual(ending, { kind: "stalled", reason: "recenter deadline after support setup deadline" });
    assert.equal(executor.state.live, null);
  } finally { f.dispose(); }
});

test("withdrawal during kick setup remains a return when its id is listed again", async () => {
  const f = await fixture();
  try {
    const { body, executor, request } = f;
    executor.start(body.view, request, around);
    assert.deepEqual(executor.update(body.view, [], around, dt), [{ id: 1, phase: "release", stage: "recenter", holds: ["foot.right", "legs", "trunk"] }]);
    const result = executor.update(body.view, [request], around, dt);
    assert.deepEqual(result, [{ id: 1, phase: "release", stage: "recenter", holds: ["foot.right", "legs", "trunk"] }]);
    assert.deepEqual(executor.state.live.ending, { kind: "cancelled" });
  } finally { f.dispose(); }
});

test("kick durations and bounded execution are validated before a physical body is driven", () => {
  assert.equal(validKickTuning(KICK_PATH),true);
  for(const key of ["setupLimit","transferLimit","transferSeconds","chamberSeconds","swingSeconds","returnSeconds",
    "prepareLimit","returnLimit","hold","placeSeconds","placeLimit","recenterLimit","contactSpeed","response"])
    assert.equal(validKickTuning({...KICK_PATH,[key]:0}),false,key);
  assert.equal(validKickTuning({...KICK_PATH,rotationError:1.1}),false);
  assert.equal(validKickTuning({...KICK_PATH,normalAlignment:1.1}),false);
  assert.equal(validKickTuning({...KICK_PATH,soleTurn:1.1}),false);
  assert.equal(validKickTuning({...KICK_PATH,lift:NaN}),false);
});
