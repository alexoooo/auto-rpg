import test from "node:test";
import assert from "node:assert/strict";
import { rapierModule } from "../src/core/physics/rapier.ts";

test("a contact-layer callback defect reaches the world-step caller unchanged", async () => {
  const R = await rapierModule(), world = new R.World({ x: 0, y: 0, z: 0 }), queue = new R.EventQueue(true);
  const failure = new Error("contact layer failed"), marker = {}, hooks = Object.freeze({ marker,
    filterContactPair(...args) { assert.equal(this.marker, marker); assert.equal(args.length, 4); return R.SolverFlags.COMPUTE_IMPULSE; },
    contactLayer() { assert.equal(this.marker, marker); calls++; throw failure; } });
  let calls = 0;
  try {
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic());
    const flags = R.ActiveHooks.MODIFY_SOLVER_CONTACTS | R.ActiveHooks.FILTER_CONTACT_PAIRS;
    world.createCollider(R.ColliderDesc.ball(1).setActiveHooks(flags), body);
    world.createCollider(R.ColliderDesc.ball(1).setTranslation(.5, 0, 0).setActiveHooks(flags));
    assert.throws(() => world.step(queue, hooks), error => error === failure);
    assert.ok(calls > 0, "fixture did not reach its contact material hook");
  } finally { queue.free(); world.free(); }
});
