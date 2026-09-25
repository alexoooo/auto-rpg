import test from "node:test";
import assert from "node:assert/strict";

// `CONFIG.combat.contactReading`: a contact scored from the striker's velocity after the solver
// step that found it ("settled", the default) or from the velocity it carried into that step
// ("arrival"). Each test strikes a real standing golem through `Combat` with a hand-made contact,
// between a pre-step sample and a different post-step velocity, and reads which one was scored.

const near = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) <= 1e-6 * Math.max(1, Math.abs(expected)), `${what}: ${actual} against ${expected}`);

async function arena(reading, fraction, onRefusal) {
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
  try { combat = new Combat("left", [striker], undefined, onRefusal); }
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

async function guarded(reading, arrivingAt) {
  const { Vector3 } = await import("@babylonjs/core/Maths/math.vector.js");
  const refusals = [];
  const fixture = await arena(reading, 0.54, (event) => refusals.push(event.reason));
  try {
    const core = fixture.bout.right.limbs.find((l) => l.key.endsWith("core"));
    const before = { linear: new Vector3(0, 0, arrivingAt), angular: new Vector3(0, 0, 0) };
    const after = { linear: new Vector3(0, 0, 2), angular: new Vector3(0, 0, 0) };
    await strike(fixture, core.part.body, before, after, new Vector3(0, 0.2, 0));
    return { refusals, scored: fixture.combat.lastHit?.key === core.key };
  } finally { fixture.bout.dispose(); }
}

test("an_arrival_reading_refuses_an_impossible_speed_on_the_speed_it_would_bill", async () => {
  const { CONFIG } = await import("../src/config.ts");
  const flung = 1.5 * CONFIG.combat.impossibleSpeed;
  // A blade the solver flung before the step, slowed to 2 m/s by the step that found the contact.
  // Under arrival the fling is what would be billed, so it is what the guard reads.
  const arrival = await guarded("arrival", flung);
  assert.deepEqual(arrival.refusals, ["impossible-speed"]);
  assert.equal(arrival.scored, false, "a refused contact bills nothing");
  // The controls: settled bills the 2 m/s it read, and an arrival under the guard is scored.
  const settled = await guarded("settled", flung);
  assert.deepEqual(settled.refusals, []);
  assert.equal(settled.scored, true);
  const fast = await guarded("arrival", 0.9 * CONFIG.combat.impossibleSpeed);
  assert.deepEqual(fast.refusals, []);
  assert.equal(fast.scored, true);
});

/**
 * Every part of both bodies moved, rotated and bent between the pre-step sample and the collision
 * callback, the way a solver step moves them: a reading of one instant cannot see it.
 */
async function displaceEveryPart(scene) {
  const { Quaternion, Vector3 } = await import("@babylonjs/core/Maths/math.vector.js");
  const { partBodyOf } = await import("../src/rig.ts");
  let k = 0;
  for (const mesh of scene.meshes) {
    if (!mesh.physicsBody || !partBodyOf(mesh.physicsBody)) continue;
    k += 1;
    mesh.position.addInPlace(new Vector3(0.03 * Math.sin(k), 0.04 * Math.cos(1.7 * k), -0.05 * Math.sin(2.3 * k)));
    const turn = Quaternion.RotationAxis(new Vector3(Math.cos(k), 1, Math.sin(3 * k)).normalize(), 0.12 + 0.05 * Math.sin(k));
    mesh.rotationQuaternion = turn.multiply(mesh.rotationQuaternion ?? Quaternion.Identity());
  }
  assert.ok(k > 20, `the control: both golems' parts were moved (${k})`);
}

async function strikeReport(reading, displace) {
  const { Vector3 } = await import("@babylonjs/core/Maths/math.vector.js");
  const { PhysicsEventType } = await import("@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js");
  const fixture = await arena(reading, 0.6);
  try {
    const { striker, scene, combat, bout } = fixture;
    const core = bout.right.limbs.find((l) => l.key.endsWith("core"));
    striker.body.setLinearVelocity(new Vector3(0, 1, 9));
    striker.body.setAngularVelocity(new Vector3(4, -2, 1));
    scene.onBeforePhysicsObservable.notifyObservers(scene);
    // Havok's manifold is from the step's start: a point on the blade, 0.3 m up it, as it stood then.
    const point = striker.tipPosition().clone().addInPlace(striker.bladeDirection().scale(-0.3));
    const normal = new Vector3(0.2, -0.1, -1).normalize();
    if (displace) await displaceEveryPart(scene);
    striker.body.setLinearVelocity(new Vector3(0, 0, 2));
    striker.body.getCollisionObservable().notifyObservers({ collider: striker.body, collidedAgainst: core.part.body,
      type: PhysicsEventType.COLLISION_STARTED, point, normal, distance: 0, impulse: 0 });
    const report = combat.lastHit;
    assert.ok(report && report.key === core.key, "the control: the contact was scored against the core");
    return report;
  } finally { fixture.bout.dispose(); }
}

const INSTANT = ["speed", "closingSpeed", "strikerMassKg", "partMassKg", "energyJ", "edgeAlignment", "bladeAlignment",
  "tipDistanceM", "transferNs"];

test("an_arrival_reading_describes_the_step_s_start_whatever_the_solver_did_to_the_bodies_after_it", async () => {
  // The contact's point and normal are from the step's start, as Havok's are. Moving every part of
  // both bodies afterwards -- which is what the step does before the callback runs -- must change
  // nothing an arrival reading reports: its velocity, its lever about the centre of mass, both
  // chains' effective masses, the edge, the blade and the tip are all read at that one instant.
  const still = await strikeReport("arrival", false);
  const moved = await strikeReport("arrival", true);
  for (const field of INSTANT) near(moved[field], still[field], `arrival ${field}`);
  for (const axis of ["x", "y", "z"]) near(moved.edge[axis], still.edge[axis], `arrival edge ${axis}`);
  // The control: the same move is visible to a reading that takes the bodies where they stand.
  const settledStill = await strikeReport("settled", false);
  const settledMoved = await strikeReport("settled", true);
  for (const field of ["strikerMassKg", "partMassKg", "edgeAlignment", "tipDistanceM"]) {
    assert.ok(Math.abs(settledMoved[field] - settledStill[field]) > 1e-3 * Math.abs(settledStill[field]),
      `the control: the move shows in a settled ${field} (${settledStill[field]} -> ${settledMoved[field]})`);
  }
});

/** A free 1 kg sphere through one real solver step into a free 20 kg capsule, at `hz`. */
async function sphereThroughTheSolver(reading, hz) {
  const { Logger } = await import("@babylonjs/core/Misc/logger.js");
  const { Quaternion, Vector3 } = await import("@babylonjs/core/Maths/math.vector.js");
  const { createHeadlessArena } = await import("./harness/golem-headless-arena.mjs");
  const { spherePart, capsulePart } = await import("../src/rig.ts");
  const { RigidStrike } = await import("../src/golem/effectors/striker.ts");
  const { effectiveMassAt } = await import("../src/body-inertia.ts");
  const { Combat } = await import("../src/combat.ts");
  const { CONFIG } = await import("../src/config.ts");
  Logger.LogLevels = Logger.ErrorLogLevel;
  const fixture = await createHeadlessArena({ populateDefaultGeometry: false });
  const { scene } = fixture;
  try {
    scene.getPhysicsEngine().setSubTimeStep(1000 / hz);
    const layer = 1 << 12;
    // 20 mm above the capsule, arriving obliquely: 10 m/s along it, 8 down into it, 3 across.
    const ball = spherePart(scene, { name: "ball", position: new Vector3(0.2, 2.15, 0), mass: 1, layer,
      collidesWith: layer, diameter: 0.06 });
    const rod = capsulePart(scene, { name: "rod", position: new Vector3(0, 2, 0), mass: 20, layer, collidesWith: layer,
      rotation: Quaternion.RotationAxis(new Vector3(0, 0, 1), Math.PI / 2), height: 1, radius: 0.1 });
    ball.body.setLinearVelocity(new Vector3(10, -8, 3));
    rod.body.setAngularVelocity(new Vector3(0, 6, 0));
    const striker = new RigidStrike(ball, { kind: "club", effectorId: "ball", hand: null, tipAlong: 0 });
    const limb = { key: "rod", label: "Rod", part: rod, attachment: null, health: 1e9, maxHealth: 1e9, severed: false,
      lastHitAt: -999 };
    const target = { limbs: [limb], strikers: [], limbFor: (body) => (body === rod.body ? limb : undefined),
      parriedBy: () => null, sever: () => {} };
    const saved = CONFIG.combat.contactReading;
    CONFIG.combat.contactReading = reading;
    let combat;
    try { combat = new Combat("left", [striker]); } finally { CONFIG.combat.contactReading = saved; }
    combat.advance(1);
    combat.attach(target);
    // What the step starts from, sampled by hand to price the truth against.
    let start = null;
    scene.onBeforePhysicsObservable.add(() => {
      start ??= { ball: ball.mesh.position.clone(), rod: rod.mesh.position.clone(),
        rodRotation: rod.mesh.rotationQuaternion.clone() };
    });
    let event = null;
    ball.body.getCollisionObservable().add((e) => { event ??= { point: e.point.clone(), normal: e.normal.clone() }; });
    for (let i = 0; i < 3 && !combat.lastHit; i++) {
      scene._renderId += 1;
      scene._advancePhysicsEngineStep(1000 / hz);
    }
    const report = combat.lastHit;
    assert.ok(report && event, `the control: the solver found the contact at ${hz} Hz`);
    const normal = event.normal.normalize();
    const rodAtStart = effectiveMassAt(rod.body, event.point, normal,
      { pose: (body) => (body === rod.body ? { position: start.rod, rotation: start.rodRotation } : null) });
    combat.dispose();
    return { report, rodAtStart, rodNow: effectiveMassAt(rod.body, event.point, normal),
      lever: Vector3.Cross(event.point.subtract(start.ball), normal).length(),
      leverNow: Vector3.Cross(event.point.subtract(ball.mesh.position), normal).length() };
  } finally { fixture.dispose(); }
}

test("a_sphere_is_priced_at_its_own_mass_whatever_the_step_length_under_an_arrival_reading", async () => {
  for (const hz of [240, 120]) {
    const arrival = await sphereThroughTheSolver("arrival", hz);
    // Havok's point is on the sphere where it stood as the step began: no lever about its centre.
    assert.ok(arrival.lever < 1e-4, `the manifold is the step's start at ${hz} Hz: lever ${arrival.lever} m`);
    near(arrival.report.strikerMassKg, 1, `a free 1 kg sphere at ${hz} Hz`);
    near(arrival.report.partMassKg, arrival.rodAtStart, `the struck capsule at its start pose at ${hz} Hz`);
    // The tip of a sphere is its centre, one radius from a point on its surface.
    assert.ok(Math.abs(arrival.report.tipDistanceM - 0.03) < 1e-4, `the sphere's own radius at ${hz} Hz: ${arrival.report.tipDistanceM}`);
    // The control: against where the step left the bodies, the same contact reads a lever the
    // sphere does not have -- the distance it moved in one step -- and a fraction of its mass.
    const settled = await sphereThroughTheSolver("settled", hz);
    assert.ok(settled.leverNow > 0.03, `the control: the step moved the sphere off its lever at ${hz} Hz (${settled.leverNow} m)`);
    assert.ok(settled.report.strikerMassKg < 0.5,
      `the control: a settled reading prices the sphere at ${settled.report.strikerMassKg} kg at ${hz} Hz`);
    assert.ok(Math.abs(settled.rodNow - arrival.rodAtStart) > 1e-3 * arrival.rodAtStart,
      `the control: the capsule turned during the step (${arrival.rodAtStart} -> ${settled.rodNow})`);
  }
});
