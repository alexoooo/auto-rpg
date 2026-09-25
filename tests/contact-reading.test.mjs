import test from "node:test";
import assert from "node:assert/strict";

// `CONFIG.combat.contactReading`: a contact scored from the striker's velocity after the solver
// step that found it ("settled", the default) or from the velocity it carried into that step
// ("arrival"). Each test strikes a real standing golem through `Combat` with a hand-made contact,
// between a pre-step sample and a different post-step velocity, and reads which one was scored.

const near = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) <= 1e-6 * Math.max(1, Math.abs(expected)), `${what}: ${actual} against ${expected}`);

async function arena(reading, fraction) {
  const { Logger } = await import("@babylonjs/core/Misc/logger.js");
  const { createBout, freshHavok } = await import("./harness/bout-runner.mjs");
  const { namedBuild } = await import("../src/golem/roster.ts");
  const { Combat } = await import("../src/combat.ts");
  const { CONFIG } = await import("../src/config.ts");
  Logger.LogLevels = Logger.ErrorLogLevel;
  const setup = namedBuild("default").setup;
  const bout = createBout({ left: "idle", right: "idle", leftGolem: setup, rightGolem: setup,
    locomotionMode: "supported", physics: await freshHavok(), seeds: [1, 2] });
  for (let i = 0; i < 30; i++) bout.step();
  const striker = bout.left.strikers.find((s) => s.kind === "sword");
  assert.ok(striker, "the control: a blade to strike with");
  const saved = { reading: CONFIG.combat.contactReading, fraction: CONFIG.combat.arrivalReadFraction };
  CONFIG.combat.contactReading = reading;
  CONFIG.combat.arrivalReadFraction = fraction;
  let combat;
  try { combat = new Combat("left", [striker]); }
  finally { CONFIG.combat.contactReading = saved.reading; CONFIG.combat.arrivalReadFraction = saved.fraction; }
  combat.advance(1);
  combat.attach(bout.right);
  const scene = striker.body.transformNode.getScene();
  return { bout, striker, combat, scene };
}

/**
 * The blade arrives with `before` (linear, angular) as a solver step begins, leaves it with `after`,
 * and the contact is reported at `offset` from its centre of mass.
 */
async function strike({ striker, scene }, body, before, after, offset) {
  const { PhysicsEventType } = await import("@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js");
  striker.body.setLinearVelocity(before.linear);
  striker.body.setAngularVelocity(before.angular);
  // What runs before every solver step. No solver step follows, so nothing else moves the blade.
  scene.onBeforePhysicsObservable.notifyObservers(scene);
  striker.body.setLinearVelocity(after.linear);
  striker.body.setAngularVelocity(after.angular);
  const point = striker.centreOfMass().add(offset);
  striker.body.getCollisionObservable().notifyObservers({ collider: striker.body, collidedAgainst: body,
    type: PhysicsEventType.COLLISION_STARTED, point, normal: before.linear.normalizeToNew().scale(-1),
    distance: 0, impulse: 0 });
  return point;
}

async function readings(reading, fraction) {
  const { Vector3 } = await import("@babylonjs/core/Maths/math.vector.js");
  const fixture = await arena(reading, fraction);
  try {
    const core = fixture.bout.right.limbs.find((l) => l.key.endsWith("core"));
    assert.ok(core, "the control: a core to strike");
    const before = { linear: new Vector3(0, 0, 9), angular: new Vector3(4, 0, 0) };
    const after = { linear: new Vector3(0, 0, 2), angular: new Vector3(0, 0, 0) };
    const offset = new Vector3(0, 0.2, 0);
    await strike(fixture, core.part.body, before, after, offset);
    const report = fixture.combat.lastHit;
    assert.ok(report && report.key === core.key, "the control: the contact was scored against the core");
    const arrived = before.linear.add(Vector3.Cross(before.angular, offset));
    return { report, arrived, settled: after.linear };
  } finally { fixture.bout.dispose(); }
}

test("a_settled_reading_scores_the_velocity_the_solver_left_and_an_arrival_reading_the_one_it_was_handed", async () => {
  const settled = await readings("settled", 0.6);
  near(settled.report.speed, settled.settled.length(), "settled speed");
  near(settled.report.closingSpeed, settled.settled.length(), "settled closing");

  // Sampled on both sides of the fraction: 1 is the arrival itself, 0.6 bills six tenths of it.
  for (const fraction of [1, 0.6]) {
    const { report, arrived } = await readings("arrival", fraction);
    near(report.speed, fraction * arrived.length(), `arrival speed at ${fraction}`);
    // The arrival carries the turn about the centre of mass: w x r adds 0.8 m/s along the blow.
    near(report.closingSpeed, fraction * 9.8, `arrival closing at ${fraction}`);
    assert.ok(report.speed > settled.report.speed, "the control: the two readings differ");
  }
});
